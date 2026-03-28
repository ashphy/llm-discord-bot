import { describe, expect, it } from "vitest";
import { snip } from "./snip.js";

describe("snip", () => {
	it("空文字はそのまま返す", () => {
		expect(snip("")).toBe("");
	});

	it("100文字以下のテキストはそのまま返す", () => {
		expect(snip("hello")).toBe("hello");
	});

	it("ちょうど100文字のテキストはそのまま返す", () => {
		const text = "a".repeat(100);
		expect(snip(text)).toBe(text);
	});

	it("101文字のテキストは100文字+省略記号に切り詰める", () => {
		const text = "a".repeat(101);
		const result = snip(text);
		expect(result).toBe(`${"a".repeat(100)}…`);
		expect(result).toHaveLength(101); // 100 + "…"
	});

	it("日本語テキストも文字数ベースで切り詰める", () => {
		const text = "あ".repeat(101);
		const result = snip(text);
		expect(result).toBe(`${"あ".repeat(100)}…`);
	});
});
