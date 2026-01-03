import type { ModelMessage } from "ai";
import OpenAI from "openai";
import { env } from "../env.js";
const openai = new OpenAI({
	apiKey: env.OPENAI_API_KEY,
});

export const moderate = async (messages: ModelMessage[]) => {
	const input = messages
		.map((msg) => {
			switch (msg.role) {
				case "system":
					return msg.content;
				case "user":
					if (typeof msg.content === "string") {
						return msg.content;
					}

					return msg.content
						.map((part) => {
							if (part.type === "text") {
								return part.text;
							}
						})
						.join("\n");
				case "assistant":
					if (typeof msg.content === "string") {
						return msg.content;
					}
					return msg.content
						.map((part) => {
							if (part.type === "text") {
								return part.text;
							}
						})
						.join("\n");
				default:
					return undefined;
			}
		})
		.filter((msg) => msg !== undefined);

	const moderation = await openai.moderations.create({
		model: "omni-moderation-latest",
		input,
	});

	const flagged = moderation.results.some((result) => result.flagged);
	if (flagged) {
		console.warn(
			"[Moderation] flagged the text:",
			input,
			"Results:",
			JSON.stringify(moderation.results),
		);
	}

	return flagged;
};
