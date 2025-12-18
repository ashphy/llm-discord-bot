import { anthropic } from "@ai-sdk/anthropic";
import { Agent } from "@mastra/core/agent";
import { LibSQLStore } from "@mastra/libsql";
import { Memory } from "@mastra/memory";
import { readWorkingMemory } from "../../db/workingMemory.js";
import { SYSTEM_PROMPT_GAL } from "../../lib/systemPrompt.js";
import { mcp } from "../mcp-servers/context7.js";
import { CodeExecutionTool } from "../tools/CodeExecutionTool.js";
import { CodeGenerationTool } from "../tools/CodeGeneration.js";
import { DeepThinkTool } from "../tools/DeepThinkTool.js";
import { UpdateWorkingMemoryTool } from "../tools/UpdateWorkingMemoryTool.js";
import { WebPageScrapingTool } from "../tools/WebPageScrapingTool.js";
import { WebResearchTool } from "../tools/WebResearchTool.js";
import { YouTubeAnalysisTool } from "../tools/YouTubeAnalysisTool.js";

export const discordAgent = new Agent({
	defaultStreamOptions: {
		toolCallStreaming: true,
	},
	name: "Discord Agent",
	instructions: async ({ runtimeContext }) => {
		const userId = runtimeContext.get("userId") as string;
		const workingMemory = await readWorkingMemory(userId);
		return SYSTEM_PROMPT_GAL(workingMemory?.memory);
	},
	model: anthropic("claude-sonnet-4-5-20250929"),
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
		YouTubeAnalysisTool,
		UpdateWorkingMemoryTool,
		...(await mcp.getTools()),
	},
});
