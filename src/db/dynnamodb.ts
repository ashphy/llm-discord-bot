import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({
	region: "us-west-2",
});
export const docClient = DynamoDBDocumentClient.from(client, {
	marshallOptions: {
		removeUndefinedValues: true,
	},
});
