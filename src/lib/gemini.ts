import { type Content, GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../env.js";
import type { Conversation, Message } from "./conversation.js";
import type { ModelNames } from "./models.js";

const convertRole = (message: Message): "user" | "model" => {
	switch (message.role) {
		case "user":
			return "user";
		case "assistant":
			return "model";
		default:
			message.role satisfies never;
			throw new Error(`Unknown role: ${message.role}`);
	}
};

const convertConversationToMessages = (
	conversation: Conversation,
): { systemInstruction: string; history: Content[]; message: string } => {
	const history = conversation.messages
		.slice(0, conversation.messages.length)
		.map((message) => {
			return {
				role: convertRole(message),
				parts: [
					{
						text: String(message.content),
					},
				],
			};
		});
	return {
		systemInstruction: conversation.systemInstruction,
		history: history,
		message: conversation.messages.at(-1)?.content ?? "",
	};
};

export const getGeminiCompletion = async (
	model: ModelNames,
	conversation: Conversation,
): Promise<string> => {
	const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
	const { systemInstruction, history, message } =
		convertConversationToMessages(conversation);

	const geminiModel = genAI.getGenerativeModel({
		model: model,
		systemInstruction: systemInstruction,
	});

	const generationConfig = {
		temperature: 1,
		maxOutputTokens: 1000,
		responseMimeType: "text/plain",
	};

	const chatSession = geminiModel.startChat({
		generationConfig,
		history: history,
	});

	const result = await chatSession.sendMessage(message);
	return result.response.text();
};
