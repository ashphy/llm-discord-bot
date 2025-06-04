import OpenAI from "openai";
import { env } from "../env.js";
const openai = new OpenAI({
	apiKey: env.OPENAI_API_KEY,
});

export const moderate = async (text: string) => {
	const moderation = await openai.moderations.create({
		model: "omni-moderation-latest",
		input: text,
	});

	const flagged = moderation.results.some((result) => result.flagged);
	if (flagged) {
		console.warn(
			"[Moderation] flagged the text:",
			text,
			"Results:",
			JSON.stringify(moderation.results),
		);
	}

	return flagged;
};
