import { describe, expect, it } from "vitest";
import {
	buildRpcBody,
	FlightSearchError,
	parseRpcResponse,
} from "./googleFlights.js";

const decodeBody = (body: string) => {
	const wrapped = JSON.parse(
		decodeURIComponent(body.replace(/^f\.req=/, "")),
	) as [null, string];
	return JSON.parse(wrapped[1]) as unknown[];
};

const filtersOf = (body: string) => decodeBody(body)[1] as unknown[];

/** 実レスポンスと同じ入れ子構造を最小限で組み立てる */
const makeResponse = (best: unknown[], others: unknown[] = []) => {
	const payload = [null, null, [best], [others]];
	return `)]}'\n\n${JSON.stringify([[null, null, JSON.stringify(payload)]])}`;
};

const makeLeg = (
	from: string,
	to: string,
	opts: {
		depTime?: [number, number];
		arrTime?: [number, number];
		duration?: number;
		carrier?: unknown;
	} = {},
) => {
	const leg: unknown[] = new Array(33).fill(null);
	leg[3] = from;
	leg[6] = to;
	leg[8] = opts.depTime ?? [2, 15];
	leg[10] = opts.arrTime ?? [8, 40];
	leg[11] = opts.duration ?? 445;
	leg[20] = [2026, 11, 10];
	leg[21] = [2026, 11, 10];
	leg[22] = opts.carrier ?? ["TR", "883", null, "スクート"];
	return leg;
};

const makeItinerary = (
	price: number | null,
	legs: unknown[],
	airlines: string[],
	totalDuration?: number,
) => {
	const itinerary: unknown[] = new Array(10).fill(null);
	itinerary[1] = airlines;
	itinerary[2] = legs;
	itinerary[9] = totalDuration ?? null;
	return [itinerary, price === null ? null : [[null, price]]];
};

describe("buildRpcBody", () => {
	it("片道は trip コード 2 で 1 区間だけ送る", () => {
		const filters = filtersOf(
			buildRpcBody([{ from: "HND", to: "SIN", date: "2026-11-10" }], {
				seat: "economy",
				adults: 1,
			}),
		);
		expect(filters[2]).toBe(2);
		expect(filters[13]).toHaveLength(1);
	});

	it("往復は trip コード 1 で 2 区間を送る", () => {
		const filters = filtersOf(
			buildRpcBody(
				[
					{ from: "HND", to: "SIN", date: "2026-11-10" },
					{ from: "SIN", to: "HND", date: "2026-11-17" },
				],
				{ seat: "economy", adults: 1 },
			),
		);
		expect(filters[2]).toBe(1);
		expect(filters[13]).toHaveLength(2);
	});

	it("座席クラスと人数を反映する", () => {
		const filters = filtersOf(
			buildRpcBody([{ from: "HND", to: "SIN", date: "2026-11-10" }], {
				seat: "business",
				adults: 3,
			}),
		);
		expect(filters[5]).toBe(3);
		expect(filters[6]).toEqual([3, 0, 0, 0]);
	});

	it("maxStops は許容区間数として +1 して送り、未指定なら 0 になる", () => {
		const direct = filtersOf(
			buildRpcBody(
				[{ from: "HND", to: "SIN", date: "2026-11-10", maxStops: 0 }],
				{
					seat: "economy",
					adults: 1,
				},
			),
		);
		expect((direct[13] as unknown[][])[0][3]).toBe(1);

		const unlimited = filtersOf(
			buildRpcBody([{ from: "HND", to: "SIN", date: "2026-11-10" }], {
				seat: "economy",
				adults: 1,
			}),
		);
		expect((unlimited[13] as unknown[][])[0][3]).toBe(0);
	});
});

