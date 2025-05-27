import { Mastra } from "@mastra/core";
import { createLogger } from "@mastra/core/logger";

import { LibSQLStore } from "@mastra/libsql";
import { discordAgent } from "./agents/diacordAgent.js";

export const mastra = new Mastra({
	agents: { discordAgent },
	storage: new LibSQLStore({
		url: ":memory:",
	}),
	logger: createLogger({
		name: "Mastra",
		level: "info",
	}),
});
