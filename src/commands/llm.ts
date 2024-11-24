import { Command } from "@sapphire/framework";
import { getCompletion } from "../lib/llm.js";

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
		const userName = interaction.user.displayName;
		const answer = await getCompletion(userName, prompt);
		const message = `> ${prompt}
${answer}`;

		const chunks = message.match(/[\s\S]{1,2000}/g) || [];

		await interaction.editReply({
			content: chunks[0],
		});

		for (const chunk of chunks.slice(1)) {
			await interaction.followUp({ content: chunk });
		}

		return;
	}
}
