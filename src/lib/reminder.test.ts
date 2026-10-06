import { describe, expect, it } from "vitest";
import { nextCronRun, validateCron } from "./reminder.js";

describe("validateCron", () => {
	it("毎日決まった時刻の cron 式は登録できる", () => {
		expect(validateCron("0 8 * * *")).toBeUndefined();
	});

	it("1時間ごとの cron 式は登録できる", () => {
		expect(validateCron("0 * * * *")).toBeUndefined();
	});

	it("1時間より短い間隔は登録できない", () => {
		expect(validateCron("*/30 * * * *")).toContain("at least 1 hour");
	});

	it("1日の中で一部だけ間隔が短い cron 式も登録できない", () => {
		expect(validateCron("0,30 8 * * *")).toContain("at least 1 hour");
	});

	it("秒のフィールドで毎秒を指定した cron 式は登録できない", () => {
		expect(validateCron("* * * * * *")).toContain("at least 1 hour");
	});

	it("不正な cron 式は登録できない", () => {
		expect(validateCron("not a cron")).toContain("Invalid cron expression");
	});
});

describe("nextCronRun", () => {
	it("日本時間で評価する", () => {
		const next = nextCronRun("0 8 * * *", new Date("2025-06-15T00:00:00Z"));
		// 日本時間 2025-06-15 09:00 の次の 8:00 は翌日
		expect(next?.toISOString()).toBe("2025-06-15T23:00:00.000Z");
	});

	it("指定した時刻ちょうどの回は含めない", () => {
		const next = nextCronRun("0 8 * * *", new Date("2025-06-14T23:00:00Z"));
		expect(next?.toISOString()).toBe("2025-06-15T23:00:00.000Z");
	});
});
