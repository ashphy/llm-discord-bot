import { describe, expect, it, vi } from "vitest";

vi.mock("../../env.js", () => ({ env: {} }));

const { truncateContent } = await import("./WebPageScrapingTool.js");

describe("truncateContent", () => {
	it("上限以下ならそのまま返す", () => {
		expect(truncateContent("abc", 3)).toEqual({
			content: "abc",
			truncated: false,
			originalBytes: 3,
		});
	});

	it("上限を超えたら上限のバイト数までに切り詰める", () => {
		expect(truncateContent("abcdef", 4)).toEqual({
			content: "abcd",
			truncated: true,
			originalBytes: 6,
		});
	});

	it("マルチバイト文字の途中で切らない", () => {
		// 「あ」は UTF-8 で3バイト
		expect(truncateContent("あいう", 7)).toEqual({
			content: "あい",
			truncated: true,
			originalBytes: 9,
		});
	});
});
