import { anthropic } from "@ai-sdk/anthropic";
import { Agent } from "@mastra/core/agent";
import { LibSQLStore } from "@mastra/libsql";
import { Memory } from "@mastra/memory";
import { SYSTEM_PROMPT_GAL } from "../../lib/systemPrompt.js";
import { CodeExecutionTool } from "../tools/CodeExecutionTool.js";
import { CodeGenerationTool } from "../tools/CodeGeneration.js";
import { DeepThinkTool } from "../tools/DeepThinkTool.js";
import { WebPageScrapingTool } from "../tools/WebPageScrapingTool.js";
import { WebResearchTool } from "../tools/WebResearchTool.js";

export const discordAgent = new Agent({
	defaultStreamOptions: {
		toolCallStreaming: true,
	},
	name: "Discord Agent",
	instructions: () => SYSTEM_PROMPT_GAL(),
	model: anthropic("claude-sonnet-4-20250514"),
	memory: new Memory({
		storage: new LibSQLStore({
			url: ":memory:",
		}),
		embedder: undefined,
		options: {
			semanticRecall: false,
			lastMessages: 10,
			threads: {
				generateTitle: false,
			},
		},
	}),
	tools: {
		WebResearchTool,
		WebPageScrapingTool,
		// MathTool,
		CodeExecutionTool,
		CodeGenerationTool,
		DeepThinkTool,
	},
});
