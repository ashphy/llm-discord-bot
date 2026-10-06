import { AttachmentBuilder, type Client } from "discord.js";
import { AiAgent } from "./aiAgent.js";
import { buildReminderPrompt, type Reminder } from "./reminder.js";
import { useReplyMessage } from "./useReplyMessage.js";

/**
 * リマインダーの時刻になったことをモデルに伝え、生成した通知を投稿します
 *
 * 1回だけのリマインダーは元の会話を読み込み、Botの応答メッセージへの返信として送る。
 * 繰り返しのリマインダーは新しい会話としてチャンネルに投稿する。
 * どちらも通知への返信で会話を続けられるよう、会話を保存する。
 */
export const notifyReminder = async (
	client: Client,
	reminder: Reminder,
): Promise<void> => {
	const channel = await client.channels.fetch(reminder.channelId);
	if (!channel?.isTextBased() || !channel.isSendable()) {
		console.error(`Reminder channel is not available: ${reminder.channelId}`);
		return;
	}

	const aiAgent = new AiAgent();
	// 元のメッセージが削除されていても、会話の続きとしてチャンネルに投稿する
	const originalMessage = reminder.conversationId
		? await channel.messages
				.fetch(reminder.conversationId)
				.catch(() => undefined)
		: undefined;
	if (reminder.conversationId) {
		await aiAgent.load(reminder.conversationId);
	}

	const {
		updateReplyMessage,
		registerMessageId,
		getMessageIds,
		finishMessage,
	} = useReplyMessage(
		originalMessage,
		[{ type: "mention", userId: reminder.userId }],
		true,
		{
			onNewMessage: async (_isFirst, currentMessage, messageOptions) => {
				if (currentMessage) return await currentMessage.reply(messageOptions);
				return await channel.send(messageOptions);
			},
			onTyping: async () => {
				await channel.sendTyping();
			},
		},
	);

	try {
		await aiAgent.thinkAnswer(
			buildReminderPrompt(reminder),
			reminder.userId,
			reminder.userName,
			{
				onTextMessage: async (text) => {
					await updateReplyMessage({ type: "text", text });
				},
				onToolCall: async (toolName) => {
					await updateReplyMessage({ type: "tool-call", toolName });
				},
				onError: async (error) => {
					await updateReplyMessage({ type: "error", error });
				},
				onImage: async (image) => {
					const sent = await channel.send({
						files: [
							new AttachmentBuilder(Buffer.from(image.data), {
								name: image.fileName,
							}),
						],
					});
					registerMessageId(sent.id);
				},
				onFinish: async () => {
					const [conversationId, ...aliasIds] = getMessageIds();
					if (conversationId) {
						await aiAgent.save(conversationId, aliasIds);
					}
				},
			},
			[],
			// チャンネルの直近のメッセージはリマインダーと無関係なため渡さない
			undefined,
		);
	} catch (error) {
		console.error("Error in reminder notification:", error);
		await channel.send({
			content: `<@${reminder.userId}> リマインダーの通知中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`,
		});
	} finally {
		finishMessage();
	}
};
