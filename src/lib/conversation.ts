import type { Model } from "./models.js";

export type Message = {
	role: "user" | "assistant";
	content: string;
	name?: string | undefined;
	datetime?: string | undefined;
};

export type Conversation = {
	model: Model;
	systemInstruction: string;
	messages: Message[];
};
