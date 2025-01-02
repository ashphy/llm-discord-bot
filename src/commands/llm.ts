import { Command } from "@sapphire/framework";
import { AiAgent } from "../lib/aiAgent.js";
import { Models, findModel } from "../lib/models.js";
import { sliceChunks } from "../utils/sliceChunks.js";

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
				)
				.addStringOption((option) =>
					option
						.setName("model")
						.setDescription("The model to use")
						.addChoices(
							Models.map((model) => {
								return { name: model.label, value: model.id };
							}),
						),
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
		const model = findModel(interaction.options.getString("model"));
		if (model === undefined) throw new Error("Model not found");

		try {
			// AIに問い合わせ
			const aiAgent = new AiAgent(userName, model);
			const answer = await aiAgent.thinkAnswer(prompt);

			// Discordに送信するメッセージを作成
			const message = `> ${prompt}
${answer}`;

			// Discordは2000文字以上のメッセージを送信できないため、分割して送信
			const chunks = sliceChunks(message);
			const replyMessage = await interaction.editReply({
				content: chunks[0],
			});
			for (const chunk of chunks.slice(1)) {
				await interaction.followUp({ content: chunk });
			}
			// 会話履歴を保存
			const messageId = replyMessage.id;
			aiAgent.save(messageId);
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
