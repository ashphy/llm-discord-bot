import { createTool } from "@mastra/core/tools";
import Firecrawl, { SdkError } from "@mendable/firecrawl-js";
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

/**
 * ツールが返す本文の上限（UTF-8 のバイト数）
 *
 * ツールの結果は会話履歴として DynamoDB に保存され、1項目の上限は 400KB。
 * 複数のリリースを1ページに載せた changelog のように、1ページで上限を超えることがある。
 * Firecrawl には長さを制限するオプションがないため、ここで切り詰める。
 */
export const MAX_CONTENT_BYTES = 50 * 1024;

/**
 * 本文を上限のバイト数までに切り詰めます
 */
export const truncateContent = (
	content: string,
	maxBytes = MAX_CONTENT_BYTES,
): { content: string; truncated: boolean; originalBytes: number } => {
	const buffer = Buffer.from(content, "utf8");
	if (buffer.length <= maxBytes) {
		return { content, truncated: false, originalBytes: buffer.length };
	}
	// 途中で切れたマルチバイト文字は置換文字になるので取り除く
	const truncated = buffer
		.subarray(0, maxBytes)
		.toString("utf8")
		.replace(/\uFFFD+$/, "");
	return { content: truncated, truncated: true, originalBytes: buffer.length };
};

export const WebPageScrapingTool = createTool({
	id: "Web Page Scraping",
	description: "Scrape a web page for specific information.",
	inputSchema: z.object({
		url: z.url().describe("The URL of the web page to scrape."),
	}),
	execute: async ({ url }) => {
		const app = new Firecrawl({
			apiKey: env.FIRECRAWL_API_KEY,
		});

		try {
			const document = await app.scrape(url, {
				formats: ["markdown"],
				onlyMainContent: true,
			});

			const { content, truncated, originalBytes } = truncateContent(
				document.markdown ?? "",
			);

			return {
				title: document.metadata?.title,
				content,
				...(truncated && {
					truncated,
					note: `ページが長いため、全 ${originalBytes} バイトのうち先頭 ${MAX_CONTENT_BYTES} バイトだけを返しています。`,
				}),
			};
		} catch (error) {
			if (error instanceof SdkError) {
				const statusCode = error.status ?? 0;
				const { code, message } = mapStatusCode(statusCode);
				return {
					error: {
						code,
						message,
						statusCode,
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
