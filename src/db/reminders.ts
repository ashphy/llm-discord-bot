import {
	DeleteCommand,
	PutCommand,
	ScanCommand,
	type ScanCommandOutput,
} from "@aws-sdk/lib-dynamodb";
import type { Reminder } from "../lib/reminder.js";
import { docClient } from "./dynnamodb.js";

/** リマインダーを保存するテーブル（プライマリキーは ReminderId のみ） */
export const REMINDERS_TABLE_NAME = "Reminders";

type ReminderItem = {
	ReminderId: string;
	UserId: string;
	UserName: string;
	ChannelId: string;
	Message: string;
	NextRunAt: string;
	Cron?: string;
	ConversationId?: string;
};

const toItem = (reminder: Reminder): ReminderItem => ({
	ReminderId: reminder.id,
	UserId: reminder.userId,
	UserName: reminder.userName,
	ChannelId: reminder.channelId,
	Message: reminder.message,
	NextRunAt: reminder.nextRunAt,
	Cron: reminder.cron,
	ConversationId: reminder.conversationId,
});

const fromItem = (item: ReminderItem): Reminder => ({
	id: item.ReminderId,
	userId: item.UserId,
	userName: item.UserName,
	channelId: item.ChannelId,
	message: item.Message,
	nextRunAt: item.NextRunAt,
	cron: item.Cron,
	conversationId: item.ConversationId,
});

/**
 * リマインダーを保存します（同じIDがあれば上書き）
 */
export const putReminder = async (reminder: Reminder): Promise<void> => {
	await docClient.send(
		new PutCommand({
			TableName: REMINDERS_TABLE_NAME,
			Item: toItem(reminder),
		}),
	);
};

export const deleteReminder = async (id: string): Promise<void> => {
	await docClient.send(
		new DeleteCommand({
			TableName: REMINDERS_TABLE_NAME,
			Key: { ReminderId: id },
		}),
	);
};

/**
 * すべてのリマインダーを読み出します
 * 起動時にタイマーを予約し直すときだけ使う
 */
export const scanReminders = async (): Promise<Reminder[]> => {
	const reminders: Reminder[] = [];
	let exclusiveStartKey: ScanCommandOutput["LastEvaluatedKey"];
	do {
		const response = await docClient.send(
			new ScanCommand({
				TableName: REMINDERS_TABLE_NAME,
				ExclusiveStartKey: exclusiveStartKey,
			}),
		);
		for (const item of response.Items ?? []) {
			reminders.push(fromItem(item as ReminderItem));
		}
		exclusiveStartKey = response.LastEvaluatedKey;
	} while (exclusiveStartKey);
	return reminders;
};
