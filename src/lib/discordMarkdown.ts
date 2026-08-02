/**
 * discordMarkdown - GFM を Discord が解釈できる Markdown へ機械的に変換する
 *
 * LLM は GitHub Flavored Markdown を前提に出力するが、Discord のレンダラは
 * その一部しかサポートしていない（表・水平線・画像・4段以上の見出しなど）。
 * プロンプトでの抑制は取りこぼしが多いため、送信直前に AST を経由して
 * Discord 方言へ書き換える。
 *
 * 変換の流れ:
 *   1. micromark/mdast で GFM としてパース
 *   2. 未対応ノードを Discord で表現できる形へ置換（transformNode）
 *   3. Discord 向けの設定で再シリアライズ
 *   4. Discord 固有記法のエスケープを復元（restoreDiscordSyntax）
 *
 * 注意: AiAgent は text-delta を蓄積し、ツール呼び出し直前と完了時にのみ
 * まとめて渡すため、この関数に来るテキストは常に文法的に完結している。
 */
import type {
	Definition,
	FootnoteDefinition,
	Html,
	ListItem,
	Nodes,
	Paragraph,
	PhrasingContent,
	Root,
	Table,
	TableCell,
} from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfmAutolinkLiteralToMarkdown } from "mdast-util-gfm-autolink-literal";
import { gfmStrikethroughToMarkdown } from "mdast-util-gfm-strikethrough";
import {
	defaultHandlers,
	type Options as ToMarkdownOptions,
	toMarkdown,
} from "mdast-util-to-markdown";
import { toString as toPlainText } from "mdast-util-to-string";
import { gfm } from "micromark-extension-gfm";
import { visit } from "unist-util-visit";

/** コードブロック表を選ぶ最大列数 */
const MAX_TABLE_COLUMNS = 4;

/** コードブロック表を選ぶ最大表示幅（半角換算） */
const MAX_TABLE_WIDTH = 55;

/** 水平線 (---) の代替として使うサブテキストの罫線 */
const THEMATIC_BREAK = "-# ────────────────";

/** チェック済みタスクの記号 */
const CHECKED_MARK = "☑ ";

/** 未チェックタスクの記号 */
const UNCHECKED_MARK = "☐ ";

/**
 * 全角として扱う文字の範囲
 * コードブロック内の表を桁揃えするために使う。
 */
