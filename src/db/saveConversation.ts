import { PutCommand } from "@aws-sdk/lib-dynamodb";
import type { Conversation } from "../lib/conversation.js";
import { CONVERSATIONS_TABLE_NAME, docClient } from "./dynnamodb.js";

/**
 * 会話履歴を保存します
 *
 * Botの応答が複数メッセージに分かれても、どのメッセージへの返信からでも
 * 同じ会話を辿れるようにする。会話の実体は1件だけ保存し、残りのメッセージIDには
 * 実体を指すエイリアスを置く。会話履歴はターンごとに肥大化するため、
 * 全IDに複製すると書き込み量とアイテムサイズがメッセージ数の分だけ増えてしまう。
 *
 * @param conversationId 会話の実体を保存するメッセージID
 * @param conversation 保存する会話履歴
 * @param aliasIds 同じ会話を指させる他のメッセージID
 */
export const saveConversation = async (
	conversationId: string,
	conversation: Conversation,
	aliasIds: string[] = [],
): Promise<void> => {
	await docClient.send(
		new PutCommand({
			TableName: CONVERSATIONS_TABLE_NAME,
			Item: {
				MessageId: conversationId,
				Conversation: conversation,
			},
		}),
	);

	const aliases = [...new Set(aliasIds)].filter((id) => id !== conversationId);

	await Promise.all(
		aliases.map((aliasId) =>
			docClient.send(
				new PutCommand({
					TableName: CONVERSATIONS_TABLE_NAME,
					Item: {
						MessageId: aliasId,
						ConversationRef: conversationId,
					},
				}),
			),
		),
	);
};
