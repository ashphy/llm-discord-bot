import { describe, expect, it } from "vitest";
import {
	drainGeneratedImages,
	type GeneratedImage,
	pushGeneratedImage,
} from "./generatedImages.js";

const image = (ref: string): GeneratedImage => ({
	ref,
	fileName: "generated.png",
	mediaType: "image/png",
	data: new Uint8Array([1, 2, 3]),
});

describe("drainGeneratedImages", () => {
	it("積んだ画像を取り出してキューを空にする", () => {
		const queue: GeneratedImage[] = [];
		pushGeneratedImage(queue, image("s3://images/1/a.png"));
		pushGeneratedImage(queue, image("s3://images/1/b.png"));

		expect(drainGeneratedImages(queue).map((i) => i.ref)).toEqual([
			"s3://images/1/a.png",
			"s3://images/1/b.png",
		]);
		expect(queue).toEqual([]);
	});

	it("2回目の取り出しでは同じ画像を返さない", () => {
		const queue: GeneratedImage[] = [];
		pushGeneratedImage(queue, image("s3://images/1/a.png"));

		drainGeneratedImages(queue);

		expect(drainGeneratedImages(queue)).toEqual([]);
	});

	it("キューが無くても落ちない", () => {
		expect(() => pushGeneratedImage(undefined, image("s3://x"))).not.toThrow();
		expect(drainGeneratedImages(undefined)).toEqual([]);
	});
});
