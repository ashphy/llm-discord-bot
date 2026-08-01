/**
 * discordImages - Discordの添付ファイルからLLMに渡す画像パートを組み立てる
 *
 * スラッシュコマンドの attachment オプションと、リプライメッセージの添付ファイルの
 * どちらからも同じ形で扱えるように、必要最小限のフィールドだけを受け取ります。
 */
import {
	isSupportedImageMediaType,
	MAX_IMAGE_BYTES,
	MAX_IMAGES_PER_MESSAGE,
	normalizeMediaType,
	type SupportedImageMediaType,
	uploadImage,
} from "./imageStore.js";

/** Discord.js の Attachment のうち、画像の判定に必要なフィールド */
export type ImageAttachment = {
	name: string;
	url: string;
	size: number;
	contentType: string | null;
};

/** LLMのユーザーメッセージに埋め込む画像パート */
export type StoredImagePart = {
	type: "image";
	image: string;
	mediaType: SupportedImageMediaType;
};

export type SelectImageAttachmentsResult = {
	/** 画像として受け付ける添付ファイル */
	accepted: ImageAttachment[];
	/** 受け付けなかった理由（ユーザーへの通知用） */
	rejected: string[];
};

/**
 * 添付ファイルから画像として扱えるものだけを選び出します
 * 画像以外の添付ファイルは黙って無視し、画像だが受け付けられないものだけ理由を返します。
 */
export const selectImageAttachments = (
	attachments: ImageAttachment[],
): SelectImageAttachmentsResult => {
	const accepted: ImageAttachment[] = [];
	const rejected: string[] = [];

	for (const attachment of attachments) {
		// 画像以外の添付ファイルは対象外（テキストのみの会話を妨げない）
		if (!attachment.contentType?.startsWith("image/")) {
			continue;
		}

		if (!isSupportedImageMediaType(attachment.contentType)) {
			rejected.push(
				`${attachment.name}: 未対応の画像形式です (JPEG / PNG / GIF / WebP のみ)`,
			);
			continue;
		}

		if (attachment.size > MAX_IMAGE_BYTES) {
			rejected.push(`${attachment.name}: 5MBを超える画像は添付できません`);
			continue;
		}

		if (accepted.length >= MAX_IMAGES_PER_MESSAGE) {
			rejected.push(
				`${attachment.name}: 一度に添付できる画像は${MAX_IMAGES_PER_MESSAGE}枚までです`,
			);
			continue;
		}

		accepted.push(attachment);
	}

	return { accepted, rejected };
};

/**
 * 添付ファイルをS3に保存し、LLMに渡す画像パートに変換します
 * ダウンロードや保存に失敗した画像は取り除き、理由を rejected に載せます。
 */
export const storeImageAttachments = async (
	attachments: ImageAttachment[],
	userId: string,
): Promise<{ images: StoredImagePart[]; rejected: string[] }> => {
	const { accepted, rejected } = selectImageAttachments(attachments);

	const images: StoredImagePart[] = [];
	for (const attachment of accepted) {
		try {
			const response = await fetch(attachment.url);
			if (!response.ok) {
				throw new Error(`status ${response.status}`);
			}

			const data = new Uint8Array(await response.arrayBuffer());
			if (data.byteLength > MAX_IMAGE_BYTES) {
				rejected.push(`${attachment.name}: 5MBを超える画像は添付できません`);
				continue;
			}

			const mediaType = normalizeMediaType(attachment.contentType as string);
			images.push({
				type: "image",
				image: await uploadImage(data, mediaType, userId),
				mediaType,
			});
		} catch (error) {
			console.error("[DiscordImages] failed to store the image:", error);
			rejected.push(`${attachment.name}: 画像の取り込みに失敗しました`);
		}
	}

	return { images, rejected };
};
