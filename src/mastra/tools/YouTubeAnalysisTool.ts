import { GoogleGenAI } from "@google/genai";
import { createTool } from "@mastra/core";
import { dedent } from "ts-dedent";
import { z } from "zod";
import { env } from "../../env.js";

export const YouTubeAnalysisTool = createTool({
	id: "YouTube Analysis",
	description: dedent(`
		Analyzes a YouTube video based on the provided URL and user request.
		This tool can be used to extract key information, summarize content,
		or answer specific questions about the video.
		Provide the YouTube video URL and a clear description of what you want to analyze or extract.
	`),
	inputSchema: z.object({
		videoUrl: z
			.string()
			.url()
			.describe("The URL of the YouTube video to be analyzed."),
		userRequest: z
			.string()
			.describe(
				"Specific instructions or questions about what to analyze in the YouTube video. For example, 'Summarize the video' or 'What are the key topics discussed?'",
			),
	}),
	execute: async ({ context }) => {
		try {
			const ai = new GoogleGenAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY });
			const response = await ai.models.generateContent({
				model: "gemini-2.5-flash-preview-09-2025",
				contents: [
					context.userRequest,
					{
						fileData: {
							fileUri: context.videoUrl,
						},
					},
				],
				config: {
					systemInstruction:
						"You are a YouTube video analysis expert. Analyze the provided video based on the user's request.",
				},
			});

			return response.text;
		} catch (error) {
			if (String(error).includes("the maximum number of tokens allowed")) {
				return "The video is too long to analyze in one go. Please provide a shorter video.";
			}

			if (String(error).includes("PERMISSION_DENIED")) {
				return "Unable to access the video. Private or unlisted videos cannot be analyzed. Please provide a public video URL.";
			}

			console.error(
				"[YouTubeAnalysisTool] Error analyzing YouTube video:",
				error,
			);
			return "Failed to analyze YouTube video.";
		}
	},
});
