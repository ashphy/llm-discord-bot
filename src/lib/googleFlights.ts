// Google Flights の内部 RPC (GetShoppingResults) を直接叩いて運賃を取得する。
// 公式 API ではないため、レスポンスは位置インデックスでしか読めない。
// 仕様変更で壊れたときに検知できるよう、パース失敗は握り潰さず PARSE_ERROR として投げる。

const RPC_URL =
	"https://www.google.com/_/FlightsFrontendUi/data/travel.frontend.flights.FlightsFrontendService/GetShoppingResults";
const UA =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";
const DEFAULT_TIMEOUT_MS = 15_000;

const SEAT_CODE = {
	economy: 1,
	"premium-economy": 2,
	business: 3,
	first: 4,
} as const;

export type SeatType = keyof typeof SEAT_CODE;

export type FlightSearchErrorCode =
	| "BLOCKED"
	| "HTTP_ERROR"
	| "TIMEOUT"
	| "CANCELLED"
	| "NETWORK_ERROR"
	| "PARSE_ERROR";

export class FlightSearchError extends Error {
	constructor(
		readonly code: FlightSearchErrorCode,
		message: string,
	) {
		super(message);
		this.name = "FlightSearchError";
	}
}

export interface FlightLeg {
	from: string;
	to: string;
	/** ISO 8601 のローカル日時 (例 2026-11-10T09:25)。タイムゾーンは現地時刻 */
	departure: string;
	arrival: string;
	durationMinutes: number;
	airline: string;
	/** 例 TR883 */
	flightNumber: string;
}

export interface Flight {
	price: number;
	currency: string;
	airlines: string[];
	/** 往復検索では往路のみの値 */
	durationMinutes: number;
	/** 往復検索では往路のみの値 */
	stops: number;
	/** 往復検索では往路の区間のみ。復路は Google 側が別リクエストを要求するため取得しない */
	legs: FlightLeg[];
}

export interface SearchFlightsParams {
	from: string;
	to: string;
	date: string;
	/** 指定すると往復として検索する */
	returnDate?: string;
	seat?: SeatType;
	adults?: number;
	maxStops?: number;
	currency?: string;
	language?: string;
	timeoutMs?: number;
	signal?: AbortSignal;
}

interface Segment {
	from: string;
	to: string;
	date: string;
	maxStops?: number;
}

// リクエストも位置インデックスの配列なので、埋めない枠は null のまま残す。
// 羅列すると意味が読めなくなるため、長さを確保してから使う枠だけ代入する。
function slots(length: number): unknown[] {
	return new Array(length).fill(null);
}

function encodeSegment(s: Segment): unknown[] {
	const seg = slots(15);
	seg[0] = [[[s.from, 0]]];
	seg[1] = [[[s.to, 0]]];
	// 経由回数ではなく「許容する区間数」を渡すため 1 を足す。未指定は 0 (制限なし)
	seg[3] = s.maxStops != null ? s.maxStops + 1 : 0;
	seg[6] = s.date;
	seg[14] = 3;
	return seg;
}

/** @internal テスト用に公開している */
export function buildRpcBody(
	segments: Segment[],
	opts: { seat: SeatType; adults: number },
): string {
	const criteria = slots(29);
	criteria[2] = segments.length > 1 ? 1 : 2; // 1: round-trip, 2: one-way
	criteria[4] = [];
	criteria[5] = SEAT_CODE[opts.seat];
	criteria[6] = [opts.adults, 0, 0, 0]; // 大人, 子供, 幼児(座席), 幼児(膝上)
	criteria[13] = segments.map(encodeSegment);
	criteria[17] = 1;

	const filters = [[], criteria, 1, 0, 0, 2];
	const wrapped = JSON.stringify([null, JSON.stringify(filters)]);
	return `f.req=${encodeURIComponent(wrapped)}`;
}

function pad(n: number): string {
	return String(n).padStart(2, "0");
}

function toIsoLocal(date: unknown, time: unknown): string | null {
	if (!Array.isArray(date) || date.length < 3) return null;
	const [y, m, d] = date;
	if (typeof y !== "number" || typeof m !== "number" || typeof d !== "number") {
		return null;
	}
	const h = Array.isArray(time) && typeof time[0] === "number" ? time[0] : 0;
	const min = Array.isArray(time) && typeof time[1] === "number" ? time[1] : 0;
	return `${y}-${pad(m)}-${pad(d)}T${pad(h)}:${pad(min)}`;
}

function parseLeg(raw: unknown): FlightLeg | null {
	if (!Array.isArray(raw)) return null;
	const departure = toIsoLocal(raw[20], raw[8]);
	const arrival = toIsoLocal(raw[21], raw[10]);
	if (!departure || !arrival) return null;

	// [22] は ["TR", "883", null, "スクート"] の形
	const carrier = Array.isArray(raw[22]) ? raw[22] : [];
	const code = typeof carrier[0] === "string" ? carrier[0] : "";
	const number = typeof carrier[1] === "string" ? carrier[1] : "";

	return {
		from: typeof raw[3] === "string" ? raw[3] : "",
		to: typeof raw[6] === "string" ? raw[6] : "",
		departure,
		arrival,
		durationMinutes: typeof raw[11] === "number" ? raw[11] : 0,
		airline: typeof carrier[3] === "string" ? carrier[3] : "",
		flightNumber: code && number ? `${code}${number}` : "",
	};
}

// 価格が付いていないだけの便と、構造を読めなかった便を区別する。
// 前者は「条件に合う便がない」で済むが、後者は仕様変更を疑うべき状況なので扱いが異なる。
type ParsedFlight =
	| { status: "ok"; flight: Flight }
	| { status: "no-price" }
	| { status: "unreadable" };

