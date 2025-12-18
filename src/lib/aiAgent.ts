import { run } from "node:test";
import { RuntimeContext } from "@mastra/core/runtime-context";
import { readConversation } from "../db/readConversations.js";
import { saveConversation } from "../db/saveConversation.js";
import { mastra } from "../mastra/index.js";
import type { Conversation } from "./conversation.js";
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
	) {
		const isModerationFlagged = await moderate(userMesage);
		if (isModerationFlagged) {
			throw new Error(
				"このリクエストはモデレーションフィルタにより制限されました。",
			);
		}

		this.conversation.messages.push({
			role: "user",
			content: `<username>${username}</username>
<userMessage>${userMesage}</userMessage>`,
		});

		const runtimeContext = new RuntimeContext<LLMBotRuntimeContext>();
		runtimeContext.set("userId", userId);

		const agent = mastra.getAgent("discordAgent");
		const stream = await agent.stream(this.conversation.messages, {
			maxSteps: 30,
			runtimeContext,
			onFinish: (result) => {
				if (result.response.messages) {
					this.conversation.messages.push(...result.response.messages);
				}
			},
		});

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
