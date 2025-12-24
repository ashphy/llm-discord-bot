import { Mastra } from "@mastra/core";
import { ConsoleLogger } from "@mastra/core/logger";

import { LibSQLStore } from "@mastra/libsql";
import { discordAgent } from "./agents/diacordAgent.js";

export const mastra = new Mastra({
	agents: { discordAgent },
	storage: new LibSQLStore({
		url: ":memory:",
	}),
	logger: new ConsoleLogger({
		name: "Mastra",
		level: "info",
	}),
	telemetry: {
		enabled: false,
	},
});