describe("parseRpcResponse", () => {
	it("価格・航空会社・便名・発着時刻を取り出す", () => {
		const text = makeResponse([
			makeItinerary(45162, [makeLeg("HND", "SIN")], ["スクート"], 445),
		]);
		const flights = parseRpcResponse(text, "JPY");

		expect(flights).toHaveLength(1);
		expect(flights[0]).toMatchObject({
			price: 45162,
			currency: "JPY",
			airlines: ["スクート"],
			stops: 0,
			durationMinutes: 445,
		});
		expect(flights[0].legs[0]).toMatchObject({
			from: "HND",
			to: "SIN",
			departure: "2026-11-10T02:15",
			arrival: "2026-11-10T08:40",
			airline: "スクート",
			flightNumber: "TR883",
		});
	});

	it("経由便では乗り継ぎ時間を含む総所要時間を使う", () => {
		// 区間の合計 545 分に対し、SGN での待ち時間 90 分を含む 635 分が正しい
		const text = makeResponse([
			makeItinerary(
				52718,
				[
					makeLeg("HND", "SGN", { duration: 410 }),
					makeLeg("SGN", "SIN", { duration: 135 }),
				],
				["ベトジェット・エア"],
				635,
			),
		]);
		const [flight] = parseRpcResponse(text, "JPY");

		expect(flight.stops).toBe(1);
		expect(flight.durationMinutes).toBe(635);
	});

	it("総所要時間が欠けている場合は区間の合計で代替する", () => {
		const text = makeResponse([
			makeItinerary(
				52718,
				[
					makeLeg("HND", "SGN", { duration: 410 }),
					makeLeg("SGN", "SIN", { duration: 135 }),
				],
				["ベトジェット・エア"],
			),
		]);
		expect(parseRpcResponse(text, "JPY")[0].durationMinutes).toBe(545);
	});

	it("区間を 1 つでも読めない便は捨てる", () => {
		// 黙って残すと経由便が直行便として、しかも誤った到着地で提示されてしまう
		const broken = makeLeg("SGN", "SIN");
		broken[20] = null;
		const text = makeResponse([
			makeItinerary(45162, [makeLeg("HND", "SIN")], ["スクート"], 445),
			makeItinerary(52718, [makeLeg("HND", "SGN"), broken], ["VJ"], 635),
		]);

		const flights = parseRpcResponse(text, "JPY");
		expect(flights).toHaveLength(1);
		expect(flights[0].price).toBe(45162);
	});

	it("価格が付かない便だけの場合は PARSE_ERROR にせず空配列を返す", () => {
		const text = makeResponse([
			makeItinerary(null, [makeLeg("HND", "SIN")], ["スクート"], 445),
		]);
		expect(parseRpcResponse(text, "JPY")).toEqual([]);
	});

	it("おすすめ便とその他の便をまとめ、安い順に並べる", () => {
		const text = makeResponse(
			[makeItinerary(90000, [makeLeg("HND", "SIN")], ["A"])],
			[makeItinerary(45162, [makeLeg("HND", "SIN")], ["B"])],
		);
		expect(parseRpcResponse(text, "JPY").map((f) => f.price)).toEqual([
			45162, 90000,
		]);
	});

	it("便が 0 件のレスポンスは空配列を返す", () => {
		expect(parseRpcResponse(makeResponse([]), "JPY")).toEqual([]);
	});

	it("便は返っているのに 1 件も解釈できなければ PARSE_ERROR を投げる", () => {
		// Google の仕様変更で構造が変わった状況を模し、黙って 0 件を返さないことを確認する
		const text = makeResponse([[["", [], []], [[null, 45162]]]]);
		expect(() => parseRpcResponse(text, "JPY")).toThrowError(
			expect.objectContaining({ code: "PARSE_ERROR" }),
		);
	});

	it("空のレスポンスは PARSE_ERROR を投げる", () => {
		expect(() => parseRpcResponse(")]}'", "JPY")).toThrowError(
			FlightSearchError,
		);
	});

	it("フライトデータが入っていないレスポンスは PARSE_ERROR を投げる", () => {
		expect(() =>
			parseRpcResponse(`)]}'\n${JSON.stringify([[]])}`, "JPY"),
		).toThrowError(expect.objectContaining({ code: "PARSE_ERROR" }));
	});
});
