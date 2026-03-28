import { describe, expect, it } from "vitest";
import { sliceChunks } from "./sliceChunks.js";

describe("sliceChunks", () => {
	it("空文字の場合は空配列を返す", () => {
		expect(sliceChunks("")).toEqual([]);
	});

	it("2000文字以下のテキストは1チャンクで返す", () => {
		const result = sliceChunks("hello");
		expect(result).toEqual(["hello"]);
	});

	it("ちょうど2000文字のテキストは1チャンクで返す", () => {
		const text = "a".repeat(2000);
		const result = sliceChunks(text);
		expect(result).toHaveLength(1);
		expect(result[0]).toHaveLength(2000);
	});

	it("2001文字のテキストは2チャンクに分割する", () => {
		const text = "a".repeat(2001);
		const result = sliceChunks(text);
		expect(result).toHaveLength(2);
		expect(result[0]).toHaveLength(2000);
		expect(result[1]).toHaveLength(1);
	});

	it("10000文字のテキストは5チャンクに分割する", () => {
		const text = "a".repeat(10000);
		const result = sliceChunks(text);
		expect(result).toHaveLength(5);
		for (const chunk of result) {
			expect(chunk).toHaveLength(2000);
		}
	});

	it("日本語テキストも文字数ベースで分割する", () => {
		const text = "あ".repeat(2001);
		const result = sliceChunks(text);
		expect(result).toHaveLength(2);
		expect(result[0]).toHaveLength(2000);
		expect(result[1]).toHaveLength(1);
	});

	it("改行を含むテキストも正しく分割する", () => {
		const text = `${"a".repeat(1999)}\n${"b".repeat(500)}`;
		const result = sliceChunks(text);
		expect(result).toHaveLength(2);
		expect(result.join("")).toBe(text);
	});
});
