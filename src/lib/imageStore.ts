/**
 * imageStore - 添付画像のS3保存と会話履歴への埋め込み
 *
 * Discordの添付ファイルURLは署名付きで約24時間で失効するため、そのまま会話履歴に
 * 保存すると翌日以降の返信で画像を復元できなくなります。そこで画像の実体はS3に保存し、
 * 会話履歴には `s3://<key>` という参照だけを持たせます。
 *
 * - 保存時: `{ type: "image", image: "s3://images/..." }` を会話履歴に積む（DynamoDBには参照のみ）
 * - 送信時: hydrateImageParts() でS3から実体を取得し、バイト列に差し替えてからLLMへ渡す
 *
 * S3側には `images/` プレフィックスに対して30日で失効するライフサイクルルールを
 * 設定してある前提です。失効済みの画像は hydrateImageParts() がテキストに置き換えます。
 */
import { randomUUID } from "node:crypto";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import type { ModelMessage } from "ai";
import { s3Client } from "../db/s3.js";
import { env } from "../env.js";

/** Claudeが受け付ける画像のMIMEタイプ */
export const SUPPORTED_IMAGE_MEDIA_TYPES = [
	"image/jpeg",
	"image/png",
	"image/gif",
	"image/webp",
] as const;

export type SupportedImageMediaType =
	(typeof SUPPORTED_IMAGE_MEDIA_TYPES)[number];

/** 1枚あたりの最大サイズ（Claudeの上限が5MB） */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** 1メッセージあたりに受け付ける最大枚数 */
export const MAX_IMAGES_PER_MESSAGE = 4;

/** S3のオブジェクトキーのプレフィックス（ライフサイクルルールの対象） */
const IMAGE_KEY_PREFIX = "images";

/** 会話履歴に埋め込む参照のスキーム */
const IMAGE_REF_SCHEME = "s3://";

const EXTENSIONS: Record<SupportedImageMediaType, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/gif": "gif",
	"image/webp": "webp",
};

/**
 * MIMEタイプがサポート対象かどうかを判定します
 */
export const isSupportedImageMediaType = (
	mediaType: string | null | undefined,
): mediaType is SupportedImageMediaType => {
	if (!mediaType) return false;

	// Discordは "image/png; charset=utf-8" のようなパラメータ付きで返すことがある
	const normalized = mediaType.split(";")[0].trim().toLowerCase();
	return (SUPPORTED_IMAGE_MEDIA_TYPES as readonly string[]).includes(
		normalized,
	);
};

/**
 * MIMEタイプからパラメータを取り除いた値を返します
 */
export const normalizeMediaType = (
	mediaType: string,
): SupportedImageMediaType =>
	mediaType.split(";")[0].trim().toLowerCase() as SupportedImageMediaType;

/**
 * S3のオブジェクトキーを会話履歴用の参照文字列に変換します
 */
export const toImageRef = (key: string): string => `${IMAGE_REF_SCHEME}${key}`;

/**
 * 会話履歴の image フィールドからS3のオブジェクトキーを取り出します
 * S3参照でない場合（URL・バイト列など）は undefined を返します
 */
export const parseImageRef = (image: unknown): string | undefined => {
	if (typeof image !== "string") return undefined;
	if (!image.startsWith(IMAGE_REF_SCHEME)) return undefined;

	const key = image.slice(IMAGE_REF_SCHEME.length);
	return key.length > 0 ? key : undefined;
};

/**
 * 画像をS3に保存し、会話履歴に埋め込む参照文字列を返します
 * @param data 画像のバイト列
 * @param mediaType 画像のMIMEタイプ
 * @param userId 投稿者のDiscord ID（キーの整理用）
 */
export const uploadImage = async (
	data: Uint8Array,
	mediaType: SupportedImageMediaType,
	userId: string,
): Promise<string> => {
	const key = `${IMAGE_KEY_PREFIX}/${userId}/${randomUUID()}.${EXTENSIONS[mediaType]}`;

	await s3Client.send(
		new PutObjectCommand({
			Bucket: env.IMAGE_BUCKET_NAME,
			Key: key,
			Body: data,
			ContentType: mediaType,
		}),
	);

	return toImageRef(key);
};

/**
 * S3から画像の実体を取得します
 * 保存期限切れなどで取得できない場合は undefined を返します
 */
export const downloadImage = async (
	key: string,
): Promise<Uint8Array | undefined> => {
	try {
		const response = await s3Client.send(
			new GetObjectCommand({
				Bucket: env.IMAGE_BUCKET_NAME,
				Key: key,
			}),
		);

		if (!response.Body) return undefined;
		return await response.Body.transformToByteArray();
	} catch (error) {
		console.warn("[ImageStore] failed to load the image:", key, error);
		return undefined;
	}
};

/** 保存期限切れの画像の代わりにLLMへ渡すテキスト */
const EXPIRED_IMAGE_TEXT =
	"(添付されていた画像は保存期限が切れているため参照できません)";

/**
 * 会話履歴中のS3参照を画像の実体に差し替えたコピーを返します
 * 元の配列は書き換えないため、保存時は参照のまま残ります。
 */
export const hydrateImageParts = async (
	messages: ModelMessage[],
): Promise<ModelMessage[]> => {
	return await Promise.all(
		messages.map(async (message) => {
			if (message.role !== "user" || typeof message.content === "string") {
				return message;
			}

			const hasImageRef = message.content.some(
				(part) => part.type === "image" && parseImageRef(part.image),
			);
			if (!hasImageRef) return message;

			const content = await Promise.all(
				message.content.map(async (part) => {
					if (part.type !== "image") return part;

					const key = parseImageRef(part.image);
					if (!key) return part;

					const data = await downloadImage(key);
					if (!data) {
						return { type: "text", text: EXPIRED_IMAGE_TEXT } as const;
					}

					return { ...part, image: data };
				}),
			);

			return { ...message, content };
		}),
	);
};
