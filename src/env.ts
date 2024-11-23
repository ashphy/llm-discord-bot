import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		// Discord Bot Token
		// https://discord.com/developers/docs/tutorials/hosting-on-cloudflare-workers#creating-an-app-on-discord
		BOT_TOKEN: z.string(),
		OPENAI_API_KEY: z.string(),
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
});
