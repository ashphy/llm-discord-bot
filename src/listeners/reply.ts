import { Listener } from "@sapphire/framework";
import type { Message } from "discord.js";
import { AiAgent } from "../lib/aiAgent.js";
import { sliceChunks } from "../utils/sliceChunks.js";

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
		const member = message.guild?.members.cache.get(message.author.id);
		const userName = member ? member.displayName : message.author.displayName;
		const userMessage = message.content;

		// ここで返信メッセージに対して反応する処理を記述
		const aiAgent = new AiAgent();
		await aiAgent.load(referenceMessageId);

		try {
			const answer = await aiAgent.thinkAnswer(userMessage, userName);
			const chunks = sliceChunks(answer);

			const answerMessage = await message.reply(answer);
			for (const chunk of chunks.slice(1)) {
				await message.reply(chunk);
			}

			await aiAgent.save(answerMessage.id);
		} catch (error) {
			if (error instanceof Error) {
				await message.reply({
					content: `エラーが発生しました: ${error.message}`,
				});
			} else {
				await message.reply({
					content: `エラーが発生しました: ${error}`,
				});
			}
		}
	}
}
