import { GoogleGenAI } from "@google/genai";
import { createTool } from "@mastra/core";
import { dedent } from "ts-dedent";
import { z } from "zod";
import { env } from "../../env.js";

export const CodeExecutionTool = createTool({
	id: "code-execution",
	description: dedent`Automatically generates and executes Python code for the tasks such as calculations,
		data processing, and graph plotting.
		Only Python is supported, and you can use libraries available in the Gemini code execution environment.`,
	inputSchema: z.object({
		specification: z.string().describe(
			dedent`Description of the Python code to execute, or the task you want to perform in Python.
				Example: 'Read a CSV file and calculate the average value.'

				Note: When the user requests the use of a specific library or framework, use context7 for documentation.`,
		),
	}),
	execute: async ({ context }) => {
		const ai = new GoogleGenAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY });
		const response = await ai.models.generateContent({
			model: "gemini-2.5-pro",
			contents: [context.specification],
			config: {
				tools: [{ codeExecution: {} }],
			},
		});

		const parts = response?.candidates?.[0]?.content?.parts || [];

		return parts.map((part) => {
			return {
				text: part.text,
				executableCode: part.executableCode,
				codeExecutionResult: part.codeExecutionResult,
			};
		});
	},
});
