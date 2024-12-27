import type { ProvierNames } from "./provider.js";

export type Model = {
	id: string;
	label: string;
	provider: ProvierNames;
};

export const Models: Model[] = [
	{
		id: "gpt-4o",
		label: "GPT-4o",
		provider: "OpenAI",
	},
	{
		id: "gemini-1.5-pro",
		label: "Gemini 1.5 Pro",
		provider: "Gemini",
	},
	{
		id: "gemini-2.0-flash-exp",
		label: "Gemini 2.0 Flash",
		provider: "Gemini",
	},
	{
		id: "gemini-2.0-flash-thinking-exp-1219",
		label: "Gemini 2.0 Flash Thinking Experimental",
		provider: "Gemini",
	},
] as const;

export const DefaultModel = Models[0];

export type ModelNames = (typeof Models)[number]["id"];

export const findModel = (id: string | null | undefined) => {
	if (!id) return Models[0];
	return Models.find((model) => model.id === id);
};
