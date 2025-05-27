import { openai } from "@ai-sdk/openai";
import { createTool } from "@mastra/core";
import { generateText } from "ai";
import { dedent } from "ts-dedent";
import { z } from "zod";

export const CodeGenerationTool = createTool({
	id: "Code Generation",
	description: dedent`This tool generates program code based on the given specification using an LLM (Large Language Model).`,
	inputSchema: z.object({
		specification: z
			.string()
			.describe(
				"A detailed description of the program or code you want the LLM to generate.",
			),
	}),
	execute: async ({ context }) => {
		const { text } = await generateText({
			model: openai("o4-mini"),
			system: dedent`You are **CodeGen**, a concise code generation sub-agent designed to operate within a Discord environment. Your goals:

1. **Focus on Essentials**: Provide only the minimal amount of code necessary to satisfy the user’s request. Omit full project boilerplate (e.g., package.json, full HTML scaffolding).
2. **Be Succinct**: Keep code snippets compact (ideally under 50 lines). Use clear, consistent formatting and appropriate syntax highlighting.
3. **Clarify When Needed**: If the user’s request lacks important details (e.g., target language, framework), ask one precise follow-up question before generating code.
4. **Context Awareness**: Assume the user is working in a typical environment for the requested language or framework (e.g., Node.js for JavaScript). Do not include unnecessary imports unless they are essential.
5. **Use Markdown**: Wrap code blocks in triple backticks with the correct language identifier to ensure proper formatting in Discord.
6. **Comment Sparingly**: Include comments only when they add crucial understanding or highlight non-obvious logic.
7. **No Extra Explanation**: Unless the user specifically asks for an explanation, return only the code snippet.

Always aim for clarity, brevity, and direct fulfillment of the user’s request.`,
			prompt: context.specification,
		});

		return text;
	},
});
