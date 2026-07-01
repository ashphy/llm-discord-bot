import { createTool } from "@mastra/core/tools";
import FireCrawlApp, { FirecrawlError } from "@mendable/firecrawl-js";
import { z } from "zod";
import { env } from "../../env.js";

type ErrorCode =
	| "UNAUTHORIZED"
	| "BAD_REQUEST"
	| "QUOTA_EXCEEDED"
	| "BLOCKED"
	| "TIMEOUT"
	| "RATE_LIMITED"
	| "SERVER_ERROR"
	| "NETWORK_ERROR"
	| "UNKNOWN";

const mapStatusCode = (
	statusCode: number,
): { code: ErrorCode; message: string } => {
	if (statusCode === 0) {
		return {
			code: "NETWORK_ERROR",
			message:
				"ネットワークエラー、または Firecrawl サーバーに到達できません。",
		};
	}
	if (statusCode === 401) {
		return {
			code: "UNAUTHORIZED",
			message: "Firecrawl の API キーが設定されていません。",
		};
	}
	if (statusCode === 400) {
		return {
			code: "BAD_REQUEST",
			message: "URL の形式が不正か、Firecrawl が受理できないリクエストです。",
		};
	}
	if (statusCode === 402) {
		return {
			code: "QUOTA_EXCEEDED",
			message: "Firecrawl の利用枠を使い切りました。",
		};
	}
	if (statusCode === 403) {
		return {
			code: "BLOCKED",
			message:
				"対象サイトがボットアクセスをブロックしています（Cloudflare 等）。",
		};
	}
	if (statusCode === 408) {
		return {
			code: "TIMEOUT",
			message: "ページ読み込みがタイムアウトしました。",
		};
	}
	if (statusCode === 429) {
		return {
			code: "RATE_LIMITED",
			message: "レートリミットに達しました。時間を置いて再試行してください。",
		};
	}
	if (statusCode >= 500) {
		return {
			code: "SERVER_ERROR",
			message: "Firecrawl サーバー側で一時的な障害が発生しています。",
		};
	}
	return {
		code: "UNKNOWN",
		message: "スクレイピングに失敗しました（理由不明）。",
	};
};

export const WebPageScrapingTool = createTool({
	id: "Web Page Scraping",
	description: "Scrape a web page for specific information.",
	inputSchema: z.object({
		url: z.string().url().describe("The URL of the web page to scrape."),
	}),
	execute: async ({ url }) => {
		const app = new FireCrawlApp({
			apiKey: env.FIRECRAWL_API_KEY,
		});

		try {
			const scrapeResult = await app.scrapeUrl(url, {
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
				error: {
					code: "UNKNOWN" satisfies ErrorCode,
					message: "スクレイピングに失敗しました（理由不明）。",
					statusCode: 0,
				},
			};
		} catch (error) {
			if (error instanceof FirecrawlError) {
				const { code, message } = mapStatusCode(error.statusCode);
				return {
					error: {
						code,
						message,
						statusCode: error.statusCode,
					},
				};
			}
			return {
				error: {
					code: "UNKNOWN" satisfies ErrorCode,
					message: "スクレイピングに失敗しました（理由不明）。",
					statusCode: 0,
				},
			};
		}
	},
});
