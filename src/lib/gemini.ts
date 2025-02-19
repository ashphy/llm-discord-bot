import {
	type Content,
	DynamicRetrievalMode,
	GoogleGenerativeAI,
	type ModelParams,
} from "@google/generative-ai";
import { env } from "../env.js";
import type { GroundingMetadata } from "./GroundingMetadata.js";
import type { Conversation, Message } from "./conversation.js";
import type { ModelNames } from "./models.js";

const GroundingModels: ModelNames[] = ["gemini-1.5-pro"];

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
			const text =
				message.name === undefined
					? String(message.content)
					: `User Name: ${message.name}
Datetime: ${message.datetime}
Query: ${String(message.content)}`;
			return {
				role: convertRole(message),
				parts: [
					{
						text: text,
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
	model: string,
	conversation: Conversation,
): Promise<string> => {
	const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
	const { systemInstruction, history, message } =
		convertConversationToMessages(conversation);

	const modelParams: ModelParams = {
		model: model,
		systemInstruction: systemInstruction,
	};

	// 対応しているモデルにはGoogle検索を含める
	if (GroundingModels.includes(model as ModelNames)) {
		modelParams.tools = [
			{
				googleSearchRetrieval: {
					dynamicRetrievalConfig: {
						mode: DynamicRetrievalMode.MODE_DYNAMIC,
						dynamicThreshold: 0.3,
					},
				},
			},
		];
	}

	const geminiModel = genAI.getGenerativeModel(modelParams);

	const generationConfig = {
		temperature: 1,
		maxOutputTokens: 4000,
		responseMimeType: "text/plain",
	};

	const chatSession = geminiModel.startChat({
		generationConfig,
		history: history,
	});

	const result = await chatSession.sendMessage(message);
	const groundingMetadata = result.response.candidates?.[0].groundingMetadata as
		| GroundingMetadata
		| undefined; // Gemini SDKの型定義が間違っている (https://github.com/google-gemini/generative-ai-js/issues/317)

	if (groundingMetadata?.groundingChunks) {
		const sources = groundingMetadata.groundingChunks
			.map((chunk) => {
				return `1. [${chunk.web?.title}](${chunk.web?.uri})`;
			})
			.join("\n");
		return `${result.response.text()}

### 🔍検索ソース
${sources}`;
	}

	return result.response.text();
};
