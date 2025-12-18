import { createTool } from "@mastra/core";
import { z } from "zod";
import { saveWorkingMemory } from "../../db/workingMemory.js";

export const UpdateWorkingMemoryTool = createTool({
	id: "updateWorkingMemory",
	description: "Update the working memory with new information",
	inputSchema: z.object({
		memory: z
			.string()
			.describe("The Markdown-formatted working memory content to store"),
	}),
	execute: async ({ context, runtimeContext }) => {
		const userId = runtimeContext.get("userId") as string;

		try {
			saveWorkingMemory(userId, { memory: context.memory });

			return { success: true };
		} catch (error) {
			if (error instanceof Error) {
				return `Error evaluating expression: ${error.message}`;
			}
			return `Error evaluating expression: ${String(error)}`;
		}
	},
});
