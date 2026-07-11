import { type GoogleGenerativeAIProviderOptions, google } from "@ai-sdk/google";
import { createTool } from "@mastra/core/tools";
import { generateText } from "ai";
import { z } from "zod";

export const WebResearchTool = createTool({
	id: "Web Research",
	description: `Search the web for up-to-date information using Google Search. 
This tool sends your query to Google Gemini, which retrieves and summarizes relevant information from the internet in real time. 
Use this tool to answer questions that require current or factual data from the web.`,
	inputSchema: z.object({
		question: z
			.string()
			.describe(
				"A clear and specific question or topic to research using up-to-date web information. For best results, provide as much detail as possible.",
			),
	}),
	execute: async ({ question }) => {
		const { text, sources } = await generateText({
			model: google("gemini-3.5-flash"),
			system:
				"Qiita、Zenn、侍エンジニアなど、個人が自由に投稿できる信頼性の低い情報源は参照しないでください。公式ドキュメント、公式ブログ、信頼できるニュースサイトなど、一次情報や信頼性の高い情報源を優先してください。",
			prompt: question,
			tools: {
				google_search: google.tools.googleSearch({}),
			},
			providerOptions: {
				google: {
					thinkingConfig: {
						thinkingLevel: "minimal",
						includeThoughts: false,
					},
				} satisfies GoogleGenerativeAIProviderOptions,
			},
		});

		return { text, sources };
	},
});
