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
		const reply = await interaction.deferReply();

		const prompt = interaction.options.getString("prompt", true);
		const member = interaction.guild?.members.cache.get(interaction.user.id);
		const userName = member ? member.displayName : interaction.user.displayName;

		try {
			// AIに問い合わせ
			const { updateReplyMessage, write, getFirstMessageId } = useReplyMessage(
				undefined,
				[
					{
						type: "prompt",
						prompt,
					},
				],
				{
					onNewMessage: async (isFirst, currentMessage, text) => {
						if (isFirst) {
							return await interaction.editReply({ content: text });
						}

						return await interaction.followUp({ content: text });
					},
				},
			);

			const aiAgent = new AiAgent();
			await aiAgent.thinkAnswer(prompt, userName, {
				onStepStart: async () => {
					write();
				},
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
						error: JSON.stringify(error, null, 2),
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
			if (error instanceof Error) {
				await interaction.editReply({
					content: `エラーが発生しました: ${error.message}`,
				});
			} else {
				await interaction.editReply({
					content: `エラーが発生しました: ${error}`,
				});
			}
		}

		return;
	}
}
