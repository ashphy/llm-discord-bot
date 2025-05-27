import { createTool } from "@mastra/core";
import FireCrawlApp from "@mendable/firecrawl-js";
import { z } from "zod";
import { env } from "../../env.js";

export const WebPageScrapingTool = createTool({
	id: "Web Page Scraping",
	description: "Scrape a web page for specific information.",
	inputSchema: z.object({
		url: z.string().url().describe("The URL of the web page to scrape."),
	}),
	execute: async ({ context }) => {
		const app = new FireCrawlApp({
			apiKey: env.FIRECRAWL_API_KEY,
		});
		const scrapeResult = await app.scrapeUrl(context.url, {
			formats: ["markdown"],
			onlyMainContent: true,
		});

		if (scrapeResult.success) {
			const { title, markdown } = scrapeResult;
			return {
				title: title,
				content: markdown,
			};
		}

		return {
			error: scrapeResult.error,
		};
	},
});
