import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		// Discord Bot Token
		// https://discord.com/developers/docs/tutorials/hosting-on-cloudflare-workers#creating-an-app-on-discord
		BOT_TOKEN: z.string(),

		OPENAI_API_KEY: z.string(),
		ANTHROPIC_API_KEY: z.string(),
		PERPLEXITY_API_KEY: z.string(),
		FIRECRAWL_API_KEY: z.string(),

		// Gemini は Vertex AI 経由で呼び出す
		GOOGLE_CLOUD_PROJECT: z.string(),
		// gemini-3.1-pro-preview はグローバルエンドポイント限定なので通常は "global"
		GOOGLE_CLOUD_LOCATION: z.string(),
		// サービスアカウントキーの JSON をそのまま 1 行にしたもの
		GOOGLE_APPLICATION_CREDENTIALS_JSON: z.string(),

		// 添付画像を保存するS3バケット名
		// バケットには30日で失効するライフサイクルルールを設定しておくこと
		IMAGE_BUCKET_NAME: z.string(),
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
});
