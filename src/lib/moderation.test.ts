import type { ModelMessage } from "ai";
import { describe, expect, it, vi } from "vitest";

vi.mock("../env.js", () => ({
	env: {
		BOT_TOKEN: "test-token",
		OPENAI_API_KEY: "test-key",
		GOOGLE_GENERATIVE_AI_API_KEY: "test-key",
		ANTHROPIC_API_KEY: "test-key",
		PERPLEXITY_API_KEY: "test-key",
		FIRECRAWL_API_KEY: "test-key",
	},
}));

const { extractTextFromMessages } = await import("./moderation.js");

describe("extractTextFromMessages", () => {
	it("systemメッセージのcontentを抽出する", () => {
		const messages: ModelMessage[] = [
			{ role: "system", content: "You are a helpful assistant" },
		];
		expect(extractTextFromMessages(messages)).toEqual([
			"You are a helpful assistant",
		]);
	});

	it("userメッセージ（文字列）を抽出する", () => {
		const messages: ModelMessage[] = [{ role: "user", content: "Hello" }];
		expect(extractTextFromMessages(messages)).toEqual(["Hello"]);
	});

	it("userメッセージ（parts配列）からtextパートを抽出する", () => {
		const messages: ModelMessage[] = [
			{
				role: "user",
				content: [{ type: "text", text: "Hello from parts" }],
			},
		];
		expect(extractTextFromMessages(messages)).toEqual(["Hello from parts"]);
	});

	it("assistantメッセージ（文字列）を抽出する", () => {
		const messages: ModelMessage[] = [
			{ role: "assistant", content: "I can help" },
		];
		expect(extractTextFromMessages(messages)).toEqual(["I can help"]);
	});

	it("assistantメッセージ（parts配列）からtextパートを抽出する", () => {
		const messages: ModelMessage[] = [
			{
				role: "assistant",
				content: [{ type: "text", text: "Reply text" }],
			},
		];
		expect(extractTextFromMessages(messages)).toEqual(["Reply text"]);
	});

	it("toolロールのメッセージはフィルタされる", () => {
		const messages: ModelMessage[] = [
			{
				role: "tool",
				content: [],
			} as ModelMessage,
		];
		expect(extractTextFromMessages(messages)).toEqual([]);
	});

	it("複数のメッセージを正しく処理する", () => {
		const messages: ModelMessage[] = [
			{ role: "system", content: "System prompt" },
			{ role: "user", content: "User question" },
			{ role: "assistant", content: "Assistant reply" },
		];
		expect(extractTextFromMessages(messages)).toEqual([
			"System prompt",
			"User question",
			"Assistant reply",
		]);
	});

	it("空の配列は空の配列を返す", () => {
		expect(extractTextFromMessages([])).toEqual([]);
	});
});
