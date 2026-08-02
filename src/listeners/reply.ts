import { Listener } from "@sapphire/framework";
import { AttachmentBuilder, type Message, TextChannel } from "discord.js";
import { AiAgent } from "../lib/aiAgent.js";
import { storeImageAttachments } from "../lib/discordImages.js";
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
		// fetch はキャッシュにあればそれを返すため、通常は追加のリクエストを伴わない。
		// cache.get だけだとBotの再起動でキャッシュが飛んだあと、それ以前の
		// メッセージへの返信に反応できなくなる
		const repliedMessage = await message.channel.messages
			.fetch(message.reference.messageId)
			.catch(() => undefined);
		if (!repliedMessage) return;

		// このBotへの返信か確認
		if (this.container.client.user?.id !== repliedMessage.author.id) return;

		// Botへの返信なので、会話を継続する
		const referenceMessageId = message.reference.messageId;
		const member = message.guild?.members.cache.get(message.author.id);

		const userId = message.author.id;
		const userName = member ? member.displayName : message.author.displayName;

		const userMessage = message.content;

		if (message.channel instanceof TextChannel) {
			await message.channel.sendTyping();
		}

		// 添付画像をS3に保存する
		const { images, rejected } = await storeImageAttachments(
			[...message.attachments.values()],
			userId,
		);

		// ここで返信メッセージに対して反応する処理を記述
		const {
			updateReplyMessage,
			registerMessageId,
			getMessageIds,
			finishMessage,
		} = useReplyMessage(
			message,
			[
				{
					type: "prompt",
					prompt: userMessage,
				},
			],
			true,
			{
				onNewMessage: async (_isFirst, currentMessage, messageOptions) => {
					if (!currentMessage) throw new Error("Current message is undefined");
					return await currentMessage?.reply(messageOptions);
				},
				onTyping: async () => {
					if (message.channel instanceof TextChannel) {
						await message.channel.sendTyping();
					}
				},
			},
		);

		const aiAgent = new AiAgent();
		await aiAgent.load(referenceMessageId);

		try {
			for (const reason of rejected) {
				await updateReplyMessage({ type: "notice", text: reason });
			}

			await aiAgent.thinkAnswer(
				userMessage,
				userId,
				userName,
				{
					onStepStart: async () => {},
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
					onImage: async (image) => {
						// 生成画像はストリーミング中のメッセージを編集し直すと毎回再アップロード
						// になるため、独立したメッセージとして送る
						const sent = await message.reply({
							files: [
								new AttachmentBuilder(Buffer.from(image.data), {
									name: image.fileName,
								}),
							],
						});
						// 画像メッセージへの返信からも会話を辿れるようにする
						registerMessageId(sent.id);
					},
					onFinish: async () => {
						const [conversationId, ...aliasIds] = getMessageIds();
						if (conversationId) {
							await aiAgent.save(conversationId, aliasIds);
						}
					},
				},
				images,
			);
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
		} finally {
			finishMessage();
		}
	}
}
