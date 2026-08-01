import { createTool } from "@mastra/core/tools";
import OpenAI, { toFile } from "openai";
import { dedent } from "ts-dedent";
import { z } from "zod";
import { env } from "../../env.js";
import {
	GENERATED_IMAGES_KEY,
	type GeneratedImage,
	pushGeneratedImage,
} from "../../lib/generatedImages.js";
import {
	downloadImage,
	parseImageRef,
	type SupportedImageMediaType,
	uploadImage,
} from "../../lib/imageStore.js";

const IMAGE_MODEL = "gpt-image-2";

/** 入力画像の上限（gpt-image-2 の仕様） */
const MAX_SOURCE_IMAGES = 16;

/** Discordの添付上限に対する安全側の閾値 */
const MAX_ATTACHMENT_BYTES = 9 * 1024 * 1024;

const OUTPUT_MEDIA_TYPE: SupportedImageMediaType = "image/png";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export const ImageGenerationTool = createTool({
	id: "ImageGeneration",
	description: dedent`
		Generates an image from a text prompt, or edits existing images, using OpenAI ${IMAGE_MODEL}.
		The generated image is posted to the user automatically as a Discord attachment,
		so do NOT try to describe the image in detail or paste its reference in your reply.
		Just tell the user what you made in one short sentence.
	`,
	inputSchema: z.object({
		prompt: z.string().describe(
			dedent`A detailed description of the image to generate. When editing, describe the change to apply.
					Write it in English even if the user speaks another language.`,
		),
		size: z
			.string()
			.optional()
			.describe(
				dedent`Image size. Use "1024x1024" (square, default), "1536x1024" (landscape) or "1024x1536" (portrait).
					An arbitrary "WIDTHxHEIGHT" is also accepted: both sides must be divisible by 16,
					the aspect ratio must be between 1:3 and 3:1, and the maximum is 3840x2160.`,
			),
		quality: z
			.enum(["low", "medium", "high"])
			.optional()
			.describe(
				"Rendering quality. Defaults to medium. Use high only when the user asks for a high quality image.",
			),
		sourceImageRefs: z
			.array(z.string())
			.max(MAX_SOURCE_IMAGES)
			.optional()
			.describe(
				dedent`References (\`s3://...\`) of the images to edit. Leave empty to generate from scratch.
					Use the references listed in <attachedImages> of the user message, or the reference
					returned by a previous call of this tool.`,
			),
		preserveInputFidelity: z
			.boolean()
			.optional()
			.describe(
				"Set true when editing and the faces or the style of the source images must be preserved closely.",
			),
	}),
	execute: async (
		{ prompt, size, quality, sourceImageRefs, preserveInputFidelity },
		{ requestContext },
	) => {
		const userId = (requestContext?.get("userId") as string) ?? "unknown";
		const queue = requestContext?.get(GENERATED_IMAGES_KEY) as
			| GeneratedImage[]
			| undefined;

		try {
			const sourceImages = await loadSourceImages(sourceImageRefs);

			const base64 =
				sourceImages.length > 0
					? await editImage(prompt, sourceImages, {
							size,
							quality,
							preserveInputFidelity,
						})
					: await generateImage(prompt, { size, quality });

			if (!base64) {
				return { success: false, error: "画像が生成されませんでした" };
			}

			const data = new Uint8Array(Buffer.from(base64, "base64"));
			const ref = await uploadImage(data, OUTPUT_MEDIA_TYPE, userId);

			if (data.byteLength > MAX_ATTACHMENT_BYTES) {
				return {
					success: false,
					ref,
					error: dedent`生成した画像がDiscordの添付上限を超えたため送信できませんでした
						(${Math.round(data.byteLength / 1024 / 1024)}MB)。より小さいサイズで生成し直してください。`,
				};
			}

			pushGeneratedImage(queue, {
				ref,
				fileName: `generated-${Date.now()}.png`,
				mediaType: OUTPUT_MEDIA_TYPE,
				data,
			});

			return {
				success: true,
				ref,
				edited: sourceImages.length > 0,
				note: "The image has already been posted to the user. Do not repeat the reference in your reply.",
			};
		} catch (error) {
			console.error("[ImageGenerationTool] failed to generate:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	},
});

/**
 * S3参照から編集元の画像を読み込みます
 * 保存期限切れなどで読めなかった参照は取り除きます。
 */
const loadSourceImages = async (refs: string[] | undefined) => {
	if (!refs || refs.length === 0) return [];

	const loaded = await Promise.all(
		refs.map(async (ref, index) => {
			const key = parseImageRef(ref);
			if (!key) return undefined;

			const data = await downloadImage(key);
			if (!data) return undefined;

			return await toFile(Buffer.from(data), `source-${index}.png`, {
				type: "image/png",
			});
		}),
	);

	return loaded.filter((file) => file !== undefined);
};

type RenderOptions = {
	size?: string;
	quality?: "low" | "medium" | "high";
	preserveInputFidelity?: boolean;
};

const generateImage = async (prompt: string, options: RenderOptions) => {
	const response = await openai.images.generate({
		model: IMAGE_MODEL,
		prompt,
		n: 1,
		size: options.size ?? "1024x1024",
		quality: options.quality ?? "medium",
		output_format: "png",
	});

	return response.data?.[0]?.b64_json;
};

const editImage = async (
	prompt: string,
	images: Awaited<ReturnType<typeof loadSourceImages>>,
	options: RenderOptions,
) => {
	const response = await openai.images.edit({
		model: IMAGE_MODEL,
		image: images,
		prompt,
		n: 1,
		size: options.size ?? "1024x1024",
		quality: options.quality ?? "medium",
		output_format: "png",
		input_fidelity: options.preserveInputFidelity ? "high" : "low",
	});

	return response.data?.[0]?.b64_json;
};
