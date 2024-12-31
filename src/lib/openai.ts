import OpenAI from "openai";
import { env } from "../env.js";
import type { Conversation } from "./conversation.js";
import type { ModelNames } from "./models.js";

const convertConversationToMessages = (
	conversation: Conversation,
): OpenAI.ChatCompletionMessageParam[] => {
	const systemPrompt = {
		role: "system",
		content: conversation.systemInstruction,
	} as const;
	const history = conversation.messages.map((message) => {
		return {
			role: message.role,
			content: message.content,
		};
	});

	return [systemPrompt, ...history];
};

export const getCompletion = async (
	model: string,
	conversation: Conversation,
): Promise<string> => {
	const client = new OpenAI({
		apiKey: env.OPENAI_API_KEY,
	});

	const chatCompletion = await client.chat.completions.create({
		messages: convertConversationToMessages(conversation),
		model: model,
		max_tokens: 1000,
	});

	return chatCompletion.choices[0].message.content || "";
};
