import type { ModelMessage } from "ai";
import { describe, expect, it, vi } from "vitest";

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock("../env.js", () => ({
	env: {
		BOT_TOKEN: "test-token",
		OPENAI_API_KEY: "test-key",
		GOOGLE_GENERATIVE_AI_API_KEY: "test-key",
		ANTHROPIC_API_KEY: "test-key",
		PERPLEXITY_API_KEY: "test-key",
		FIRECRAWL_API_KEY: "test-key",
		IMAGE_BUCKET_NAME: "test-bucket",
	},
}));

vi.mock("../db/s3.js", () => ({
	s3Client: { send: sendMock },
}));

const {
	hydrateImageParts,
	isSupportedImageMediaType,
	normalizeMediaType,
	parseImageRef,
	toImageRef,
} = await import("./imageStore.js");

describe("isSupportedImageMediaType", () => {
	it("対応しているMIMEタイプを受け付ける", () => {
		expect(isSupportedImageMediaType("image/png")).toBe(true);
		expect(isSupportedImageMediaType("image/jpeg")).toBe(true);
		expect(isSupportedImageMediaType("image/gif")).toBe(true);
		expect(isSupportedImageMediaType("image/webp")).toBe(true);
	});

	it("パラメータ付きでも判定できる", () => {
		expect(isSupportedImageMediaType("image/PNG; charset=utf-8")).toBe(true);
	});

	it("未対応のMIMEタイプを弾く", () => {
		expect(isSupportedImageMediaType("image/svg+xml")).toBe(false);
		expect(isSupportedImageMediaType("application/pdf")).toBe(false);
		expect(isSupportedImageMediaType(null)).toBe(false);
		expect(isSupportedImageMediaType(undefined)).toBe(false);
	});
});

describe("normalizeMediaType", () => {
	it("パラメータを取り除いて小文字にする", () => {
		expect(normalizeMediaType("image/PNG; charset=utf-8")).toBe("image/png");
	});
});

describe("parseImageRef", () => {
	it("S3参照からキーを取り出す", () => {
		expect(parseImageRef(toImageRef("images/1/abc.png"))).toBe(
			"images/1/abc.png",
		);
	});

	it("S3参照でない値はundefinedを返す", () => {
		expect(parseImageRef("https://example.com/a.png")).toBeUndefined();
		expect(parseImageRef("s3://")).toBeUndefined();
		expect(parseImageRef(new Uint8Array([1, 2, 3]))).toBeUndefined();
		expect(parseImageRef(undefined)).toBeUndefined();
	});
});

describe("hydrateImageParts", () => {
	it("S3参照を画像の実体に差し替える", async () => {
		sendMock.mockResolvedValueOnce({
			Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
		});

		const messages: ModelMessage[] = [
			{
				role: "user",
				content: [
					{ type: "text", text: "これは何？" },
					{
						type: "image",
						image: "s3://images/1/abc.png",
						mediaType: "image/png",
					},
				],
			},
		];

		const hydrated = await hydrateImageParts(messages);

		expect(hydrated[0].content).toEqual([
			{ type: "text", text: "これは何？" },
			{
				type: "image",
				image: new Uint8Array([1, 2, 3]),
				mediaType: "image/png",
			},
		]);
	});

	it("元のメッセージは参照のまま書き換えない", async () => {
		sendMock.mockResolvedValueOnce({
			Body: { transformToByteArray: async () => new Uint8Array([1]) },
		});

		const messages: ModelMessage[] = [
			{
				role: "user",
				content: [
					{
						type: "image",
						image: "s3://images/1/abc.png",
						mediaType: "image/png",
					},
				],
			},
		];

		await hydrateImageParts(messages);

		expect(messages[0].content).toEqual([
			{
				type: "image",
				image: "s3://images/1/abc.png",
				mediaType: "image/png",
			},
		]);
	});

	it("取得できない画像はテキストに置き換える", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		sendMock.mockRejectedValueOnce(new Error("NoSuchKey"));

		const messages: ModelMessage[] = [
			{
				role: "user",
				content: [
					{
						type: "image",
						image: "s3://images/1/expired.png",
						mediaType: "image/png",
					},
				],
			},
		];

		const hydrated = await hydrateImageParts(messages);

		expect(hydrated[0].content).toEqual([
			{
				type: "text",
				text: "(添付されていた画像は保存期限が切れているため参照できません)",
			},
		]);
	});

	it("画像を含まないメッセージはS3にアクセスしない", async () => {
		sendMock.mockClear();

		const messages: ModelMessage[] = [
			{ role: "user", content: "こんにちは" },
			{ role: "assistant", content: "やっほー" },
		];

		const hydrated = await hydrateImageParts(messages);

		expect(hydrated).toEqual(messages);
		expect(sendMock).not.toHaveBeenCalled();
	});
});
