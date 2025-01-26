import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env.js";
import type { Conversation } from "./conversation.js";

const convertConversationToMessages = (
	conversation: Conversation,
): Anthropic.MessageParam[] => {
	const history = conversation.messages.map((message) => {
		const content =
			message.name === undefined
				? String(message.content)
				: `User Name: ${message.name}
Query: ${String(message.content)}`;
		return {
			role: message.role,
			content: content,
		};
	});

	return history;
};

export const getClaudeCompletion = async (
	model: string,
	conversation: Conversation,
): Promise<string> => {
	const client = new Anthropic({
		apiKey: env.ANTHROPIC_API_KEY, // This is the default and can be omitted
	});

	const message = await client.messages.create({
		system: conversation.systemInstruction,
		messages: convertConversationToMessages(conversation),
		model: model,
		max_tokens: 2000,
	});

	return message.content
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("\n");
};
