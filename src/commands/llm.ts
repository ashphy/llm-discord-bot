import { Command } from "@sapphire/framework";
import { AiAgent } from "../lib/aiAgent.js";

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
		// 実行パラメータを取得
		await interaction.deferReply();
		const prompt = interaction.options.getString("prompt", true);
		const member = interaction.guild?.members.cache.get(interaction.user.id);
		const userName = member ? member.displayName : interaction.user.displayName;

		// AIに問い合わせ
		const aiAgent = new AiAgent();
		const answer = await aiAgent.thinkAnswer(userName, prompt);

		// Discordに送信するメッセージを作成
		const message = `> ${prompt}
${answer}`;

		// Discordは2000文字以上のメッセージを送信できないため、分割して送信
		const chunks = message.match(/[\s\S]{1,2000}/g) || [];
		const replyMessage = await interaction.editReply({
			content: chunks[0],
		});
		for (const chunk of chunks.slice(1)) {
			await interaction.followUp({ content: chunk });
		}

		// 会話履歴を保存
		const messageId = replyMessage.id;
		aiAgent.save(messageId);

		return;
	}
}
