import { APICallError, TypeValidationError } from "ai";
import { describe, expect, it } from "vitest";
import {
	converErrorMessage,
	convertToolName,
	extractLargeCodeBlocks,
	getFileExtension,
	getMinCodeLines,
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
			"Web Research (gemini-3-flash-preview with Google Search)",
		);
		expect(convertToolName("CodeGenerationTool")).toBe(
			"Code Generation (gpt-5.2)",
		);
		expect(convertToolName("DeepThinkTool")).toBe(
			"Deep Think (gemini-3.1-pro-preview)",
		);
		expect(convertToolName("YouTubeAnalysisTool")).toBe(
			"YouTube Analysis (gemini-3-flash-preview)",
		);
	});

	it("未知のツール名はそのまま返す", () => {
		expect(convertToolName("UnknownTool")).toBe("UnknownTool");
	});

	it("空文字はそのまま返す", () => {
		expect(convertToolName("")).toBe("");
	});
});

describe("converErrorMessage", () => {
	it("通常のErrorオブジェクトを日本語メッセージに変換する", () => {
		const error = new Error("something broke");
		expect(converErrorMessage(error)).toBe(
			"エラーが発生しました: something broke",
		);
	});

	it("文字列エラーを変換する", () => {
		expect(converErrorMessage("raw string")).toBe(
			"エラーが発生しました: raw string",
		);
	});

	it("数値エラーを変換する", () => {
		expect(converErrorMessage(42)).toBe("エラーが発生しました: 42");
	});

	it("nullを変換する", () => {
		expect(converErrorMessage(null)).toBe("エラーが発生しました: null");
	});

	it("APICallErrorを変換する", () => {
		const error = new APICallError({
			message: "API error",
			url: "https://example.com",
			requestBodyValues: {},
			statusCode: 500,
			isRetryable: false,
		});
		expect(converErrorMessage(error)).toBe(
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
