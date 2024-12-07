import { PutCommand } from "@aws-sdk/lib-dynamodb";
import type OpenAI from "openai";
import { docClient } from "./dynnamodb.js";

export const saveConversation = async (
	messageId: string,
	messages: OpenAI.ChatCompletionMessageParam[],
) => {
	const command = new PutCommand({
		TableName: "Conversations",
		Item: {
			MessageId: messageId,
			Messages: messages,
		},
	});

	const response = await docClient.send(command);
	return response;
};
