import { Command } from "@sapphire/framework";
import { AiAgent } from "../lib/aiAgent.js";
import { useReplyMessage } from "../lib/useReplyMessage.js";

export class LlmCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, { ...options });
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("llm")
				.setDescription("Ask me everything")
				.addStringOption((option) =>
					option
						.setName("prompt")
						.setDescription("The prompt to ask")
						.setRequired(true),
				),
		);
	}

	public override async chatInputRun(
		interaction: Command.ChatInputCommandInteraction,
	) {
		await interaction.deferReply();

		const prompt = interaction.options.getString("prompt", true);
		const member = interaction.guild?.members.cache.get(interaction.user.id);

		const userId = interaction.user.id;
		const userName = member ? member.displayName : interaction.user.displayName;

		// AIに問い合わせ
		const { updateReplyMessage, getFirstMessageId, finishMessage } =
			useReplyMessage(
				undefined,
				[
					{
						type: "prompt",
						prompt,
					},
				],
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
			const aiAgent = new AiAgent();
			await aiAgent.thinkAnswer(prompt, userId, userName, {
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
			});
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
