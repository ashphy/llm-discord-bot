/**
 * useReplyMessage - Discord botのメッセージ管理とストリーミング応答
 *
 * このファイルは、Discord botがAIエージェントからの応答をリアルタイムでユーザーに表示するための
 * メッセージ管理機能を提供します。
 *
 * 主な機能:
 * - AIの応答をストリーミング形式で段階的に表示
 * - Discordの2000文字制限に対応した自動メッセージ分割
 * - プロンプト、テキスト、ツール実行、エラーなど異なる種類のメッセージパートを管理
 * - スラッシュコマンド (/llm) と返信メッセージの両方に対応
 */
import { APICallError, RetryError, TypeValidationError } from "ai";
import { AttachmentBuilder, type Message } from "discord.js";
import { sliceChunks } from "../utils/sliceChunks.js";
import { snip } from "../utils/snip.js";

/**
 * 返信メッセージのパーツを表現する型定義
 * AIエージェントの応答を段階的に構築するために使用される
 */

/** ユーザーからのプロンプト（質問・指示）を表すパート */
type ReplyPromptPart = { type: "prompt"; prompt: string };

/** AIからのテキスト応答を表すパート */
type ReplyTextPart = { type: "text"; text: string };

/** AIがツールを実行していることを表すパート */
type ReplyToolCallPart = { type: "tool-call"; toolName: string };

/** エラーが発生したことを表すパート */
type ReplyErrorPart = { type: "error"; error: unknown };

/** 返信メッセージのパートを表現するユニオン型 */
export type ReplyPart =
	| ReplyPromptPart
	| ReplyTextPart
	| ReplyToolCallPart
	| ReplyErrorPart;

/**
 * ツール名をユーザー表示用の日本語名に変換する関数
 * AIエージェントが実行するツールの名前を、ユーザーにとって分かりやすい形式に変換します。
 *
 * @param toolName 内部的なツール名（例: "CodeExecutionTool"）
 * @returns ユーザー表示用の名前（例: "Code Execution (gemini-2.5-pro)"）
 */
const convertToolName = (toolName: string): string => {
	const mapping: Record<string, string> = {
		CodeExecutionTool: "Code Execution (gemini-2.5-pro)",
		MathTool: "Math Tool",
		WebPageScrapingTool: "Web Page Scraping (FireCrawl)",
		WebResearchTool: "Web Research (Perplexity Sonar)",
		CodeGenerationTool: "Code Generation (gpt-5.2)",
		DeepThinkTool: "Deep Think (gemini-3-pro-preview)",
		YouTubeAnalysisTool: "YouTube Analysis (gemini-2.5-flash-preview-09-2025)",
	};

	if (toolName in mapping) {
		return mapping[toolName];
	}

	return toolName;
};

/**
 * エラーオブジェクトをユーザー表示用の日本語メッセージに変換する関数
 * 様々な種類のエラー（AI SDK、ツール実行、一般的なエラーなど）を
 * ユーザーにとって理解しやすい日本語メッセージに変換します。
 *
 * @param error 変換対象のエラーオブジェクト
 * @returns ユーザー表示用の日本語エラーメッセージ
 */
