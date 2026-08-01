import { Command } from "@sapphire/framework";
import type { Attachment } from "discord.js";
import { AiAgent } from "../lib/aiAgent.js";
import { storeImageAttachments } from "../lib/discordImages.js";
import { useReplyMessage } from "../lib/useReplyMessage.js";

/** 画像を受け取るオプション名（Discordは1オプションにつき1ファイルまで） */
const IMAGE_OPTION_NAMES = ["image", "image2", "image3", "image4"] as const;

export class LlmCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options });
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setName("llm")
				.setDescription("Ask me everything")
				.addStringOption((option) =>
					option
						.setName("prompt")
						.setDescription("The prompt to ask")
						.setRequired(true),
				);

			// 必須オプションより後に並べる必要があるため、prompt の後に追加する
			for (const [index, name] of IMAGE_OPTION_NAMES.entries()) {
				builder.addAttachmentOption((option) =>
					option
						.setName(name)
						.setDescription(`The image to ask (${index + 1})`)
						.setRequired(false),
				);
			}

			return builder;
		});
	}

	public override async chatInputRun(
		interaction: Command.ChatInputCommandInteraction,
	) {
		await interaction.deferReply();

		const prompt = interaction.options.getString("prompt", true);
		const member = interaction.guild?.members.cache.get(interaction.user.id);

		const userId = interaction.user.id;
		const userName = member ? member.displayName : interaction.user.displayName;

		// 添付画像をS3に保存する
		const attachments = IMAGE_OPTION_NAMES.map((name) =>
			interaction.options.getAttachment(name),
		).filter((attachment): attachment is Attachment => attachment !== null);
		const { images, rejected } = await storeImageAttachments(
			attachments,
			userId,
		);

		// AIに問い合わせ
		const { updateReplyMessage, getFirstMessageId, finishMessage } =
			useReplyMessage(
				undefined,
				[
					{
						type: "prompt",
						prompt,
						imageCount: images.length,
					},
				],
				false,
				{
					onNewMessage: async (isFirst, _currentMessage, messageOptions) => {
						if (isFirst) {
							return await interaction.editReply(messageOptions);
						}

						return await interaction.followUp(messageOptions);
					},
					onTyping: async () => {
						const channel = interaction.channel;
						if (channel && "sendTyping" in channel) {
							await channel.sendTyping();
						}
					},
				},
			);

		try {
			for (const reason of rejected) {
				await updateReplyMessage({ type: "notice", text: reason });
			}

			const aiAgent = new AiAgent();
			await aiAgent.thinkAnswer(
				prompt,
				userId,
				userName,
				{
					onStepStart: async () => {},
					onTextMessage: async (text) => {
						await updateReplyMessage({
							type: "text",
							text,
						});
					},
					onToolCall: async (toolName) => {
						await updateReplyMessage({
							type: "tool-call",
							toolName,
						});
					},
					onError: async (error) => {
						await updateReplyMessage({
							type: "error",
							error: error,
						});
					},
					onFinish: async () => {
						const id = getFirstMessageId();
						if (id) {
							await aiAgent.save(id);
						}
					},
				},
				images,
			);
		} catch (error) {
			console.error("Error in LLM command:", error);
			if (error instanceof Error) {
				await interaction.editReply({
					content: `エラーが発生しました: ${error.message}`,
				});
			} else {
				await interaction.editReply({
					content: `エラーが発生しました: ${error}`,
				});
			}
		} finally {
			finishMessage();
		}

		return;
	}
}
