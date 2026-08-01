/**
 * generatedImages - 画像生成ツールが作った画像をDiscordへ運ぶためのキュー
 *
 * ツールの戻り値はそのままLLMのコンテキストに入るため、画像の実体を返すことはできません
 * （1枚で数十万トークンになる）。そこでツールはS3に保存したうえで、RequestContext に
 * 積んだこのキューに実体を載せ、AiAgent がストリームを読みながら回収してDiscordへ添付します。
 */
import type { SupportedImageMediaType } from "./imageStore.js";

/** RequestContext に生成画像のキューを載せるときのキー */
export const GENERATED_IMAGES_KEY = "generatedImages";

export type GeneratedImage = {
	/** 会話履歴・ツール入力から参照するためのS3参照 (`s3://<key>`) */
	ref: string;
	/** Discordに添付するファイル名 */
	fileName: string;
	mediaType: SupportedImageMediaType;
	data: Uint8Array;
};

/**
 * キューに生成画像を積みます
 * RequestContext が無い場合（テストなど）は何もしません。
 */
export const pushGeneratedImage = (
	queue: GeneratedImage[] | undefined,
	image: GeneratedImage,
): void => {
	queue?.push(image);
};

/**
 * キューの中身を取り出して空にします
 */
export const drainGeneratedImages = (
	queue: GeneratedImage[] | undefined,
): GeneratedImage[] => {
	if (!queue || queue.length === 0) return [];
	return queue.splice(0, queue.length);
};
