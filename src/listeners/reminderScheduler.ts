import { Listener } from "@sapphire/framework";
import { type Client, Events } from "discord.js";
import { notifyReminder } from "../lib/notifyReminder.js";
import { reminderScheduler } from "../lib/reminderScheduler.js";

/**
 * Discordに接続したら、保存済みのリマインダーを予約し直す
 */
export class ReminderSchedulerListener extends Listener {
	public constructor(
		context: Listener.LoaderContext,
		options: Listener.Options,
	) {
		super(context, {
			...options,
			event: Events.ClientReady,
			once: true,
		});
	}

	public async run(client: Client<true>) {
		try {
			await reminderScheduler.start((reminder) =>
				notifyReminder(client, reminder),
			);
		} catch (error) {
			console.error("Failed to start reminder scheduler:", error);
		}
	}
}
