import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
	FlightSearchError,
	type FlightSearchErrorCode,
	searchFlights,
} from "../../lib/googleFlights.js";

// 全件返すとコンテキストを圧迫するので安い順に絞る
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;

const ERROR_MESSAGES: Record<FlightSearchErrorCode, string> = {
	BLOCKED:
		"Google にアクセスを拒否されました。時間を置いて再試行してください。",
	HTTP_ERROR: "Google からエラーが返りました。",
	TIMEOUT: "検索がタイムアウトしました。",
	CANCELLED: "検索が中断されました。",
	NETWORK_ERROR: "ネットワークエラーで Google に到達できません。",
	PARSE_ERROR:
		"レスポンスを解釈できませんでした。Google 側の仕様変更の可能性があります。",
};

export const FlightSearchTool = createTool({
	id: "Flight Search",
	description: `Search real-time airfares on Google Flights. Returns the cheapest itineraries with price, airline, flight number, departure/arrival times and number of stops.
Use this whenever the user asks about flight prices, fares, or how much it costs to fly somewhere.
Note: when returnDate is given the price is the round-trip total, but only the outbound legs are returned.`,
	inputSchema: z.object({
		from: z
			.string()
			.describe(
				"Departure airport IATA code (e.g. HND, NRT). City codes also work (TYO, NYC, LON).",
			),
		to: z.string().describe("Destination airport or city IATA code."),
		date: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/)
			.describe("Departure date in YYYY-MM-DD."),
		returnDate: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/)
			.optional()
			.describe("Return date in YYYY-MM-DD. Omit for a one-way search."),
		seat: z
			.enum(["economy", "premium-economy", "business", "first"])
			.optional()
			.describe("Cabin class. Defaults to economy."),
		adults: z
			.number()
			.int()
			.min(1)
			.max(9)
			.optional()
			.describe("Number of adult passengers. Defaults to 1."),
		maxStops: z
			.number()
			.int()
			.min(0)
			.max(3)
			.optional()
			.describe("Maximum number of stops. 0 means direct flights only."),
		currency: z
			.string()
			.length(3)
			.optional()
			.describe("ISO 4217 currency code. Defaults to JPY."),
		limit: z
			.number()
			.int()
			.min(1)
			.max(MAX_LIMIT)
			.optional()
			.describe(
				`Number of itineraries to return. Defaults to ${DEFAULT_LIMIT}.`,
			),
	}),
	execute: async ({ limit, ...params }) => {
		try {
			const flights = await searchFlights(params);

			if (flights.length === 0) {
				return {
					query: { ...params },
					flights: [],
					note: "条件に合う便が見つかりませんでした。",
				};
			}

			return {
				query: { ...params },
				total: flights.length,
				flights: flights.slice(0, limit ?? DEFAULT_LIMIT),
			};
		} catch (error) {
			if (error instanceof FlightSearchError) {
				return {
					error: {
						code: error.code,
						message: ERROR_MESSAGES[error.code],
						detail: error.message,
					},
				};
			}
			return {
				error: {
					code: "UNKNOWN",
					message: "フライト検索に失敗しました（理由不明）。",
					detail: error instanceof Error ? error.message : String(error),
				},
			};
		}
	},
});
