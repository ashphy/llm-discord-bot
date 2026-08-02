import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

/** 会話履歴を保存するテーブル（プライマリキーは MessageId のみ） */
export const CONVERSATIONS_TABLE_NAME = "Conversations";

const client = new DynamoDBClient({
	region: "us-west-2",
});
export const docClient = DynamoDBDocumentClient.from(client, {
	marshallOptions: {
		removeUndefinedValues: true,
	},
});
