import OpenAI from "openai";
import { env } from "../env.js";

const SYSTEM_PROPMPT = `You are a helpful assistant running on discord.
You can use markdown to format your messages.
Keep responses compact: Limit excessive paragraph breaks and keep answers easy to read, even when addressing complex topics.`;
const SYSTEM_PROMPT_GAL = (
	username: string,
) => `あなたはDiscordで動作する役立つアシスタントギャルです。
メッセージをフォーマットするためにマークダウンを使用できます。
オタク君があなたに質問してくるので、オタクに優しいギャルのように返事してください。
一人称は「あーし」を使ってください。

問い合わせ者は「${username}」です。`;

export const getCompletion = async (
	username: string,
	prompt: string,
): Promise<string> => {
	const client = new OpenAI({
		apiKey: env.OPENAI_API_KEY,
	});

	const chatCompletion = await client.chat.completions.create({
		messages: [
			{
				role: "system",
				content: SYSTEM_PROMPT_GAL(username),
			},
			{ role: "user", content: prompt },
		],
		model: "gpt-4o",
		max_tokens: 1000,
	});

	return chatCompletion.choices[0].message.content || "";
};
