import { createVertex } from "@ai-sdk/google-vertex";
import { GoogleGenAI, type GoogleGenAIOptions } from "@google/genai";
import { JWT } from "google-auth-library";
import { env } from "../env.js";

// Fly.io にはサービスアカウントキーをファイルとして置けないため、
// JSON 文字列を環境変数で受け取る
const credentials = JSON.parse(env.GOOGLE_APPLICATION_CREDENTIALS_JSON);

// google-auth-library は JSON をそのまま渡す `credentials` オプションを非推奨にしている
// （想定外の種類の認証情報を読み込む恐れがあるため）。
// サービスアカウント用の JWT クライアントを明示的に作って渡す
const authClient = new JWT({
	email: credentials.client_email,
	key: credentials.private_key,
	scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

// Vercel AI SDK 用の Gemini プロバイダ（Vertex AI 経由）
export const vertex = createVertex({
	project: env.GOOGLE_CLOUD_PROJECT,
	location: env.GOOGLE_CLOUD_LOCATION,
	googleAuthOptions: { authClient },
});

// @google/genai は google-auth-library 10 系を内部に持つため、11 系の JWT と型が一致しない。
// 実行時の振る舞いは同じなので型だけ合わせる
type GenAiAuthClient = NonNullable<
	NonNullable<GoogleGenAIOptions["googleAuthOptions"]>["authClient"]
>;

// Google Gen AI SDK のクライアント（Vertex AI 経由）
export const genAi = new GoogleGenAI({
	vertexai: true,
	project: env.GOOGLE_CLOUD_PROJECT,
	location: env.GOOGLE_CLOUD_LOCATION,
	googleAuthOptions: { authClient: authClient as unknown as GenAiAuthClient },
});
