import { Listener } from "@sapphire/framework";
import { type Message, TextChannel } from "discord.js";
import { AiAgent } from "../lib/aiAgent.js";
import { useReplyMessage } from "../lib/useReplyMessage.js";

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

		const userId = message.author.id;
		const userName = member ? member.displayName : message.author.displayName;

		const userMessage = message.content;

		let messageId = "";

		if (message.channel instanceof TextChannel) {
			await message.channel.sendTyping();
		}

		// ここで返信メッセージに対して反応する処理を記述
		const { updateReplyMessage, write, getFirstMessageId } = useReplyMessage(
			message,
			[
				{
					type: "prompt",
					prompt: userMessage,
				},
			],
			{
				onNewMessage: async (_isFirst, currentMessage, messageOptions) => {
					if (!currentMessage) throw new Error("Current message is undefined");
					const message = await currentMessage?.reply(messageOptions);
					messageId = message.id;
					return message;
				},
			},
		);

		const aiAgent = new AiAgent();
		await aiAgent.load(referenceMessageId);

		try {
			await aiAgent.thinkAnswer(userMessage, userId, userName, {
				onStepStart: async () => {
					write();
				},
				onTextMessage: async (text) => {
					await updateReplyMessage({
						type: "text",
						text,
					});
				},
				onToolCall: async (toolName) => {
					await updateReplyMessage({
						type: "tool-call",
						toolName,
					});
				},
				onError: async (error) => {
					await updateReplyMessage({
						type: "error",
						error: error,
					});
				},
				onFinish: async () => {
					const id = getFirstMessageId();
					if (id) {
						await aiAgent.save(id);
					}
				},
			});
		} catch (error) {
			console.error("Error in Reply Command:", error);
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
