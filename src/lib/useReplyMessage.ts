import { err } from "@sapphire/framework";
import {
	APICallError,
	RetryError,
	ToolExecutionError,
	TypeValidationError,
} from "ai";
import type { Message } from "discord.js";
import { e, re } from "mathjs";
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
		WebPageScrapingTool: "Web Page Scraping (FireCrawl)",
		WebResearchTool: "Web Research (Perplexity Sonar)",
		CodeGenerationTool: "Code Generation (o4-mini)",
		DeepThinkTool: "Deep Think (gemini-2.5-pro-preview-05-06)",
	};

	if (toolName in mapping) {
		return mapping[toolName];
	}

	return toolName;
};

const converErrorMessage = (error: unknown): string => {
	if (ToolExecutionError.isInstance(error)) {
		return `ツール(${error.name})の実行中にエラーが発生しました: ${error.message}`;
	}

	if (TypeValidationError.isInstance(error)) {
		return `型検証エラーが発生しました: VALUE: ${error.value} MESSAGE: ${error.message}`;
	}

	if (APICallError.isInstance(error)) {
		return "API呼び出し中にエラーが発生しました";
	}

	if (RetryError.isInstance(error)) {
		return `リトライエラーが発生しました: ${error.message}`;
	}

	if (error instanceof Error) {
		return `エラーが発生しました: ${error.message}`;
	}

	return `エラーが発生しました: ${String(error)}`;
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
						return converErrorMessage(part.error);
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
