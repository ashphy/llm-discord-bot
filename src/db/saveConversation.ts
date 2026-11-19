import { PutCommand } from "@aws-sdk/lib-dynamodb";
import type { Conversation } from "../lib/conversation.js";
import { CONVERSATIONS_TABLE_NAME, docClient } from "./dynnamodb.js";

const byteLength = (value: unknown): number =>
	Buffer.byteLength(JSON.stringify(value));

const summarizeConversation = (conversation: Conversation) => ({
	totalBytes: byteLength(conversation),
	parts: conversation.messages.flatMap((message, index) => {
		const parts =
			typeof message.content === "string"
				? [{ type: "string", value: message.content }]
				: message.content;
		return parts.map((part) => ({
			index,
			role: message.role,
			type: part.type,
			toolName: "toolName" in part ? part.toolName : undefined,
			bytes: byteLength(part),
		}));
	}),
});

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
	try {
		await docClient.send(
			new PutCommand({
				TableName: CONVERSATIONS_TABLE_NAME,
				Item: {
					MessageId: conversationId,
					Conversation: conversation,
				},
			}),
		);
	} catch (error) {
		// 失敗した会話はどこにも残らないため、何が容量を使っていたかをログから追えるようにする
		// 集計に失敗しても元のエラーを投げ直せるようにする
		let summary: string;
		try {
			summary = JSON.stringify(summarizeConversation(conversation));
		} catch (summaryError) {
			summary = `(failed to summarize: ${summaryError})`;
		}
		console.error(`Failed to save conversation ${conversationId}:`, summary);
		throw error;
	}

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
