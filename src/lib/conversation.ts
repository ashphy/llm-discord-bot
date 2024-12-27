import type { Model } from "./models.js";

export type Message = {
	role: "user" | "assistant";
	content: string;
};

export type Conversation = {
	model: Model;
	systemInstruction: string;
	messages: Message[];
};
