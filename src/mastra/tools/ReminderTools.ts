import { randomUUID } from "node:crypto";
import { createTool } from "@mastra/core/tools";
import type { TextBasedChannel } from "discord.js";
import { z } from "zod";
import { CHANNEL_KEY } from "../../lib/channelMessages.js";
import {
	formatReminderTime,
	MAX_REMINDERS_PER_USER,
	nextCronRun,
	PENDING_REMINDERS_KEY,
	type PendingReminder,
	validateCron,
} from "../../lib/reminder.js";
import { reminderScheduler } from "../../lib/reminderScheduler.js";

export const SetReminderTool = createTool({
	id: "setReminder",
	description:
		"Register a reminder for the user. Specify exactly one of `at` (one-time) or `cron` (recurring).",
	inputSchema: z.object({
		message: z
			.string()
			.describe(
				"What to remind the user of. Write it so it can be understood without the conversation, because recurring reminders start a new conversation",
			),
		at: z.iso
			.datetime({ offset: true })
			.optional()
			.describe(
				"When to notify for a one-time reminder, ISO 8601 with a timezone offset (e.g. 2025-06-15T08:00:00+09:00)",
			),
		cron: z
			.string()
			.optional()
			.describe(
				"5-field cron expression evaluated in Asia/Tokyo for a recurring reminder (e.g. `0 8 * * *` for every day at 8:00). The interval must be at least 1 hour",
			),
	}),
	execute: async ({ message, at, cron }, { requestContext }) => {
		const userId = requestContext?.get("userId") as string | undefined;
		const userName = requestContext?.get("userName") as string | undefined;
		const channel = requestContext?.get(CHANNEL_KEY) as
			| TextBasedChannel
			| undefined;
		const pending = requestContext?.get(PENDING_REMINDERS_KEY) as
			| PendingReminder[]
			| undefined;
		if (!userId || !userName || !channel || !pending) {
			return "Error: reminders are not available here";
		}

		const registered =
			reminderScheduler.count(userId) +
			pending.filter((reminder) => reminder.userId === userId).length;
		if (registered >= MAX_REMINDERS_PER_USER) {
			return `Error: a user can register up to ${MAX_REMINDERS_PER_USER} reminders. Ask the user to cancel one first`;
		}

		if ((at === undefined) === (cron === undefined)) {
			return "Error: specify exactly one of `at` or `cron`";
		}

		let nextRunAt: Date;
		if (cron !== undefined) {
			const error = validateCron(cron);
			if (error) return `Error: ${error}`;
			const next = nextCronRun(cron, new Date());
			if (!next) return "Error: The cron expression never runs";
			nextRunAt = next;
		} else {
			nextRunAt = new Date(at as string);
			if (nextRunAt.getTime() <= Date.now()) {
				return "Error: `at` must be in the future";
			}
		}

		const id = randomUUID();
		pending.push({
			id,
			userId,
			userName,
			channelId: channel.id,
			message,
			nextRunAt: nextRunAt.toISOString(),
			cron,
		});
		return `Registered reminder ${id}. Next notification: ${formatReminderTime(nextRunAt)}`;
	},
});

export const ListRemindersTool = createTool({
	id: "listReminders",
	description: "List the reminders the user has registered, soonest first.",
	inputSchema: z.object({}),
	execute: async (_input, { requestContext }) => {
		const userId = requestContext?.get("userId") as string | undefined;
		if (!userId) return "Error: reminders are not available here";

		return JSON.stringify(
			reminderScheduler.list(userId).map((reminder) => ({
				id: reminder.id,
				message: reminder.message,
				nextRunAt: formatReminderTime(new Date(reminder.nextRunAt)),
				cron: reminder.cron,
			})),
		);
	},
});

export const CancelReminderTool = createTool({
	id: "cancelReminder",
	description:
		"Cancel one of the user's reminders. Get the id from listReminders first.",
	inputSchema: z.object({
		id: z.string().describe("The id of the reminder to cancel"),
	}),
	execute: async ({ id }, { requestContext }) => {
		const userId = requestContext?.get("userId") as string | undefined;
		if (!userId) return "Error: reminders are not available here";

		const cancelled = await reminderScheduler.cancel(userId, id);
		return cancelled
			? `Cancelled reminder ${id}`
			: `Error: reminder ${id} was not found`;
	},
});
