import { GetCommand } from "@aws-sdk/lib-dynamodb";
import type { Conversation } from "../lib/conversation.js";
import { CONVERSATIONS_TABLE_NAME, docClient } from "./dynnamodb.js";

/** 会話の実体、またはその実体を指すエイリアスを表すアイテム */
type ConversationItem = {
	Conversation?: Conversation;
	ConversationRef?: string;
};

const getItem = async (
	messageId: string,
): Promise<ConversationItem | undefined> => {
	const command = new GetCommand({
		TableName: CONVERSATIONS_TABLE_NAME,
		Key: {
			MessageId: messageId,
		},
	});

	const response = await docClient.send(command);
	return response.Item as ConversationItem | undefined;
};

/**
 * 会話履歴を読み出します
 *
 * Botの応答が複数メッセージに分かれている場合、実体を持つのは1件だけで
 * 残りは実体を指すエイリアスになっている（saveConversationを参照）。
 *
 * @param conversationId 返信先のメッセージID
 */
export const readConversation = async (
	conversationId: string,
): Promise<Conversation | undefined> => {
	const item = await getItem(conversationId);
	if (!item) return undefined;
	if (item.Conversation) return item.Conversation;

	// エイリアスは実体を1ホップだけ辿る（エイリアスの連鎖は作らない）
	if (item.ConversationRef) {
		return (await getItem(item.ConversationRef))?.Conversation;
	}

	return undefined;
};
