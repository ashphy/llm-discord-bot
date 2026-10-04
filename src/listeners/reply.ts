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

	// Botへの返信なら会話を継続し、Botへのメンションなら新しい会話を始める
	public async run(message: Message) {
		// ボットが送信したメッセージを無視
		if (message.author.bot) return;

		const botId = this.container.client.user?.id;
		if (!botId) return;

		const referenceMessageId = await findReplyToBot(message, botId);
		if (!referenceMessageId && !isMentioned(message, botId)) return;

		const member = message.guild?.members.cache.get(message.author.id);

		const userId = message.author.id;
		const userName = member ? member.displayName : message.author.displayName;

		const userMessage = stripMentions(message, botId);

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
		if (referenceMessageId) {
			await aiAgent.load(referenceMessageId);
		}

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
				{ channel: message.channel, before: message.id },
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

/**
 * Botのメッセージへの返信であれば、返信先のメッセージIDを返します
 */
const findReplyToBot = async (
	message: Message,
	botId: string,
): Promise<string | undefined> => {
	const referenceMessageId = message.reference?.messageId;
	if (!referenceMessageId) return undefined;

	// fetch はキャッシュにあればそれを返すため、通常は追加のリクエストを伴わない。
	// cache.get だけだとBotの再起動でキャッシュが飛んだあと、それ以前の
	// メッセージへの返信に反応できなくなる
	const repliedMessage = await message.channel.messages
		.fetch(referenceMessageId)
		.catch(() => undefined);
	if (repliedMessage?.author.id !== botId) return undefined;

	return referenceMessageId;
};

/**
 * Botの管理ロール（Botと同名でサーバーに自動作成される）へのメンションか
 * 補完候補ではBot本人と並んで同じ名前で表示されるため、どちらを選んでも反応させる
 */
const isBotRoleMention = (roleTags: { botId?: string } | null, botId: string) =>
	roleTags?.botId === botId;

/**
 * Botへのメンションを含むかどうか
 * @everyone や @here では反応させない
 */
const isMentioned = (message: Message, botId: string): boolean =>
	message.mentions.users.has(botId) ||
	message.mentions.roles.some((role) => isBotRoleMention(role.tags, botId));

/**
 * 本文からBotへのメンションを取り除きます
 */
const stripMentions = (message: Message, botId: string): string => {
	const roleIds = message.mentions.roles
		.filter((role) => isBotRoleMention(role.tags, botId))
		.map((role) => role.id);
	return [`<@${botId}>`, `<@!${botId}>`, ...roleIds.map((id) => `<@&${id}>`)]
		.reduce(
			(content, mention) => content.replaceAll(mention, ""),
			message.content,
		)
		.trim();
};