const converErrorMessage = (error: unknown): string => {
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

/**
 * プログラミング言語からファイル拡張子を取得する関数
 * コードブロックの言語指定から適切なファイル拡張子を判定します。
 *
 * @param language プログラミング言語名（例: "javascript", "python", "typescript"）
 * @returns ファイル拡張子（例: ".js", ".py", ".ts"）
 */
const getFileExtension = (language: string): string => {
	const extensionMapping: Record<string, string> = {
		javascript: ".js",
		js: ".js",
		typescript: ".ts",
		ts: ".ts",
		python: ".py",
		py: ".py",
		java: ".java",
		cpp: ".cpp",
		"c++": ".cpp",
		c: ".c",
		csharp: ".cs",
		"c#": ".cs",
		php: ".php",
		ruby: ".rb",
		go: ".go",
		rust: ".rs",
		swift: ".swift",
		kotlin: ".kt",
		dart: ".dart",
		scala: ".scala",
		r: ".r",
		matlab: ".m",
		sql: ".sql",
		html: ".html",
		css: ".css",
		scss: ".scss",
		sass: ".sass",
		json: ".json",
		xml: ".xml",
		yaml: ".yaml",
		yml: ".yml",
		markdown: ".md",
		md: ".md",
		shell: ".sh",
		bash: ".sh",
		powershell: ".ps1",
		dockerfile: ".dockerfile",
	};

	const normalizedLanguage = language.toLowerCase().trim();
	return extensionMapping[normalizedLanguage] || ".txt";
};

/**
 * 言語ごとのファイル化閾値を取得する
 * シェルスクリプト系の言語は短いコマンド例が多いため、閾値を高く設定します。
 *
 * @param language プログラミング言語名
 * @returns ファイル化する最小行数
 */
const getMinCodeLines = (language: string): number => {
	const thresholds: Record<string, number> = {
		shell: 15,
		bash: 15,
		sh: 15,
		powershell: 15,
	};

	const normalizedLanguage = language.toLowerCase().trim();
	return thresholds[normalizedLanguage] ?? 10;
};

/**
 * テキストからコードブロックを検出し、長いものをファイル添付用データに変換する関数
 * コードブロックを検出し、言語ごとの閾値以上の行数の場合AttachmentBuilderとして準備します。
 *
 * @param text 解析対象のテキスト
 * @returns 変換結果（変更後のテキストと添付ファイル配列）
 */
const extractLargeCodeBlocks = (
	text: string,
): {
	modifiedText: string;
	attachments: AttachmentBuilder[];
} => {
	const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
	const attachments: AttachmentBuilder[] = [];
	let fileCounter = 1;

	const modifiedText = text.replace(codeBlockRegex, (match, language, code) => {
		const trimmedCode = code.trim();

		// コードの行数をカウント（空行も含む）
		const lineCount = trimmedCode.split("\n").length;

		// 言語ごとの閾値以上の場合のみファイル化
		const minCodeLines = getMinCodeLines(language);
		if (lineCount >= minCodeLines) {
			const extension = getFileExtension(language);
			const filename = `code_${fileCounter}${extension}`;

			// AttachmentBuilderを作成
			const attachment = new AttachmentBuilder(
				Buffer.from(trimmedCode, "utf-8"),
				{
					name: filename,
					description: `Generated code file (${language || "text"})`,
				},
			);

			attachments.push(attachment);
			fileCounter++;

			// 元のコードブロックを添付ファイル表示に置き換え
			return `📎 **${filename}** を添付しました`;
		}

		// 短いコードブロックはそのまま保持
		return match;
	});

	return { modifiedText, attachments };
};

/**
 * Discord botのメッセージ管理とストリーミング応答を行うメイン関数
 *
 * AIエージェントからの応答をリアルタイムで段階的に表示し、
 * Discordの2000文字制限に対応した自動メッセージ分割を行います。
 *
 * @param initialMessage 返信元のメッセージ（スラッシュコマンドの場合はundefined）
 * @param initialReplyParts 初期表示するメッセージパーツの配列（通常はプロンプト）
 * @param callbacks.onNewMessage 新しいメッセージを作成・送信するコールバック関数
 * @returns メッセージ管理用の関数オブジェクト
 */
export function useReplyMessage(
	initialMessage: Message<boolean> | undefined,
	initialReplyParts: ReplyPart[] = [],
	callbacks: {
		onNewMessage?: (
			isFirst: boolean,
			currentMessage: Message<boolean> | undefined,
			messageOptions: { content: string; files?: AttachmentBuilder[] },
		) => Promise<Message<boolean>>;
		onTyping?: () => Promise<void>;
	} = {},
) {
	const replyParts: ReplyPart[] = initialReplyParts;

	let currentReplyIndex = 0;
	let currentMessage: Message<boolean> | undefined;
	let firstMessageId: string | undefined;

	const typingTimerId = setInterval(async () => {
		if (callbacks.onTyping) {
			await callbacks.onTyping();
		}
	}, 10000 /* 10sec */);

	/**
	 * メッセージパーツの配列をDiscord表示用のテキストと添付ファイルに変換する内部関数
	 *
	 * 各パーツタイプを以下の形式で変換:
	 * - prompt: "> プロンプト内容" (引用形式、100文字で切り詰め)
	 * - text: そのまま表示（長いコードブロックは添付ファイル化）
	 * - tool-call: "-# ▷ ツール名" (Discord注釈形式)
	 * - error: 日本語エラーメッセージ
	 *
	 * @returns Discord表示用のテキストと添付ファイル配列
	 */
	const convertReplyToText = (): {
		text: string;
		attachments: AttachmentBuilder[];
	} => {
		let allAttachments: AttachmentBuilder[] = [];

		const textParts = replyParts
			.map((part) => {
				switch (part.type) {
					case "prompt":
						return `> ${snip(part.prompt)}`;
					case "text": {
						// テキスト部分から長いコードブロックを抽出してファイル化
						const { modifiedText, attachments } = extractLargeCodeBlocks(
							part.text,
						);
						allAttachments = [...allAttachments, ...attachments];
						return modifiedText;
					}
					case "tool-call":
						return `-# ▷ ${convertToolName(part.toolName)}`;
					case "error": {
						return converErrorMessage(part.error);
					}
				}
			})
			.join("\n");

		return { text: textParts, attachments: allAttachments };
	};

	/**
	 * 新しいメッセージパートを追加し、Discordメッセージを更新する核となる関数
	 *
	 * 処理の流れ:
	 * 1. 新しいパートを配列に追加
	 * 2. 全パーツをテキストに変換
	 * 3. 2000文字制限に対応してチャンクに分割
	 * 4. 各チャンクに対してメッセージ更新または新規作成
	 *
	 * メッセージ更新戦略:
	 * - 既存のメッセージが存在し、現在のインデックスと一致する場合: 編集
	 * - それ以外: 新規メッセージ作成（最初はisFirst=true、以降はfalse）
	 *
	 * @param part 追加するメッセージパート
	 */
	const updateReplyMessage = async (part: ReplyPart) => {
		replyParts.push(part);

		const { text, attachments } = convertReplyToText();
		const chunks = sliceChunks(text);

		for (let i = currentReplyIndex; i < chunks.length; i++) {
			const chunk = chunks[i];

			// 最後のチャンクの場合のみ添付ファイルを含める
			const messageOptions: { content: string; files?: AttachmentBuilder[] } = {
				content: chunk,
			};
			if (i === chunks.length - 1 && attachments.length > 0) {
				messageOptions.files = attachments;
			}

			if (currentReplyIndex === i && currentMessage) {
				// 既存のメッセージを編集
				await currentMessage.edit(messageOptions);
			} else {
				// 新規メッセージ
				if (i === 0) {
					currentMessage = await callbacks.onNewMessage?.(
						true,
						initialMessage,
						messageOptions,
					);
				} else {
					currentMessage = await callbacks.onNewMessage?.(
						false,
						currentMessage,
						messageOptions,
					);
				}

				firstMessageId = currentMessage?.id;
			}
		}

		currentReplyIndex = chunks.length - 1;
	};

	/**
	 * メッセージの最終化を行う関数
	 */
	const finishMessage = () => {
		clearInterval(typingTimerId);
	};

	/**
	 * 最初に作成されたメッセージのIDを取得する関数
	 * 会話の継続性を保つためにメッセージIDを保存する際に使用されます。
	 *
	 * @returns 最初のメッセージのID（存在しない場合はundefined）
	 */
	const getFirstMessageId = (): string | undefined => {
		return firstMessageId;
	};

	/**
	 * メッセージ管理用の関数群を返すオブジェクト
	 *
	 * @returns {Object} メッセージ管理インターフェース
	 * @returns {Function} updateReplyMessage - 新しいメッセージパートを追加し更新
	 * @returns {Function} write - タイピング表示開始（未実装）
	 * @returns {Function} getFirstMessageId - 最初のメッセージID取得
	 */
	return { updateReplyMessage, getFirstMessageId, finishMessage };
}
