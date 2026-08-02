import { APICallError } from "ai";
import type { AttachmentBuilder, Message } from "discord.js";
import { describe, expect, it } from "vitest";
import {
	convertErrorMessage,
	convertToolName,
	extractLargeCodeBlocks,
	getFileExtension,
	getMinCodeLines,
	type ReplyPart,
	useReplyMessage,
} from "./useReplyMessage.js";

describe("convertToolName", () => {
	it("既知のツール名を表示名に変換する", () => {
		expect(convertToolName("CodeExecutionTool")).toBe(
			"Code Execution (gemini-3.1-pro-preview)",
		);
		expect(convertToolName("MathTool")).toBe("Math Tool");
		expect(convertToolName("WebPageScrapingTool")).toBe(
			"Web Page Scraping (FireCrawl)",
		);
		expect(convertToolName("WebResearchTool")).toBe(
			"Web Research (gemini-3.5-flash with Google Search)",
		);
		expect(convertToolName("CodeGenerationTool")).toBe(
			"Code Generation (gpt-5.2)",
		);
		expect(convertToolName("DeepThinkTool")).toBe(
			"Deep Think (gemini-3.1-pro-preview)",
		);
		expect(convertToolName("YouTubeAnalysisTool")).toBe(
			"YouTube Analysis (gemini-3.5-flash)",
		);
	});

	it("未知のツール名はそのまま返す", () => {
		expect(convertToolName("UnknownTool")).toBe("UnknownTool");
	});

	it("空文字はそのまま返す", () => {
		expect(convertToolName("")).toBe("");
	});
});

describe("convertErrorMessage", () => {
	it("通常のErrorオブジェクトを日本語メッセージに変換する", () => {
		const error = new Error("something broke");
		expect(convertErrorMessage(error)).toBe(
			"エラーが発生しました: something broke",
		);
	});

	it("文字列エラーを変換する", () => {
		expect(convertErrorMessage("raw string")).toBe(
			"エラーが発生しました: raw string",
		);
	});

	it("数値エラーを変換する", () => {
		expect(convertErrorMessage(42)).toBe("エラーが発生しました: 42");
	});

	it("nullを変換する", () => {
		expect(convertErrorMessage(null)).toBe("エラーが発生しました: null");
	});

	it("APICallErrorを変換する", () => {
		const error = new APICallError({
			message: "API error",
			url: "https://example.com",
			requestBodyValues: {},
			statusCode: 500,
			isRetryable: false,
		});
		expect(convertErrorMessage(error)).toBe(
			"API呼び出し中にエラーが発生しました",
		);
	});
});

describe("getFileExtension", () => {
	it.each([
		["javascript", ".js"],
		["js", ".js"],
		["typescript", ".ts"],
		["ts", ".ts"],
		["python", ".py"],
		["py", ".py"],
		["java", ".java"],
		["cpp", ".cpp"],
		["c", ".c"],
		["go", ".go"],
		["rust", ".rs"],
		["ruby", ".rb"],
		["php", ".php"],
		["sql", ".sql"],
		["html", ".html"],
		["css", ".css"],
		["json", ".json"],
		["yaml", ".yaml"],
		["shell", ".sh"],
		["bash", ".sh"],
		["powershell", ".ps1"],
		["dockerfile", ".dockerfile"],
	])("%s → %s", (language, expected) => {
		expect(getFileExtension(language)).toBe(expected);
	});

	it("大文字入力を正規化する", () => {
		expect(getFileExtension("JavaScript")).toBe(".js");
		expect(getFileExtension("PYTHON")).toBe(".py");
	});

	it("前後の空白をtrimする", () => {
		expect(getFileExtension("  python  ")).toBe(".py");
	});

	it("未知の言語は.txtを返す", () => {
		expect(getFileExtension("brainfuck")).toBe(".txt");
	});

	it("空文字は.txtを返す", () => {
		expect(getFileExtension("")).toBe(".txt");
	});
});

describe("getMinCodeLines", () => {
	it.each([
		["shell", 15],
		["bash", 15],
		["sh", 15],
		["powershell", 15],
	])("%s → %d", (language, expected) => {
		expect(getMinCodeLines(language)).toBe(expected);
	});

	it("シェル系以外のデフォルトは10", () => {
		expect(getMinCodeLines("python")).toBe(10);
		expect(getMinCodeLines("javascript")).toBe(10);
	});

	it("大文字入力を正規化する", () => {
		expect(getMinCodeLines("BASH")).toBe(15);
	});
});

