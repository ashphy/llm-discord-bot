/**
 * reminderScheduler - リマインダーをプロセス内のタイマーで予約する
 *
 * DynamoDB は再起動に備えた保存先としてだけ使い、定期的な読み込みはしない。
 * 起動時に全件を読み込んでタイマーを予約し直し、以降はメモリ上の一覧を正とする。
 * そのため Bot のプロセスが複数起動すると通知が重複する。
 */
import { deleteReminder, putReminder, scanReminders } from "../db/reminders.js";
import { nextCronRun, type Reminder } from "./reminder.js";

/** setTimeout に渡せる最大の遅延。これより先の予定は途中で予約し直す */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

type Entry = {
	reminder: Reminder;
	timer?: NodeJS.Timeout;
};

export class ReminderScheduler {
	private entries = new Map<string, Entry>();
	private onFire: (reminder: Reminder) => Promise<void> = async () => {};

	/**
	 * 保存済みのリマインダーを読み込んで予約します
	 * 停止中に時刻を過ぎた1回だけのリマインダーはすぐに通知し、
	 * 繰り返しのリマインダーはその回を飛ばして次の回を予約する。
	 */
	async start(onFire: (reminder: Reminder) => Promise<void>): Promise<void> {
		this.onFire = onFire;

		const now = new Date();
		for (const reminder of await scanReminders()) {
			if (!reminder.cron || new Date(reminder.nextRunAt) >= now) {
				this.schedule(reminder);
				continue;
			}

			const next = nextCronRun(reminder.cron, now);
			// 1件の保存に失敗しても、残りのリマインダーの予約は続ける
			try {
				if (next) {
					const updated = { ...reminder, nextRunAt: next.toISOString() };
					this.schedule(updated);
					await putReminder(updated);
				} else {
					await deleteReminder(reminder.id);
				}
			} catch (error) {
				console.error("Failed to update reminder:", error);
			}
		}
	}

	/**
	 * リマインダーを保存して予約します
	 */
	async add(reminder: Reminder): Promise<void> {
		await putReminder(reminder);
		this.schedule(reminder);
	}

	/**
	 * ユーザーのリマインダーを通知が近い順に返します
	 */
	list(userId: string): Reminder[] {
		return [...this.entries.values()]
			.map((entry) => entry.reminder)
			.filter((reminder) => reminder.userId === userId)
			.sort((a, b) => a.nextRunAt.localeCompare(b.nextRunAt));
	}

	count(userId: string): number {
		let count = 0;
		for (const { reminder } of this.entries.values()) {
			if (reminder.userId === userId) count++;
		}
		return count;
	}

	/**
	 * リマインダーを取り消します
	 * @returns 取り消せたか。他のユーザーのリマインダーは取り消せない
	 */
	async cancel(userId: string, id: string): Promise<boolean> {
		const entry = this.entries.get(id);
		if (!entry || entry.reminder.userId !== userId) return false;

		clearTimeout(entry.timer);
		this.entries.delete(id);
		await deleteReminder(id);
		return true;
	}

	private schedule(reminder: Reminder): void {
		clearTimeout(this.entries.get(reminder.id)?.timer);

		const delay = new Date(reminder.nextRunAt).getTime() - Date.now();
		const entry: Entry = { reminder };
		entry.timer = setTimeout(
			() => {
				if (delay > MAX_TIMEOUT_MS) {
					this.schedule(reminder);
				} else {
					void this.fire(reminder);
				}
			},
			Math.min(Math.max(delay, 0), MAX_TIMEOUT_MS),
		);
		this.entries.set(reminder.id, entry);
	}

	/**
	 * 次の予定を確定させてから通知します
	 * 通知や保存に失敗しても次の回の予約が残るよう、先にメモリ上の予定を更新する。
	 */
	private async fire(reminder: Reminder): Promise<void> {
		// プロセスが止まっていた間の回をまとめて通知しないよう、現在時刻より後の回を選ぶ
		const after = new Date(
			Math.max(new Date(reminder.nextRunAt).getTime(), Date.now()),
		);
		const next = reminder.cron ? nextCronRun(reminder.cron, after) : undefined;
		try {
			if (next) {
				const updated = { ...reminder, nextRunAt: next.toISOString() };
				this.schedule(updated);
				await putReminder(updated);
				// 保存を待つ間に取り消された場合、保存し直した分を消す
				if (this.entries.get(reminder.id)?.reminder !== updated) {
					await deleteReminder(reminder.id);
				}
			} else {
				this.entries.delete(reminder.id);
				await deleteReminder(reminder.id);
			}
		} catch (error) {
			console.error("Failed to update reminder:", error);
		}

		try {
			await this.onFire(reminder);
		} catch (error) {
			console.error("Failed to notify reminder:", error);
		}
	}
}

export const reminderScheduler = new ReminderScheduler();
