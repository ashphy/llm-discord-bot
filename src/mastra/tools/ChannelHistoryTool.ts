import { createTool } from "@mastra/core/tools";
import type { TextBasedChannel } from "discord.js";
import { z } from "zod";
import {
	CHANNEL_KEY,
	fetchChannelMessages,
	formatChannelMessages,
	MAX_FETCH_LIMIT,
} from "../../lib/channelMessages.js";

export const ChannelHistoryTool = createTool({
	id: "channelHistory",
	description:
		"Fetch past messages in the Discord channel where you were called, oldest first. Only this channel can be read.",
	inputSchema: z.object({
		before: z
			.string()
			.optional()
			.describe(
				"Fetch messages older than this message id. Omit to fetch the latest messages",
			),
		limit: z
			.number()
			.int()
			.min(1)
			.max(MAX_FETCH_LIMIT)
			.describe("Number of messages to fetch"),
	}),
	execute: async ({ before, limit }, { requestContext }) => {
		const channel = requestContext?.get(CHANNEL_KEY) as
			| TextBasedChannel
			| undefined;
		if (!channel) {
			return "Error: channel is not available";
		}

		try {
			const messages = await fetchChannelMessages(channel, { limit, before });
			return formatChannelMessages(messages);
		} catch (error) {
			if (error instanceof Error) {
				return `Error fetching messages: ${error.message}`;
			}
			return `Error fetching messages: ${String(error)}`;
		}
	},
});
