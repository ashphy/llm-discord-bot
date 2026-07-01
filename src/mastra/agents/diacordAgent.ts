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
	id: "discord-agent",
	name: "Discord Agent",
	instructions: async ({ requestContext }) => {
		const userId = requestContext.get("userId") as string;
		const workingMemory = await readWorkingMemory(userId);
		return SYSTEM_PROMPT_GAL(workingMemory?.memory);
	},
	model: anthropic("claude-sonnet-5"),
	memory: new Memory({
		storage: new LibSQLStore({
			id: "discord-agent-memory",
			url: ":memory:",
		}),
		options: {
			semanticRecall: false,
			lastMessages: 10,
			generateTitle: false,
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
		...(await mcp.listTools()),
	},
});
