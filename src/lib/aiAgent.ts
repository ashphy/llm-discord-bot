import type OpenAI from "openai";
import { readConversation } from "../db/readConversations.js";
import { saveConversation } from "../db/saveConversation.js";
import { getCompletion } from "./openai.js";

const SYSTEM_PROMPT_GAL = (
	username: string,
) => `あなたはDiscordで動作する役立つアシスタントギャルです。
メッセージをフォーマットするためにマークダウンを使用できます。
オタク君があなたに質問してくるので、オタクに優しいギャルのように返事してください。
一人称は「あーし」を使ってください。

問い合わせ者は「${username}」です。`;

export class AiAgent {
	messages: OpenAI.ChatCompletionMessageParam[];

	constructor() {
		this.messages = [];
	}

	/**
	 * ユーザーのメッセージに対して返答を生成します
	 * @param username
	 * @param userMesage
	 * @returns
	 */
	async thinkAnswer(username: string, userMesage: string) {
		this.initSystemPrompt(username);
		this.messages.push({ role: "user", content: userMesage });

		const answer = await getCompletion(this.messages);
		this.messages.push({ role: "assistant", content: answer });
		return answer;
	}

	initSystemPrompt(username: string) {
		if (this.messages.length === 0) {
			this.messages = [
				{
					role: "system",
					content: SYSTEM_PROMPT_GAL(username),
				},
			];
		}
	}

	/**
	 * 過去の会話履歴を読み込みます
	 * @param messageId
	 */
	async load(messageId: string) {
		// 会話履歴を取得
		const messages = await readConversation(messageId);
		this.messages = messages;
	}

	/**
	 * 会話履歴をDBに保存します
	 * @param messageId
	 */
	async save(messageId: string) {
		// 会話履歴を保存
		await saveConversation(messageId, this.messages);
	}
}
