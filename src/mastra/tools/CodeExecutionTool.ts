import { GoogleGenAI } from "@google/genai";
import { createTool } from "@mastra/core";
import { dedent } from "ts-dedent";
import { z } from "zod";
import { env } from "../../env.js";

// "What is the sum of the first 50 prime numbers? " +
// 					"Generate and run code for the calculation, and make sure you get all 50.",

export const CodeExecutionTool = createTool({
	id: "Code Execution",
	description: dedent`Automatically generates and executes Python code for tasks such as calculation,
		data processing, and graph plotting.
		Only Python is supported, and you can use libraries available in the Gemini code execution environment.`,
	inputSchema: z.object({
		specification: z
			.string()
			.describe(
				"Description of the Python code to execute, or the task you want to perform in Python. Example: 'Read a CSV file and calculate the average value.'",
			),
	}),
	execute: async ({ context }) => {
		const ai = new GoogleGenAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY });
		const response = await ai.models.generateContent({
			model: "gemini-2.5-pro-preview-06-05",
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
