import { SapphireClient } from "@sapphire/framework";
import { GatewayIntentBits } from "discord.js";
import { env } from "./env.js";

const client = new SapphireClient({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
	],
});

client.login(env.BOT_TOKEN);

console.log("Bot is running");
