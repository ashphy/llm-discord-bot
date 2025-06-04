import { readConversation } from "../db/readConversations.js";
import { saveConversation } from "../db/saveConversation.js";
import { mastra } from "../mastra/index.js";
import { convertResponseMessageToCoreMessage } from "../utils/convertResponseMessageToCoreMessage.js";
import type { Conversation } from "./conversation.js";
import { moderate } from "./moderation.js";

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

		const agent = mastra.getAgent("discordAgent");
		const stream = await agent.stream(this.conversation.messages, {
			maxSteps: 10,
			onFinish: (result) => {
				const responseAssistantMessages = convertResponseMessageToCoreMessage(
					result.response.messages,
				);
				this.conversation.messages.push(...responseAssistantMessages);
			},
		});

		let text = "";
		for await (const chunk of stream.fullStream) {
			switch (chunk.type) {
				case "step-start":
					await callbacks.onStepStart?.();
					break;
				case "text-delta":
					text += chunk.textDelta;
					break;
				case "tool-call":
					if (text.length > 0) {
						await callbacks.onTextMessage?.(text);
					}
					text = "";
					await callbacks.onToolCall?.(chunk.toolName);
					break;
				case "error":
					console.error("Error in AI agent:", chunk.error);
					await callbacks.onError?.(chunk.error);
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
