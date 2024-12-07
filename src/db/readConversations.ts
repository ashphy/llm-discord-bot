import { GetCommand } from "@aws-sdk/lib-dynamodb";
import type OpenAI from "openai";
import { docClient } from "./dynnamodb.js";

/**
 * 会話履歴を読み出します
 * @param messageId
 */
export const readConversation = async (
	messageId: string,
): Promise<OpenAI.ChatCompletionMessageParam[]> => {
	const command = new GetCommand({
		TableName: "Conversations",
		Key: {
			MessageId: messageId,
		},
	});

	const response = await docClient.send(command);
	if (response.Item) {
		return response.Item.Messages;
	}

	return [];
};
