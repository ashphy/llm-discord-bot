import { describe, expect, it, vi } from "vitest";

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
	s3Client: { send: vi.fn() },
}));

const { selectImageAttachments } = await import("./discordImages.js");
const { MAX_IMAGE_BYTES, MAX_IMAGES_PER_MESSAGE } = await import(
	"./imageStore.js"
);

const attachment = (
	overrides: Partial<{
		name: string;
		url: string;
		size: number;
		contentType: string | null;
	}> = {},
) => ({
	name: "image.png",
	url: "https://cdn.discordapp.com/image.png",
	size: 1024,
	contentType: "image/png",
	...overrides,
});

describe("selectImageAttachments", () => {
	it("対応している画像を受け付ける", () => {
		const result = selectImageAttachments([attachment()]);

		expect(result.accepted).toHaveLength(1);
		expect(result.rejected).toEqual([]);
	});

	it("画像以外の添付ファイルは理由を出さずに無視する", () => {
		const result = selectImageAttachments([
			attachment({ name: "doc.pdf", contentType: "application/pdf" }),
			attachment({ name: "unknown.bin", contentType: null }),
		]);

		expect(result.accepted).toEqual([]);
		expect(result.rejected).toEqual([]);
	});

	it("未対応の画像形式は理由を返す", () => {
		const result = selectImageAttachments([
			attachment({ name: "icon.svg", contentType: "image/svg+xml" }),
		]);

		expect(result.accepted).toEqual([]);
		expect(result.rejected).toEqual([
			"icon.svg: 未対応の画像形式です (JPEG / PNG / GIF / WebP のみ)",
		]);
	});

	it("サイズ上限を超える画像は理由を返す", () => {
		const result = selectImageAttachments([
			attachment({ name: "huge.png", size: MAX_IMAGE_BYTES + 1 }),
		]);

		expect(result.accepted).toEqual([]);
		expect(result.rejected).toEqual([
			"huge.png: 5MBを超える画像は添付できません",
		]);
	});

	it("枚数上限を超えた分は理由を返す", () => {
		const attachments = Array.from(
			{ length: MAX_IMAGES_PER_MESSAGE + 1 },
			(_, i) => attachment({ name: `image${i}.png` }),
		);

		const result = selectImageAttachments(attachments);

		expect(result.accepted).toHaveLength(MAX_IMAGES_PER_MESSAGE);
		expect(result.rejected).toEqual([
			`image${MAX_IMAGES_PER_MESSAGE}.png: 一度に添付できる画像は${MAX_IMAGES_PER_MESSAGE}枚までです`,
		]);
	});
});
