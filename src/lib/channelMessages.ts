/**
 * channelMessages - Botを呼び出したチャンネルのメッセージをLLMに渡すための処理
 *
 * Botとの会話履歴だけでは、チャンネルで直前に何が話されていたかが分からない。
 * 呼び出し時に直前のメッセージを注入し、さらに遡る必要があればツールで取得させる。
 */
import type { Message, TextBasedChannel } from "discord.js";

/** RequestContext に呼び出し元のチャンネルを載せるときのキー */
export const CHANNEL_KEY = "channel";

/** ツールが1回で取得できる最大件数。多すぎるとコンテキストを圧迫する */
export const MAX_FETCH_LIMIT = 50;

/**
 * チャンネルのメッセージを古い順に取得します
 * @param before 指定するとこのメッセージより前を取得する
 */
export const fetchChannelMessages = async (
	channel: TextBasedChannel,
	options: { limit: number; before?: string },
): Promise<Message[]> => {
	const messages = await channel.messages.fetch({
		limit: options.limit,
		before: options.before,
	});
	return [...messages.values()].sort(
		(a, b) => a.createdTimestamp - b.createdTimestamp,
	);
};

/**
 * メッセージをLLMに渡すテキストに変換します
 * id を載せるのは、ツールで続きを取得するときに `before` として指定させるため
 */
export const formatChannelMessages = (messages: Message[]): string =>
	messages
		.map((message) => {
			const author = message.member?.displayName ?? message.author.displayName;
			return `<message id="${message.id}" author="${author}" time="${message.createdAt.toISOString()}">${message.content}</message>`;
		})
		.join("\n");
