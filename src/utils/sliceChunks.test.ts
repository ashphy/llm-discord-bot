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

	it("改行を含むテキストは行の境界で分割する", () => {
		const text = `${"a".repeat(1999)}\n${"b".repeat(500)}`;
		const result = sliceChunks(text);
		expect(result).toEqual(["a".repeat(1999), "b".repeat(500)]);
	});

	it("行の途中で割らずに済むなら次のチャンクへ送る", () => {
		const text = `${"a".repeat(1500)}\n${"b".repeat(600)}\n${"c".repeat(10)}`;
		const result = sliceChunks(text);
		expect(result).toEqual([
			"a".repeat(1500),
			`${"b".repeat(600)}\n${"c".repeat(10)}`,
		]);
	});

	it("コードブロックを跨ぐときはフェンスを閉じて開き直す", () => {
		const lines = Array.from({ length: 60 }, (_, i) => `line ${i + 1};`);
		const text = `\`\`\`js\n${lines.join("\n")}\n\`\`\``;
		// 上限を小さく検証できないため、長いコードブロックを作って確認する
		const long = `\`\`\`js\n${Array.from(
			{ length: 300 },
			(_, i) => `const value${i} = ${"x".repeat(10)};`,
		).join("\n")}\n\`\`\``;

		expect(sliceChunks(text)).toEqual([text]);

		const result = sliceChunks(long);
		expect(result.length).toBeGreaterThan(1);
		for (const chunk of result) {
			expect(chunk.length).toBeLessThanOrEqual(2000);
			expect(chunk.startsWith("```js")).toBe(true);
			expect(chunk.endsWith("```")).toBe(true);
			// フェンスの数が偶数（＝開いたまま終わらない）
			expect(chunk.split("```").length - 1).toBe(2);
		}
	});

	it("コードブロックの外では余計なフェンスを足さない", () => {
		const text = `${"a".repeat(1500)}\n\`\`\`js\nconst x = 1;\n\`\`\`\n${"b".repeat(600)}`;
		const result = sliceChunks(text);
		expect(result).toEqual([
			`${"a".repeat(1500)}\n\`\`\`js\nconst x = 1;\n\`\`\``,
			"b".repeat(600),
		]);
	});

	it("コードブロック内の長い1行も閉じ記号を保って分割する", () => {
		const text = `\`\`\`\n${"x".repeat(5000)}\n\`\`\``;
		const result = sliceChunks(text);
		expect(result.length).toBeGreaterThan(1);
		for (const chunk of result) {
			expect(chunk.length).toBeLessThanOrEqual(2000);
			expect(chunk.startsWith("```")).toBe(true);
			expect(chunk.endsWith("```")).toBe(true);
		}
		expect(result.join("").replaceAll("```", "").replaceAll("\n", "")).toBe(
			"x".repeat(5000),
		);
	});

	it("チルダのコードブロックも扱う", () => {
		const text = `~~~\n${"y".repeat(3000)}\n~~~`;
		const result = sliceChunks(text);
		expect(result.length).toBeGreaterThan(1);
		for (const chunk of result) {
			expect(chunk.startsWith("~~~")).toBe(true);
			expect(chunk.endsWith("~~~")).toBe(true);
		}
	});
});
