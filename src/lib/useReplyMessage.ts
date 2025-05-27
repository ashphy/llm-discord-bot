import type { Command } from "@sapphire/framework";
import { ChannelType, type Message } from "discord.js";
import { sliceChunks } from "../utils/sliceChunks.js";
import { snip } from "../utils/snip.js";

type ReplyPromptPart = { type: "prompt"; prompt: string };
type ReplyTextPart = { type: "text"; text: string };
type ReplyToolCallPart = { type: "tool-call"; toolName: string };
type ReplyErrorPart = { type: "error"; error: unknown };
export type ReplyPart =
	| ReplyPromptPart
	| ReplyTextPart
	| ReplyToolCallPart
	| ReplyErrorPart;

const convertToolName = (toolName: string): string => {
	const mapping: Record<string, string> = {
		CodeExecutionTool: "Code Execution (gemini-2.5-pro-preview-05-06)",
		MathTool: "Math Tool",
		WebPageScrapingTool: "Web Page Scraping (FireCraw)",
		WebResearchTool: "Web Research (Perplexity Sonar)",
		CodeGenerationTool: "Code Generation (o4-mini)",
		DeepThinkTool: "Deep Think (gemini-2.5-pro-preview-05-06)",
	};

	if (toolName in mapping) {
		return mapping[toolName];
	}

	return toolName;
};

export function useReplyMessage(
	initialMessage: Message<boolean> | undefined,
	initialReplyParts: ReplyPart[] = [],
	callbacks: {
		onNewMessage?: (
			isFirst: boolean,
			currentMessage: Message<boolean> | undefined,
			text: string,
		) => Promise<Message<boolean>>;
	} = {},
) {
	const replyParts: ReplyPart[] = initialReplyParts;

	let currentReplyIndex = 0;
	let currentMessage: Message<boolean> | undefined;
	let firstMessageId: string | undefined;

	const convertReplyToText = (): string => {
		return replyParts
			.map((part) => {
				switch (part.type) {
					case "prompt":
						return `> ${snip(part.prompt)}`;
					case "text":
						return part.text;
					case "tool-call":
						return `-# ▷ ${convertToolName(part.toolName)}`;
					case "error": {
						const errorMessage =
							part.error instanceof Error
								? part.error.message
								: String(part.error);
						return `エラーが発生しました: ${errorMessage}`;
					}
				}
			})
			.join("\n");
	};

	const updateReplyMessage = async (part: ReplyPart) => {
		replyParts.push(part);

		const text = convertReplyToText();
		const chunks = sliceChunks(text);

		for (let i = currentReplyIndex; i < chunks.length; i++) {
			const chunk = chunks[i];

			if (currentReplyIndex === i && currentMessage) {
				// 既存のメッセージを編集
				const mes = await currentMessage.edit({ content: chunk });
			} else {
				// 新規メッセージ
				if (i === 0) {
					currentMessage = await callbacks.onNewMessage?.(
						true,
						initialMessage,
						chunk,
					);
				} else {
					currentMessage = await callbacks.onNewMessage?.(
						false,
						currentMessage,
						chunk,
					);
				}

				firstMessageId = currentMessage?.id;
			}
		}

		currentReplyIndex = chunks.length - 1;
	};

	const write = () => {
		// const channel = interaction?.channel;
		// if (channel?.type === ChannelType.GuildText) {
		// 	channel.sendTyping();
		// }
	};

	const getFirstMessageId = (): string | undefined => {
		return firstMessageId;
	};

	return { updateReplyMessage, write, getFirstMessageId };
}