function parseFlight(raw: unknown, currency: string): ParsedFlight {
	if (!Array.isArray(raw)) return { status: "unreadable" };
	const itinerary = raw[0];
	if (!Array.isArray(itinerary)) return { status: "unreadable" };

	const rawLegs = itinerary[2];
	if (!Array.isArray(rawLegs) || rawLegs.length === 0) {
		return { status: "unreadable" };
	}

	// 1 区間でも読めなければ経由地や乗り継ぎ回数が狂うので、便ごと捨てる
	const legs: FlightLeg[] = [];
	for (const rawLeg of rawLegs) {
		const leg = parseLeg(rawLeg);
		if (!leg) return { status: "unreadable" };
		legs.push(leg);
	}

	const price = (raw[1] as unknown[] | undefined)?.[0];
	const amount = Array.isArray(price) ? price[1] : undefined;
	if (typeof amount !== "number" || amount <= 0) return { status: "no-price" };

	// [9] は乗り継ぎ時間を含む総所要時間。区間の合計では待ち時間が抜け落ちる
	const total = itinerary[9];

	return {
		status: "ok",
		flight: {
			price: amount,
			currency,
			airlines: Array.isArray(itinerary[1])
				? itinerary[1].filter((a): a is string => typeof a === "string")
				: [],
			durationMinutes:
				typeof total === "number" && total > 0
					? total
					: legs.reduce((sum, l) => sum + l.durationMinutes, 0),
			stops: legs.length - 1,
			legs,
		},
	};
}

/** @internal テスト用に公開している */
export function parseRpcResponse(text: string, currency: string): Flight[] {
	// Google は JSON ハイジャック対策の )]}' プレフィックスを付けて返す
	const stripped = text.replace(/^\)\]\}'?\s*/, "");
	if (!stripped.trim()) {
		throw new FlightSearchError("PARSE_ERROR", "空のレスポンスが返りました");
	}

	let payload: unknown;
	try {
		const outer = JSON.parse(stripped) as unknown;
		const inner = (outer as unknown[] | undefined)?.[0];
		const data = (inner as unknown[] | undefined)?.[2];
		if (typeof data !== "string") {
			throw new Error("フライトデータが [0][2] に見つかりません");
		}
		payload = JSON.parse(data);
	} catch (error) {
		throw new FlightSearchError(
			"PARSE_ERROR",
			`レスポンスの解析に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	if (!Array.isArray(payload)) {
		throw new FlightSearchError("PARSE_ERROR", "想定外のレスポンス形式です");
	}

	// [2][0] がおすすめ便、[3][0] がその他の便
	const best = (payload[2] as unknown[] | undefined)?.[0];
	const others = (payload[3] as unknown[] | undefined)?.[0];
	const raws = [
		...(Array.isArray(best) ? best : []),
		...(Array.isArray(others) ? others : []),
	];

	const parsed = raws.map((raw) => parseFlight(raw, currency));
	const flights = parsed.filter((p) => p.status === "ok").map((p) => p.flight);

	// 1 件も読めず、かつ読めなかった理由が価格欠落でないなら形式変更を疑う
	if (flights.length === 0 && parsed.some((p) => p.status === "unreadable")) {
		throw new FlightSearchError(
			"PARSE_ERROR",
			"便は返っていますが内容を解釈できませんでした",
		);
	}

	return flights.sort((a, b) => a.price - b.price);
}

export async function searchFlights(
	params: SearchFlightsParams,
): Promise<Flight[]> {
	const currency = params.currency ?? "JPY";
	const language = params.language ?? "ja";

	const segments: Segment[] = [
		{
			from: params.from,
			to: params.to,
			date: params.date,
			maxStops: params.maxStops,
		},
	];
	if (params.returnDate) {
		segments.push({
			from: params.to,
			to: params.from,
			date: params.returnDate,
			maxStops: params.maxStops,
		});
	}

	const body = buildRpcBody(segments, {
		seat: params.seat ?? "economy",
		adults: params.adults ?? 1,
	});

	const timeout = AbortSignal.timeout(params.timeoutMs ?? DEFAULT_TIMEOUT_MS);
	const signal = params.signal
		? AbortSignal.any([params.signal, timeout])
		: timeout;

	let res: Response;
	let text: string;
	try {
		res = await fetch(`${RPC_URL}?hl=${language}&curr=${currency}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
				"User-Agent": UA,
				Referer: "https://www.google.com/travel/flights/search",
				Origin: "https://www.google.com",
			},
			body,
			signal,
		});
		// 本文の受信中にも中断やコネクション断が起きるため、同じ catch の内側で読む
		text = await res.text();
	} catch (error) {
		if (params.signal?.aborted) {
			throw new FlightSearchError("CANCELLED", "検索が中断されました");
		}
		if (timeout.aborted) {
			throw new FlightSearchError("TIMEOUT", "検索がタイムアウトしました");
		}
		throw new FlightSearchError(
			"NETWORK_ERROR",
			error instanceof Error ? error.message : String(error),
		);
	}

	if (res.status === 429 || res.status === 403) {
		throw new FlightSearchError(
			"BLOCKED",
			`Google にアクセスを拒否されました (HTTP ${res.status})`,
		);
	}
	if (!res.ok) {
		throw new FlightSearchError("HTTP_ERROR", `HTTP ${res.status}`);
	}
	if (text.includes("g-recaptcha") || text.includes("/sorry/index")) {
		throw new FlightSearchError("BLOCKED", "CAPTCHA ページが返りました");
	}

	return parseRpcResponse(text, currency);
}
