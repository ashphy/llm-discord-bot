import { Listener } from "@sapphire/framework";
import type { Message } from "discord.js";

export class MessageReplyListener extends Listener {
	public constructor(
		context: Listener.LoaderContext,
		options: Listener.Options,
	) {
		super(context, {
			...options,
			event: "messageCreate",
		});
	}

	public run(message: Message) {
		console.log("Message received", message.author);

		// ボットが送信したメッセージを無視
		if (message.author.bot) {
			console.log("Bot message");
			return;
		}

		// 返信かどうか確認
		if (message.reference?.messageId) {
			const repliedMessage = message.channel.messages.cache.get(
				message.reference.messageId,
			);

			if (!repliedMessage) {
				console.log("Replied message not found");
				return;
			}

			// ここで返信メッセージに対して反応する処理を記述
			console.log("Replied message");
		}
	}
}
