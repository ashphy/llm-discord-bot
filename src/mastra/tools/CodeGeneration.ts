import { openai } from "@ai-sdk/openai";
import { createTool } from "@mastra/core";
import { generateObject } from "ai";
import { dedent } from "ts-dedent";
import { z } from "zod";

const OutputSchema = z.object({
	code: z.string().describe("The generated code"),
	language: z
		.string()
		.describe("The programming language of the generated code"),
	description: z
		.string()
		.optional()
		.describe("Brief description of what the code does"),
});

export const CodeGenerationTool = createTool({
	id: "code-generation",
	description: dedent`Generates program code based on detailed specifications using an LLM (Large Language Model).
		Supports multiple programming languages and frameworks with proper Discord formatting.`,
	inputSchema: z.object({
		specification: z
			.string()
			.describe(
				"A detailed description of the program or code you want the LLM to generate. Include language, framework, and specific requirements.",
			),
	}),
	outputSchema: OutputSchema,
	execute: async ({ context }) => {
		try {
			const { object } = await generateObject({
				model: openai("gpt-4o"),
				system: dedent`You are **CodeGen**, a concise code generation agent for Discord environments.

**Core Principles:**
1. **Essential Code Only**: Provide minimal, functional code without unnecessary boilerplate
2. **Compact & Clear**: Keep snippets under 50 lines with consistent formatting
3. **Discord-Ready**: Format code blocks with proper language identifiers for Discord syntax highlighting
4. **Context-Aware**: Assume standard environments (Node.js for JavaScript, etc.)

**Response Format:**
Return a JSON object with:
- "code": Complete code block with markdown formatting (triple backticks + language)
- "language": Programming language identifier
- "description": Brief explanation (optional)

**Guidelines:**
- Use triple backticks with language identifiers for code blocks
- Include comments only for complex logic
- Ask clarifying questions if requirements are unclear
- When using specific libraries/frameworks, reference context7 for documentation

Return only the JSON object.`,
				prompt: context.specification,
				schema: OutputSchema,
				temperature: 1,
			});

			return object;
		} catch (error) {
			throw new Error(
				`Code generation failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	},
});
