import OpenAI from "openai";
import { env } from "../env.js";

export const getCompletion = async (
	messages: OpenAI.ChatCompletionMessageParam[],
): Promise<string> => {
	const client = new OpenAI({
		apiKey: env.OPENAI_API_KEY,
	});

	const chatCompletion = await client.chat.completions.create({
		messages: messages,
		model: "gpt-4o",
		max_tokens: 1000,
	});

	return chatCompletion.choices[0].message.content || "";
};
