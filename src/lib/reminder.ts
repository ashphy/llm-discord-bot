/**
 * reminder - ユーザーが登録したリマインダーの型と、時刻・cron式の扱い
 *
 * 1回だけのリマインダーは元の会話の続きとして通知するため、Botの応答メッセージID
 * (conversationId) を持つ。繰り返しのリマインダーは毎回新しい会話として通知する。
 * 同じ会話を続けると通知のたびに履歴が伸び、DynamoDBのアイテム上限 (400KB) に達するため。
 */
import { format } from "@formkit/tempo";
import { Cron } from "croner";

export type Reminder = {
	id: string;
	userId: string;
	userName: string;
	channelId: string;
	/** 通知する内容。会話を読まなくても分かるようにモデルが書いたもの */
	message: string;
	/** 次に通知する時刻 (ISO 8601) */
	nextRunAt: string;
	/** 繰り返しのリマインダーの cron 式 (REMINDER_TIMEZONE で評価する) */
	cron?: string;
	/** 1回だけのリマインダーで、続きとして通知する会話のメッセージID */
	conversationId?: string;
};

/**
 * 応答の送信前に登録されたリマインダー
 * ツールの実行時点では応答メッセージがまだ無く会話IDが決まらないため、
 * RequestContext に積んでおき、会話を保存するときに確定させる。
 */
export type PendingReminder = Omit<Reminder, "conversationId">;

/** RequestContext に登録待ちのリマインダーを載せるときのキー */
export const PENDING_REMINDERS_KEY = "pendingReminders";

export const REMINDER_TIMEZONE = "Asia/Tokyo";

export const MAX_REMINDERS_PER_USER = 10;

/** 繰り返しの最短間隔。通知のたびにモデルを呼ぶため、短い間隔を許すと利用料が増える */
export const MIN_RECURRING_INTERVAL_MS = 60 * 60 * 1000;

/** 間隔を検査するときに調べる実行回数。毎日の中で間隔が変わる cron 式も検出できる回数にする */
const INTERVAL_CHECK_RUNS = 50;

const createCron = (cron: string) =>
	new Cron(cron, { timezone: REMINDER_TIMEZONE });

/**
 * cron 式の次の実行時刻を返します
 * @param after この時刻より後の実行時刻を返す
 */
export const nextCronRun = (cron: string, after: Date): Date | undefined =>
	createCron(cron).nextRun(after) ?? undefined;

/**
 * 繰り返しのリマインダーとして登録できる cron 式か検査します
 * @returns 登録できない理由。登録できる場合は undefined
 */
export const validateCron = (cron: string): string | undefined => {
	let runs: Date[];
	try {
		runs = createCron(cron).nextRuns(INTERVAL_CHECK_RUNS);
	} catch (error) {
		return `Invalid cron expression: ${error instanceof Error ? error.message : String(error)}`;
	}

	if (runs.length === 0) return "The cron expression never runs";

	for (let i = 1; i < runs.length; i++) {
		if (runs[i].getTime() - runs[i - 1].getTime() < MIN_RECURRING_INTERVAL_MS) {
			return "The interval of a recurring reminder must be at least 1 hour";
		}
	}

	return undefined;
};

export const formatReminderTime = (date: Date): string =>
	format({ date, format: "YYYY-MM-DDTHH:mm:ssZ", tz: REMINDER_TIMEZONE });

/**
 * 通知時にモデルへ渡すユーザーメッセージ
 * システムプロンプトで <reminder> の意味を説明している
 */
export const buildReminderPrompt = (reminder: Reminder): string =>
	`<reminder>${reminder.message}</reminder>`;
