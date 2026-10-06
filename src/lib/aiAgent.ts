import { RequestContext } from "@mastra/core/di";
import type { TextBasedChannel } from "discord.js";
import { readConversation } from "../db/readConversations.js";
import { saveConversation } from "../db/saveConversation.js";
import { mastra } from "../mastra/index.js";
import {
	CHANNEL_KEY,
	fetchChannelMessages,
	formatChannelMessages,
} from "./channelMessages.js";
import type { Conversation } from "./conversation.js";
import type { StoredImagePart } from "./discordImages.js";
import {
	drainGeneratedImages,
	GENERATED_IMAGES_KEY,
	type GeneratedImage,
} from "./generatedImages.js";
import { hydrateImageParts } from "./imageStore.js";
import { moderate } from "./moderation.js";
import { PENDING_REMINDERS_KEY, type PendingReminder } from "./reminder.js";
import { reminderScheduler } from "./reminderScheduler.js";

type LLMBotRuntimeContext = {
	userId: string;
	userName: string;
	/** 画像生成ツールが作った画像を受け取るためのキュー */
	generatedImages: GeneratedImage[];
	/** 過去のメッセージを取得するツールが読むチャンネル */
	channel?: TextBasedChannel;
	/** リマインダーのツールが登録したリマインダー。会話の保存時に確定させる */
	pendingReminders: PendingReminder[];
};

/** 呼び出し時に注入する直前のメッセージ数 */
const RECENT_MESSAGE_COUNT = 5;

/**
 * 直前のメッセージを探すときに取得する件数
 * Bot自身のメッセージを除いても RECENT_MESSAGE_COUNT 件残るよう多めに取る。
 * Discord API の上限 (100件) 以内なので1回のリクエストで済む
 */
const RECENT_MESSAGE_FETCH_LIMIT = 20;

export class AiAgent {
	conversation: Conversation;
	private pendingReminders: PendingReminder[] = [];

	constructor() {
		this.conversation = {
			messages: [],
		};
	}

	/**
	 * ユーザーのメッセージに対して返答を生成します
	 * @param username
	 * @param userMesage
	 * @param images 添付画像（S3への参照を持つパート）
	 * @param channelContext 呼び出し元のチャンネル。before より前のメッセージを注入する
	 * @returns
	 */
	async thinkAnswer(
		userMesage: string,
		userId: string,
		username: string,
		callbacks: {
			onTextMessage?: (text: string) => Promise<void>;
			onToolCall?: (toolName: string) => Promise<void>;
			onError?: (error: unknown) => Promise<void>;
			onFinish?: () => Promise<void>;
			onStepStart?: () => Promise<void>;
			onImage?: (image: GeneratedImage) => Promise<void>;
		} = {},
		images: StoredImagePart[] = [],
		channelContext?: { channel: TextBasedChannel; before?: string },
	) {
		const recentMessages = channelContext
			? await this.readRecentMessages(
					channelContext.channel,
					channelContext.before,
				)
			: "";

		// 画像生成ツールが添付画像を編集できるよう、S3への参照をテキストにも載せる
		const attachedImages =
			images.length > 0
				? `\n<attachedImages>\n${images.map((image) => image.image).join("\n")}\n</attachedImages>`
				: "";

		const promptText = `${recentMessages}<username>${username}</username>
<userMessage>${userMesage}</userMessage>${attachedImages}`;

		this.conversation.messages.push({
			role: "user",
			content:
				images.length > 0
					? [{ type: "text", text: promptText }, ...images]
					: promptText,
		});

		const isModerationFlagged = await moderate(this.conversation.messages);
		if (isModerationFlagged) {
			throw new Error(
				"このリクエストはモデレーションフィルタにより制限されました。",
			);
		}

		const requestContext = new RequestContext<LLMBotRuntimeContext>();
		requestContext.set("userId", userId);
		requestContext.set("userName", username);
		requestContext.set(PENDING_REMINDERS_KEY, this.pendingReminders);
		if (channelContext) {
			requestContext.set(CHANNEL_KEY, channelContext.channel);
		}

		// ツールはこのキューに生成画像を積み、ストリームを読みながら回収してDiscordへ送る
		const generatedImages: GeneratedImage[] = [];
		requestContext.set(GENERATED_IMAGES_KEY, generatedImages);

		const agent = mastra.getAgent("discordAgent");
		const messages = this.conversation.messages;

		// 会話履歴にはS3への参照だけを保持しているため、送信直前に実体へ差し替える
		const hydratedMessages = await hydrateImageParts(messages);

		const stream = await agent.stream(
			hydratedMessages as Parameters<typeof agent.stream>[0],
			{
				maxSteps: 30,
				requestContext,
				onFinish: ({ response }) => {
					// Mastra が返すのは ai-sdk 内部の ResponseMessage 型で、
					// 構造は ModelMessage と互換だが型としては別物のため変換する
					if (response.messages) {
						messages.push(...(response.messages as typeof messages));
					}
				},
			},
		);

		const flushGeneratedImages = async () => {
			for (const image of drainGeneratedImages(generatedImages)) {
				await callbacks.onImage?.(image);
			}
		};

		let text = "";
		for await (const chunk of stream.fullStream) {
			await flushGeneratedImages();

			switch (chunk.type) {
				case "step-start":
					await callbacks.onStepStart?.();
					break;
				case "text-delta":
					text += chunk.payload.text;
					break;
				case "tool-call":
					if (text.length > 0) {
						await callbacks.onTextMessage?.(text);
					}
					text = "";
					if (chunk.payload.toolName !== "UpdateWorkingMemoryTool") {
						await callbacks.onToolCall?.(chunk.payload.toolName);
					}
					break;
				case "error":
					console.error("Error in AI agent:", chunk.payload.error);
					await callbacks.onError?.(JSON.stringify(chunk.payload.error));
					break;
			}
		}

		if (text.length > 0) {
			await callbacks.onTextMessage?.(text);
		}

		await flushGeneratedImages();
		await callbacks.onFinish?.();
		return text;
	}

