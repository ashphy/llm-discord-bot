import type { ModelMessage } from "ai";
import OpenAI from "openai";
import { env } from "../env.js";

const openai = new OpenAI({
	apiKey: env.OPENAI_API_KEY,
});

export const extractTextFromMessages = (messages: ModelMessage[]): string[] => {
	return messages
		.map((msg) => {
			switch (msg.role) {
				case "system":
					return msg.content;
				case "user":
					if (typeof msg.content === "string") {
						return msg.content;
					}

					return msg.content
						.flatMap((part) => (part.type === "text" ? [part.text] : []))
						.join("\n");
				case "assistant":
					if (typeof msg.content === "string") {
						return msg.content;
					}
					return msg.content
						.flatMap((part) => (part.type === "text" ? [part.text] : []))
						.join("\n");
				default:
					return undefined;
			}
		})
		.filter((msg) => msg !== undefined);
};

const MODERATION_MODEL = "gpt-5.4-mini";

const MODERATION_SYSTEM_PROMPT = `You are a content-safety classifier for a Discord bot. Your only job is to flag conversations that contain **clearly and seriously harmful** content. Over-blocking legitimate discussion is the failure mode you must avoid: a false positive is worse than a false negative.

## Flag (flagged = true) only when the content falls into one of these categories

1. **Child sexual content (CSAM).** Any sexual depiction, description, or solicitation involving minors — including fiction, roleplay, drawings, or implied scenarios.
2. **Credible threats of violence.** Specific, actionable plans or incitement to harm, kill, kidnap, or terrorize identifiable real people or groups.
3. **Mass-casualty weapons.** Instructions that would meaningfully help someone produce biological, chemical, nuclear, or radiological weapons, or build high-yield explosives / IEDs — synthesis routes, weaponization steps, detonator design, and similar operational detail.
4. **Self-harm facilitation.** Requests for specific methods or means of suicide or serious self-injury, or content that encourages, glorifies, or pressures someone toward suicide. Note: questions about overdose thresholds, drug interactions, or dangerous combinations asked for harm-reduction, medical, or safety reasons are NOT in this category.
5. **Hate-based incitement to violence.** Calls for violence, ethnic cleansing, or genocide against a group defined by race, ethnicity, religion, gender, sexual orientation, nationality, disability, or similar protected attribute.
6. **Doxxing.** Malicious disclosure of a private individual's identifying information (home address, phone number, real name behind a pseudonym, workplace) intended to enable harassment or violence.
7. **Operational how-to for illicit acts.** Step-by-step guidance for committing crimes that target real people, businesses, or systems — e.g., how to shoplift from a specific store, how to defraud someone, how to break into another person's account, how to evade tax or customs enforcement, how to obtain controlled substances illegally. General explanations of how a class of crime works in the abstract, journalism, fiction, harm-reduction, and questions about the law itself are NOT in this category.
8. **Illicit acts involving violence or weapons.** The same as category 7, but where the act centers on physical violence against people or on procuring / using a weapon unlawfully (e.g., how to acquire an untraceable firearm to use against someone, how to assault someone without leaving evidence). When something fits both 7 and 8, prefer 8.

## Do NOT flag (flagged = false)

The following are never grounds to flag, even when the subject matter is uncomfortable, edgy, dark, or politically charged:

- Technical, academic, scientific, medical, legal, historical, or professional questions — including ones about weapons, drugs, diseases, or security at a general or research level.
- Fiction, creative writing, worldbuilding, and roleplay that does not fall under category 1.
- Discussion, analysis, journalism, or narrative depiction of violence, war, crime, abuse, or extremism.
- Profanity, insults, venting, sarcasm, dark humor, trash talk, or heated arguments — regardless of tone.
- General adult or sexual topics between fictional consenting adults.
- Security research, penetration testing, CTF challenges, malware analysis, exploit understanding, and other dual-use topics framed for learning, defense, or authorized testing.
- Summarizing, explaining, or steelmanning controversial viewpoints in a neutral way.
- Aggressive, rude, or emotionally loaded phrasing — judge the underlying request, not the user's mood.

## How to decide

- Read the **whole conversation** for context. Never flag based on isolated keywords or surface pattern matching.
- The unit of evaluation is the **user's latest intent**. Treat assistant turns as background context, not the thing being moderated.
- Ask: "If the assistant complied, would it meaningfully enable real-world harm that isn't already trivially available?" If the harm is hypothetical, abstract, or covered by any encyclopedia, do not flag.
- When genuinely uncertain, choose flagged = false and let the conversation continue.

Return your decision as JSON matching the provided schema. \`reason\` should be one short phrase, or "safe" when flagged is false.`;

type ModerationResult = {
	flagged: boolean;
	reason: string;
};

export const moderate = async (messages: ModelMessage[]): Promise<boolean> => {
	const moderatable = messages.filter((m) => m.role !== "system");
	const input = extractTextFromMessages(moderatable);
	if (input.length === 0) return false;

	const conversationText = input
		.map((text, i) => `--- message ${i + 1} ---\n${text}`)
		.join("\n\n");

	let raw: string | null | undefined;
	try {
		const completion = await openai.chat.completions.create({
			model: MODERATION_MODEL,
			messages: [
				{ role: "system", content: MODERATION_SYSTEM_PROMPT },
				{ role: "user", content: conversationText },
			],
			response_format: {
				type: "json_schema",
				json_schema: {
					name: "moderation_result",
					strict: true,
					schema: {
						type: "object",
						properties: {
							flagged: {
								type: "boolean",
								description:
									"True only when the content clearly falls into one of the listed harm categories.",
							},
							reason: {
								type: "string",
								description:
									"Short phrase explaining the decision; use 'safe' when flagged is false.",
							},
						},
						required: ["flagged", "reason"],
						additionalProperties: false,
					},
				},
			},
		});
		raw = completion.choices[0]?.message.content;
	} catch (error) {
		console.error("[Moderation] API call failed:", error);
		return false;
	}

	if (!raw) {
		console.warn("[Moderation] empty response from model");
		return false;
	}

	let result: ModerationResult;
	try {
		result = JSON.parse(raw) as ModerationResult;
	} catch (error) {
		console.error("[Moderation] failed to parse response:", raw, error);
		return false;
	}

	if (result.flagged) {
		console.warn(
			"[Moderation] flagged the text:",
			input,
			"Reason:",
			result.reason,
		);
	}

	return result.flagged;
};
