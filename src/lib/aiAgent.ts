import { readConversation } from "../db/readConversations.js";
import { saveConversation } from "../db/saveConversation.js";
import { getClaudeCompletion } from "./claude.js";
import type { Conversation } from "./conversation.js";
import { getGeminiCompletion } from "./gemini.js";
import { DefaultModel, type Model } from "./models.js";
import { getCompletion } from "./openai.js";
import { SYSTEM_PROMPT_GAL } from "./systemPrompt.js";

export class AiAgent {
	conversation: Conversation;

	constructor(model: Model = DefaultModel) {
		this.conversation = {
			model: model,
			systemInstruction: SYSTEM_PROMPT_GAL(),
			messages: [],
		};
	}

	/**
	 * ユーザーのメッセージに対して返答を生成します
	 * @param username
	 * @param userMesage
	 * @returns
	 */
	async thinkAnswer(userMesage: string, username: string) {
		this.conversation.messages.push({
			role: "user",
			content: userMesage,
			name: username,
			datetime: new Date().toISOString(),
		});

		switch (this.conversation.model.provider) {
			case "OpenAI": {
				const answer = await getCompletion(
					this.conversation.model.id,
					this.conversation,
				);
				this.conversation.messages.push({
					role: "assistant",
					content: answer,
				});
				return answer;
			}
			case "Gemini": {
				const answer = await getGeminiCompletion(
					this.conversation.model.id,
					this.conversation,
				);
				this.conversation.messages.push({
					role: "assistant",
					content: answer,
				});
				return answer;
			}
			case "claude": {
				const answer = await getClaudeCompletion(
					this.conversation.model.id,
					this.conversation,
				);
				this.conversation.messages.push({
					role: "assistant",
					content: answer,
				});
				return answer;
			}
			default:
				throw new Error("Unknown provider");
		}
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
