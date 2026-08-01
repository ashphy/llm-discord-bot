import { RequestContext } from "@mastra/core/di";
import { readConversation } from "../db/readConversations.js";
import { saveConversation } from "../db/saveConversation.js";
import { mastra } from "../mastra/index.js";
import type { Conversation } from "./conversation.js";
import type { StoredImagePart } from "./discordImages.js";
import { hydrateImageParts } from "./imageStore.js";
import { moderate } from "./moderation.js";

type LLMBotRuntimeContext = {
	userId: string;
};

export class AiAgent {
	conversation: Conversation;

	constructor() {
		this.conversation = {
			messages: [],
		};
	}

	/**
	 * ユーザーのメッセージに対して返答を生成します
	 * @param username
	 * @param userMesage
	 * @param images 添付画像（S3への参照を持つパート）
	 * @returns
	 */
	async thinkAnswer(
		userMesage: string,
		userId: string,
		username: string,
		callbacks: {
			onTextMessage?: (text: string) => Promise<void>;
			onToolCall?: (toolName: string) => Promise<void>;
			onError?: (error: unknown) => Promise<void>;
			onFinish?: () => Promise<void>;
			onStepStart?: () => Promise<void>;
		} = {},
		images: StoredImagePart[] = [],
	) {
		const promptText = `<username>${username}</username>
<userMessage>${userMesage}</userMessage>`;

		this.conversation.messages.push({
			role: "user",
			content:
				images.length > 0
					? [{ type: "text", text: promptText }, ...images]
					: promptText,
		});

		const isModerationFlagged = await moderate(this.conversation.messages);
		if (isModerationFlagged) {
			throw new Error(
				"このリクエストはモデレーションフィルタにより制限されました。",
			);
		}

		const requestContext = new RequestContext<LLMBotRuntimeContext>();
		requestContext.set("userId", userId);

		const agent = mastra.getAgent("discordAgent");
		const messages = this.conversation.messages;

		// 会話履歴にはS3への参照だけを保持しているため、送信直前に実体へ差し替える
		const hydratedMessages = await hydrateImageParts(messages);

		const stream = await agent.stream(
			hydratedMessages as Parameters<typeof agent.stream>[0],
			{
				maxSteps: 30,
				requestContext,
				onFinish: ({ response }) => {
					// Mastra が返すのは ai-sdk 内部の ResponseMessage 型で、
					// 構造は ModelMessage と互換だが型としては別物のため変換する
					if (response.messages) {
						messages.push(...(response.messages as typeof messages));
					}
				},
			},
		);

		let text = "";
		for await (const chunk of stream.fullStream) {
			switch (chunk.type) {
				case "step-start":
					await callbacks.onStepStart?.();
					break;
				case "text-delta":
					text += chunk.payload.text;
					break;
				case "tool-call":
					if (text.length > 0) {
						await callbacks.onTextMessage?.(text);
					}
					text = "";
					if (chunk.payload.toolName !== "UpdateWorkingMemoryTool") {
						await callbacks.onToolCall?.(chunk.payload.toolName);
					}
					break;
				case "error":
					console.error("Error in AI agent:", chunk.payload.error);
					await callbacks.onError?.(JSON.stringify(chunk.payload.error));
					break;
			}
		}

		if (text.length > 0) {
			await callbacks.onTextMessage?.(text);
		}

		await callbacks.onFinish?.();
		return text;
	}

	/**
	 * 過去の会話履歴を読み込みます
	 * @param messageId
	 */
	async load(messageId: string) {
		// 会話履歴を取得
		const conversation = await readConversation(messageId);
		if (conversation) {
			this.conversation = conversation;
		}
	}

	/**
	 * 会話履歴をDBに保存します
	 * @param messageId
	 */
	async save(messageId: string) {
		// 会話履歴を保存
		await saveConversation(messageId, this.conversation);
	}
}
