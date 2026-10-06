import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Reminder } from "./reminder.js";

const { putMock, deleteMock, scanMock } = vi.hoisted(() => ({
	putMock: vi.fn(),
	deleteMock: vi.fn(),
	scanMock: vi.fn(),
}));

vi.mock("../db/reminders.js", () => ({
	putReminder: putMock,
	deleteReminder: deleteMock,
	scanReminders: scanMock,
}));

const { ReminderScheduler } = await import("./reminderScheduler.js");

const NOW = new Date("2025-06-15T00:00:00Z");

const oneTime = (overrides: Partial<Reminder> = {}): Reminder => ({
	id: "r1",
	userId: "u1",
	userName: "user",
	channelId: "c1",
	message: "会議",
	nextRunAt: "2025-06-15T00:30:00.000Z",
	conversationId: "m1",
	...overrides,
});

const daily = (overrides: Partial<Reminder> = {}): Reminder => ({
	id: "r2",
	userId: "u1",
	userName: "user",
	channelId: "c1",
	message: "朝の薬",
	// 日本時間 8:00
	nextRunAt: "2025-06-14T23:00:00.000Z",
	cron: "0 8 * * *",
	...overrides,
});

describe("ReminderScheduler", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
		putMock.mockReset().mockResolvedValue(undefined);
		deleteMock.mockReset().mockResolvedValue(undefined);
		scanMock.mockReset().mockResolvedValue([]);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("1回だけのリマインダーは時刻に通知して削除する", async () => {
		const onFire = vi.fn().mockResolvedValue(undefined);
		const scheduler = new ReminderScheduler();
		await scheduler.start(onFire);
		await scheduler.add(oneTime());

		await vi.advanceTimersByTimeAsync(30 * 60 * 1000 - 1);
		expect(onFire).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1);
		expect(onFire).toHaveBeenCalledWith(oneTime());
		expect(deleteMock).toHaveBeenCalledWith("r1");
		expect(scheduler.count("u1")).toBe(0);
	});

	it("繰り返しのリマインダーは通知後に次の回を予約する", async () => {
		const onFire = vi.fn().mockResolvedValue(undefined);
		const scheduler = new ReminderScheduler();
		await scheduler.start(onFire);
		await scheduler.add(daily({ nextRunAt: "2025-06-15T23:00:00.000Z" }));

		await vi.advanceTimersByTimeAsync(23 * 60 * 60 * 1000);
		expect(onFire).toHaveBeenCalledTimes(1);
		expect(scheduler.list("u1")[0].nextRunAt).toBe("2025-06-16T23:00:00.000Z");

		await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
		expect(onFire).toHaveBeenCalledTimes(2);
	});

	it("起動時に時刻を過ぎた1回だけのリマインダーはすぐに通知する", async () => {
		const reminder = oneTime({ nextRunAt: "2025-06-14T00:00:00.000Z" });
		scanMock.mockResolvedValue([reminder]);
		const onFire = vi.fn().mockResolvedValue(undefined);

		await new ReminderScheduler().start(onFire);
		await vi.advanceTimersByTimeAsync(0);

		expect(onFire).toHaveBeenCalledWith(reminder);
	});

	it("起動時に時刻を過ぎた繰り返しのリマインダーはその回を飛ばす", async () => {
		scanMock.mockResolvedValue([daily()]);
		const onFire = vi.fn().mockResolvedValue(undefined);

		const scheduler = new ReminderScheduler();
		await scheduler.start(onFire);
		await vi.advanceTimersByTimeAsync(0);

		expect(onFire).not.toHaveBeenCalled();
		expect(scheduler.list("u1")[0].nextRunAt).toBe("2025-06-15T23:00:00.000Z");
		expect(putMock).toHaveBeenCalled();
	});

	it("setTimeout の上限より先の予定も通知する", async () => {
		const onFire = vi.fn().mockResolvedValue(undefined);
		const scheduler = new ReminderScheduler();
		await scheduler.start(onFire);
		await scheduler.add(oneTime({ nextRunAt: "2025-08-15T00:00:00.000Z" }));

		await vi.advanceTimersByTimeAsync(30 * 24 * 60 * 60 * 1000);
		expect(onFire).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(31 * 24 * 60 * 60 * 1000);
		expect(onFire).toHaveBeenCalledTimes(1);
	});

	it("取り消したリマインダーは通知しない", async () => {
		const onFire = vi.fn().mockResolvedValue(undefined);
		const scheduler = new ReminderScheduler();
		await scheduler.start(onFire);
		await scheduler.add(oneTime());

		expect(await scheduler.cancel("u1", "r1")).toBe(true);
		await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

		expect(onFire).not.toHaveBeenCalled();
		expect(deleteMock).toHaveBeenCalledWith("r1");
	});

	it("他のユーザーのリマインダーは取り消せない", async () => {
		const scheduler = new ReminderScheduler();
		await scheduler.start(vi.fn());
		await scheduler.add(oneTime());

		expect(await scheduler.cancel("u2", "r1")).toBe(false);
		expect(scheduler.count("u1")).toBe(1);
	});

	it("通知に失敗しても次の回の予約は残る", async () => {
		const onFire = vi.fn().mockRejectedValue(new Error("Discord error"));
		vi.spyOn(console, "error").mockImplementation(() => {});
		const scheduler = new ReminderScheduler();
		await scheduler.start(onFire);
		await scheduler.add(daily({ nextRunAt: "2025-06-15T23:00:00.000Z" }));

		await vi.advanceTimersByTimeAsync(23 * 60 * 60 * 1000);

		expect(onFire).toHaveBeenCalledTimes(1);
		expect(scheduler.list("u1")[0].nextRunAt).toBe("2025-06-16T23:00:00.000Z");
	});
});