describe("extractLargeCodeBlocks", () => {
	it("コードブロックがないテキストはそのまま返す", () => {
		const { modifiedText, attachments } = extractLargeCodeBlocks("just text");
		expect(modifiedText).toBe("just text");
		expect(attachments).toHaveLength(0);
	});

	it("閾値未満の短いコードブロックはそのまま保持する", () => {
		const code = "```js\nconst x = 1;\n```";
		const { modifiedText, attachments } = extractLargeCodeBlocks(code);
		expect(modifiedText).toBe(code);
		expect(attachments).toHaveLength(0);
	});

	it("閾値以上の長いコードブロックをファイル添付に変換する", () => {
		const lines = Array.from({ length: 10 }, (_, i) => `line ${i + 1};`);
		const code = `\`\`\`js\n${lines.join("\n")}\n\`\`\``;
		const { modifiedText, attachments } = extractLargeCodeBlocks(code);
		expect(modifiedText).toContain("📎 **code_1.js**");
		expect(attachments).toHaveLength(1);
	});

	it("シェルスクリプトは閾値15行で判定する", () => {
		const lines = Array.from({ length: 12 }, (_, i) => `echo ${i + 1}`);
		const code = `\`\`\`bash\n${lines.join("\n")}\n\`\`\``;
		const { modifiedText, attachments } = extractLargeCodeBlocks(code);
		// 12行はbashの閾値15未満なのでそのまま
		expect(modifiedText).toBe(code);
		expect(attachments).toHaveLength(0);
	});

	it("言語指定なしのコードブロックは.txt拡張子になる", () => {
		const lines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`);
		const code = `\`\`\`\n${lines.join("\n")}\n\`\`\``;
		const { modifiedText, attachments } = extractLargeCodeBlocks(code);
		expect(modifiedText).toContain("📎 **code_1.txt**");
		expect(attachments).toHaveLength(1);
	});

	it("複数のコードブロックを個別に処理する", () => {
		const longLines = Array.from({ length: 10 }, (_, i) => `line ${i + 1};`);
		const text = [
			"前のテキスト",
			`\`\`\`js\n${longLines.join("\n")}\n\`\`\``,
			"間のテキスト",
			`\`\`\`py\n${longLines.join("\n")}\n\`\`\``,
			"後のテキスト",
		].join("\n");
		const { modifiedText, attachments } = extractLargeCodeBlocks(text);
		expect(attachments).toHaveLength(2);
		expect(modifiedText).toContain("📎 **code_1.js**");
		expect(modifiedText).toContain("📎 **code_2.py**");
		expect(modifiedText).toContain("前のテキスト");
		expect(modifiedText).toContain("間のテキスト");
		expect(modifiedText).toContain("後のテキスト");
	});
});

/** 送信されたメッセージを集めながら useReplyMessage を実行するヘルパー */
const sendParts = async (parts: ReplyPart[]) => {
	const sent: { content: string; files?: AttachmentBuilder[] }[] = [];
	const { updateReplyMessage, finishMessage } = useReplyMessage(
		undefined,
		[],
		true,
		{
			onNewMessage: async (_isFirst, _currentMessage, messageOptions) => {
				sent.push(messageOptions);
				return {
					id: "message-id",
					edit: async (options: typeof messageOptions) => {
						sent[sent.length - 1] = options;
					},
				} as unknown as Message<boolean>;
			},
		},
	);

	for (const part of parts) {
		await updateReplyMessage(part);
	}
	finishMessage();

	return sent;
};

describe("useReplyMessage", () => {
	it("GFMの表をDiscord向けに変換して送信する", async () => {
		const table = [
			"| 項目 | 値 |",
			"| --- | --- |",
			...Array.from({ length: 12 }, (_, i) => `| 行${i + 1} | ${i + 1} |`),
		].join("\n");

		const sent = await sendParts([{ type: "text", text: table }]);

		expect(sent).toHaveLength(1);
		expect(sent[0].content).toContain("項目 | 値");
		expect(sent[0].content).not.toContain("| --- |");
		// 変換で生まれたコードブロックはファイル添付にしない
		expect(sent[0].files).toBeUndefined();
	});

	it("長いコードブロックはファイル化し、残りをDiscord向けに変換する", async () => {
		const code = Array.from({ length: 12 }, (_, i) => `line ${i + 1};`).join(
			"\n",
		);
		const text = `#### 見出し\n\n\`\`\`js\n${code}\n\`\`\`\n\n---\n\n終わり`;

		const sent = await sendParts([{ type: "text", text }]);

		expect(sent[0].files).toHaveLength(1);
		// `_` はエスケープされるが、Discordはバックスラッシュを取り除いて描画する
		expect(sent[0].content).toContain("📎 **code\\_1.js** を添付しました");
		expect(sent[0].content).toContain("**見出し**");
		expect(sent[0].content).toContain("-# ────");
	});

	it("tool-callやnoticeのDiscord記法を壊さない", async () => {
		const sent = await sendParts([
			{ type: "text", text: "本文です" },
			{ type: "tool-call", toolName: "MathTool" },
			{ type: "notice", text: "注意" },
		]);

		const content = sent[sent.length - 1].content;
		expect(content).toContain("-# ▷ Math Tool");
		expect(content).toContain("-# ⚠️ 注意");
	});
});