	/**
	 * チャンネルの直前のメッセージを、ユーザーメッセージに載せる形で返します
	 * Bot自身のメッセージは会話履歴に含まれているため除外します。
	 * 取得できなくても応答は続けられるため、失敗時は空文字を返します。
	 */
	private async readRecentMessages(
		channel: TextBasedChannel,
		before?: string,
	): Promise<string> {
		try {
			const messages = (
				await fetchChannelMessages(channel, {
					limit: RECENT_MESSAGE_FETCH_LIMIT,
					before,
				})
			)
				.filter((message) => message.author.id !== channel.client.user.id)
				.slice(-RECENT_MESSAGE_COUNT);
			if (messages.length === 0) return "";
			return `<recentChannelMessages>\n${formatChannelMessages(messages)}\n</recentChannelMessages>\n`;
		} catch (error) {
			console.error("Failed to fetch recent channel messages:", error);
			return "";
		}
	}

	/**
	 * 過去の会話履歴を読み込みます
	 * @param messageId
	 */
	async load(messageId: string) {
		// 会話履歴を取得
		const conversation = await readConversation(messageId);
		if (conversation) {
			this.conversation = conversation;
		}
	}

	/**
	 * 会話履歴をDBに保存し、この応答で登録されたリマインダーを確定させます
	 *
	 * 応答が複数のメッセージに分かれた場合、どのメッセージへの返信からでも
	 * 会話を辿れるように、作成したメッセージIDをすべて渡す必要があります。
	 *
	 * @param messageId 会話の実体を保存するメッセージID
	 * @param aliasMessageIds 同じ会話を指させる他のメッセージID
	 */
	async save(messageId: string, aliasMessageIds: string[] = []) {
		// 会話履歴を保存
		await saveConversation(messageId, this.conversation, aliasMessageIds);

		// 1回だけのリマインダーは、この応答への返信として会話の続きを通知する
		for (const reminder of this.pendingReminders.splice(0)) {
			await reminderScheduler.add(
				reminder.cron ? reminder : { ...reminder, conversationId: messageId },
			);
		}
	}
}