const WIDE_CHARACTER =
	/[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/;

/** 絵文字も全角幅として扱う */
const EMOJI_CHARACTER = /\p{Extended_Pictographic}/u;

/**
 * 文字列の表示幅を半角換算で求める関数
 * 日本語を含む表を等幅フォントで桁揃えするために必要。
 *
 * @param text 計測対象の文字列
 * @returns 半角換算の表示幅
 */
export const displayWidth = (text: string): number => {
	let width = 0;
	for (const character of text) {
		width +=
			WIDE_CHARACTER.test(character) || EMOJI_CHARACTER.test(character) ? 2 : 1;
	}
	return width;
};

/** 変換中に参照する、木全体を走査して集めた情報 */
type ConvertContext = {
	/** 参照リンク定義 ([id]: url) */
	definitions: Map<string, Definition>;
	/** 脚注の定義（出現順に 1 から採番） */
	footnotes: Map<string, { index: number; node: FootnoteDefinition }>;
};

/**
 * エスケープを一切かけずにそのまま出力するためのノードを作る関数
 * mdast の html ノードは値をそのまま書き出すため、
 * Discord 固有記法（-# やコードブロック表）の埋め込みに利用する。
 */
const raw = (value: string): Html => ({ type: "html", value });

/** 単純なテキスト段落を作る関数 */
const paragraphOf = (children: PhrasingContent[]): Paragraph => ({
	type: "paragraph",
	children,
});

const HANDLERS: ToMarkdownOptions["handlers"] = {
	/**
	 * 既定のハンドラは URL とリンクテキストが同じとき `<url>` を出すが、
	 * Discord では山括弧が「埋め込みプレビューの抑制」を意味してしまう。
	 * 裸の URL は裸のまま出してプレビューを保つ。
	 */
	link: (node, parent, state, info) => {
		const [child] = node.children;
		const isBareUrl =
			!node.title &&
			node.children.length === 1 &&
			child.type === "text" &&
			(child.value === node.url || `mailto:${child.value}` === node.url);
		if (isBareUrl && child.type === "text") return child.value;
		return defaultHandlers.link(node, parent, state, info);
	},
};

/**
 * Discord 向けのシリアライズ設定
 *
 * 表・脚注・タスクリストは変換段階で別のノードへ置き換え済みのため、
 * gfm の拡張は取り消し線と自動リンクのみを読み込む。
 * 表の拡張を入れると `|` が常時エスケープされ、`||スポイラー||` が壊れる。
 *
 * 強調は記号を `*` に統一する。GFM の `__text__` は太字だが Discord では
 * 下線を意味するため、そのまま出すとモデルの「太字のつもり」が下線になる。
 * 代わりに下線は出力できなくなるが、システムプロンプトでも案内していない。
 */
const SERIALIZE_OPTIONS: ToMarkdownOptions = {
	extensions: [gfmStrikethroughToMarkdown(), gfmAutolinkLiteralToMarkdown()],
	bullet: "-",
	emphasis: "*",
	strong: "*",
	fence: "`",
	fences: true,
	listItemIndent: "one",
	handlers: HANDLERS,
};

/**
 * 木全体を走査して、リンク定義と脚注定義を集める関数
 * これらは変換の過程で取り除かれるため、事前に控えておく必要がある。
 */
const collectContext = (tree: Root): ConvertContext => {
	const definitions = new Map<string, Definition>();
	const footnotes = new Map<
		string,
		{ index: number; node: FootnoteDefinition }
	>();

	visit(tree, (node) => {
		if (node.type === "definition") {
			definitions.set(node.identifier, node);
		}
		if (node.type === "footnoteDefinition") {
			footnotes.set(node.identifier, {
				index: footnotes.size + 1,
				node,
			});
		}
	});

	return { definitions, footnotes };
};

/** 表のセルをプレーンテキストへ変換する関数 */
const cellToPlainText = (cell: TableCell | undefined): string =>
	cell ? toPlainText(cell).replace(/\s+/g, " ").trim() : "";

/**
 * 表をコードブロック内の等幅表として描画する関数
 * 桁揃えは半角換算の表示幅で行う。
 */
const renderCodeTable = (grid: string[][], columnCount: number): string => {
	const widths = Array.from({ length: columnCount }, (_, column) =>
		Math.max(...grid.map((row) => displayWidth(row[column] ?? ""))),
	);

	const renderRow = (row: string[]): string =>
		widths
			.map((width, column) => {
				const cell = row[column] ?? "";
				return cell + " ".repeat(width - displayWidth(cell));
			})
			.join(" | ")
			.trimEnd();

	const separator = widths.map((width) => "-".repeat(width)).join("-+-");
	const [header, ...body] = grid;
	const lines = [renderRow(header), separator, ...body.map(renderRow)];

	return ["```", ...lines, "```"].join("\n");
};

/**
 * 表を「1レコード=1ブロック」のラベル付き箇条書きへ変換する関数
 * 先頭列を見出し、残りの列を「- ラベル: 値」として並べる。
 */
const tableToLabelList = (table: Table, columnCount: number): Nodes[] => {
	const rows = table.children;
	const headers = (rows[0]?.children ?? []).map(cellToPlainText);
	const result: Nodes[] = [];

	// 1列だけの表は見出し＋単純な箇条書きにまとめる
	if (columnCount <= 1) {
		const items = rows.slice(1).map(
			(row): ListItem => ({
				type: "listItem",
				spread: false,
				children: [paragraphOf(row.children[0]?.children ?? [])],
			}),
		);
		if (items.length === 0) return [];
		const heading = rows[0]?.children[0];
		if (heading && heading.children.length > 0) {
			result.push(
				paragraphOf([{ type: "strong", children: heading.children }]),
			);
		}
		result.push({
			type: "list",
			ordered: false,
			spread: false,
			children: items,
		});
		return result;
	}

	for (const row of rows.slice(1)) {
		const [first, ...rest] = row.children;

		if (first && first.children.length > 0) {
			result.push(paragraphOf([{ type: "strong", children: first.children }]));
		}

		const items = rest
			.map((cell, index): ListItem | undefined => {
				if (cell.children.length === 0) return undefined;
				const label = headers[index + 1] ?? "";
				return {
					type: "listItem",
					spread: false,
					children: [
						paragraphOf([
							{ type: "text", value: label ? `${label}: ` : "" },
							...cell.children,
						]),
					],
				};
			})
			.filter((item) => item !== undefined);

		if (items.length > 0) {
			result.push({
				type: "list",
				ordered: false,
				spread: false,
				children: items,
			});
		}
	}

	return result;
};

/**
 * 表を Discord で読める形へ変換する関数
 *
 * 列数と表示幅が収まるうちはコードブロックの等幅表を使い、
 * はみ出す場合はラベル付き箇条書きへ落とす。
 */
const convertTable = (table: Table): Nodes[] => {
	const rows = table.children;
	if (rows.length === 0) return [];

	const grid = rows.map((row) =>
		row.children.map((cell) => cellToPlainText(cell).replaceAll("`", "'")),
	);
	const columnCount = Math.max(...grid.map((row) => row.length));

	// 1列の表は等幅表にする意味がないので箇条書きにする
	if (columnCount <= 1) return tableToLabelList(table, columnCount);

	const widths = Array.from({ length: columnCount }, (_, column) =>
		Math.max(...grid.map((row) => displayWidth(row[column] ?? ""))),
	);
	const totalWidth =
		widths.reduce((sum, width) => sum + width, 0) + 3 * (columnCount - 1);
	const fitsInCodeBlock =
		columnCount <= MAX_TABLE_COLUMNS && totalWidth <= MAX_TABLE_WIDTH;

	// 本文行がない表はラベル付き箇条書きにできないため等幅表にする
	if (rows.length < 2 || fitsInCodeBlock) {
		return [raw(renderCodeTable(grid, columnCount))];
	}

	return tableToLabelList(table, columnCount);
};

/**
 * 1ノードを Discord で表現できるノード列へ置き換える関数
 * 空配列を返すとそのノードは削除される。
 */
const transformNode = (node: Nodes, context: ConvertContext): Nodes[] => {
	switch (node.type) {
		// Discord は表を描画できない
		case "table":
			return convertTable(node);

		// Discord は水平線を描画できないため、サブテキストの罫線で代用する
		case "thematicBreak":
			return [raw(THEMATIC_BREAK)];

		// 見出しは ### までしか描画されない
		case "heading":
			if (node.depth <= 3 || node.children.length === 0) return [node];
			return [paragraphOf([{ type: "strong", children: node.children }])];

		// Discord は画像記法を描画しないのでリンクへ降格する
		case "image":
			return [
				{
					type: "link",
					url: node.url,
					title: node.title,
					children: [{ type: "text", value: node.alt || node.url }],
				},
			];

		// 参照リンクはインラインリンクへ展開する
		case "linkReference": {
			const definition = context.definitions.get(node.identifier);
			if (!definition) return node.children;
			return [
				{
					type: "link",
					url: definition.url,
					title: definition.title,
					children: node.children,
				},
			];
		}

		case "imageReference": {
			const definition = context.definitions.get(node.identifier);
			const alt = node.alt || node.identifier;
			if (!definition) return [{ type: "text", value: alt }];
			return [
				{
					type: "link",
					url: definition.url,
					title: definition.title,
					children: [{ type: "text", value: alt || definition.url }],
				},
			];
		}

		// 定義そのものは本文に出さない
		case "definition":
			return [];

		// 脚注定義は末尾へまとめて出し直す
		case "footnoteDefinition":
			return [];

		case "footnoteReference": {
			const footnote = context.footnotes.get(node.identifier);
			// text ノードにすると `[` がエスケープされるため生のまま埋め込む
			return [raw(`[${footnote ? footnote.index : node.identifier}]`)];
		}

		// 生 HTML は Discord では意味を持たないため取り除く
		case "html":
			return [];

		// タスクリストは記号で代用する
		case "listItem": {
			if (node.checked === null || node.checked === undefined) return [node];
			const mark = node.checked ? CHECKED_MARK : UNCHECKED_MARK;
			const first = node.children[0];
			if (first?.type === "paragraph") {
				first.children.unshift({ type: "text", value: mark });
			} else {
				node.children.unshift(paragraphOf([{ type: "text", value: mark }]));
			}
			node.checked = null;
			return [node];
		}

		// Discord は引用のネストを描画できないため深さ1に潰す
		case "blockquote":
			node.children = node.children.flatMap((child) =>
				child.type === "blockquote" ? child.children : [child],
			);
			return [node];

		default:
			return [node];
	}
};

/** 子ノードを深さ優先で変換する関数 */
const transformChildren = (node: Nodes, context: ConvertContext): void => {
	if (!("children" in node)) return;

	const next: Nodes[] = [];
	for (const child of node.children as Nodes[]) {
		transformChildren(child, context);
		next.push(...transformNode(child, context));
	}
	node.children = next as typeof node.children;
};

/**
 * 脚注をサブテキストとして末尾に追加する関数
 * Discord はサブテキストを複数行にできないため、1脚注1行に畳む。
 */
const appendFootnotes = (tree: Root, context: ConvertContext): void => {
	if (context.footnotes.size === 0) return;

	const lines = [...context.footnotes.values()]
		.sort((a, b) => a.index - b.index)
		.map(
			({ index, node }) =>
				`-# [${index}] ${toPlainText(node).replace(/\s+/g, " ").trim()}`,
		);

	tree.children.push(raw(lines.join("\n")));
};

/**
 * Discord 固有記法に付いてしまったエスケープを戻す関数
 *
 * mdast は `-#` の `-` をリスト開始と誤解されないようエスケープするが、
 * Discord はサブテキストとして解釈しなくなってしまう。
 * メンションやカスタム絵文字なども同様に復元する。
 */
const restoreDiscordSyntax = (text: string): string =>
	text
		.replace(/^((?:> )*)\\-#/gm, "$1-#")
		.replace(
			/\\<(@[!&]?\d+|#\d+|a?:\w+:\d+|t:\d+(?::[tTdDfFR])?|id:[\w-]+)>/g,
			"<$1>",
		);

/**
 * GFM の Markdown を Discord 方言へ変換する関数
 *
 * @param source LLM が出力した Markdown
 * @returns Discord で正しく描画される Markdown
 */
export const toDiscordMarkdown = (source: string): string => {
	if (source.trim() === "") return source;

	const tree = fromMarkdown(source, {
		extensions: [gfm()],
		mdastExtensions: [gfmFromMarkdown()],
	});

	const context = collectContext(tree);
	transformChildren(tree, context);
	appendFootnotes(tree, context);

	return restoreDiscordSyntax(toMarkdown(tree, SERIALIZE_OPTIONS)).trim();
};
