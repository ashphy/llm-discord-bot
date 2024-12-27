import { PutCommand } from "@aws-sdk/lib-dynamodb";
import type { Conversation } from "../lib/conversation.js";
import { docClient } from "./dynnamodb.js";

export const saveConversation = async (
	conversationId: string,
	conversation: Conversation,
) => {
	const command = new PutCommand({
		TableName: "Conversations",
		Item: {
			MessageId: conversationId,
			Conversation: conversation,
		},
	});

	return await docClient.send(command);
};
