import { Listener } from "@sapphire/framework";
import type { Message } from "discord.js";
import { AiAgent } from "../lib/aiAgent.js";

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

	// AIに関する返信であれば、会話を継続する
	public async run(message: Message) {
		// ボットが送信したメッセージを無視
		if (message.author.bot) return;

		// 返信かどうか確認
		if (!message.reference?.messageId) return;
		const repliedMessage = message.channel.messages.cache.get(
			message.reference.messageId,
		);
		if (!repliedMessage) return;

		// このBotへの返信か確認
		if (this.container.client.user?.id !== repliedMessage.author.id) return;

		// Botへの返信なので、会話を継続する
		const referenceMessageId = message.reference.messageId;
		const userName = repliedMessage.author.username;
		const userMessage = message.content;

		// ここで返信メッセージに対して反応する処理を記述
		const aiAgent = new AiAgent(userName);
		await aiAgent.load(referenceMessageId);
		const answer = await aiAgent.thinkAnswer(userMessage);

		const answerMessage = await message.reply(answer);
		await aiAgent.save(answerMessage.id);
	}
}
