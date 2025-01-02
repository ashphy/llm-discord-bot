export type Provider = {
	id: string;
};

export const Proviers: Provider[] = [
	{
		id: "openai",
	},
	{
		id: "gemini",
	},
] as const;

export type ProvierNames = (typeof Proviers)[number]["id"];