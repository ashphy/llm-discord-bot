import { GetCommand } from "@aws-sdk/lib-dynamodb";
import type { Conversation } from "../lib/conversation.js";
import { docClient } from "./dynnamodb.js";

/**
 * 会話履歴を読み出します
 * @param messageId
 */
export const readConversation = async (
	conversationId: string,
): Promise<Conversation | undefined> => {
	const command = new GetCommand({
		TableName: "Conversations",
		Key: {
			MessageId: conversationId,
		},
	});

	const response = await docClient.send(command);
	if (response.Item) {
		return response.Item.Conversation;
	}

	return undefined;
};
