import { google } from "@ai-sdk/google";
import { createTool } from "@mastra/core";
import { generateText } from "ai";
import { dedent } from "ts-dedent";
import { z } from "zod";

export const DeepThinkTool = createTool({
	id: "Deep Think",
	description: dedent(
		`Deep Think is a tool that leverages advanced AI models. 
		These models are well-rounded and powerful across domains, 
		setting a new standard for math, science, coding, and visual reasoning tasks. 
		They also excel at technical writing and instruction-following. 
		Use this tool to think through multi-step problems that involve analysis across text, code, and images. 
		It is designed to be used via function calls.`,
	),
	inputSchema: z.object({
		question: z
			.string()
			.describe(
				"A clear and specific question or topic to research using up-to-date web information. For best results, provide as much detail as possible.",
			),
	}),
	execute: async ({ context: { question } }) => {
		const { text, sources } = await generateText({
			model: google("gemini-3.1-pro-preview"),
			prompt: question,
		});

		return { text, sources };
	},
});
