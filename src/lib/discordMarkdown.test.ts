import { describe, expect, it } from "vitest";
import { displayWidth, toDiscordMarkdown } from "./discordMarkdown.js";

describe("displayWidth", () => {
	it("半角文字は1として数える", () => {
		expect(displayWidth("abc123")).toBe(6);
	});

	it("全角文字は2として数える", () => {
		expect(displayWidth("あア漢")).toBe(6);
	});

	it("全角記号を2として数える", () => {
		expect(displayWidth("￥＃")).toBe(4);
	});

	it("絵文字を2として数える", () => {
		expect(displayWidth("🔍")).toBe(2);
	});

	it("混在した文字列を数える", () => {
		expect(displayWidth("価格: 1000")).toBe(4 + 1 + 1 + 4);
	});

	it("空文字は0", () => {
		expect(displayWidth("")).toBe(0);
	});
});

describe("toDiscordMarkdown - 変更しないもの", () => {
	it("装飾のないテキストはそのまま返す", () => {
		expect(toDiscordMarkdown("ただのテキストです")).toBe("ただのテキストです");
	});

	it("空文字はそのまま返す", () => {
		expect(toDiscordMarkdown("")).toBe("");
	});

	it("空白のみの文字列はそのまま返す", () => {
		expect(toDiscordMarkdown("   ")).toBe("   ");
	});

	it("3段までの見出しは維持する", () => {
		expect(toDiscordMarkdown("# h1\n\n## h2\n\n### h3")).toBe(
			"# h1\n\n## h2\n\n### h3",
		);
	});

	it("太字・斜体・取り消し線を維持する", () => {
		expect(toDiscordMarkdown("**太字** と *斜体* と ~~取り消し~~")).toBe(
			"**太字** と *斜体* と ~~取り消し~~",
		);
	});

	it("コードブロックを維持する", () => {
		expect(toDiscordMarkdown("```js\nconst x = 1;\n```")).toBe(
			"```js\nconst x = 1;\n```",
		);
	});

	it("マスクリンクを維持する", () => {
		expect(toDiscordMarkdown("[タイトル](https://example.com/a)")).toBe(
			"[タイトル](https://example.com/a)",
		);
	});

	it("裸のURLを山括弧で囲まない（埋め込みプレビューを保つ）", () => {
		expect(toDiscordMarkdown("参考 https://example.com/a_b_c です")).toBe(
			"参考 https://example.com/a_b_c です",
		);
	});

	it("引用を維持する", () => {
		expect(toDiscordMarkdown("> 引用文")).toBe("> 引用文");
	});

	it("スポイラーを壊さない", () => {
		expect(toDiscordMarkdown("これは ||秘密|| です")).toBe(
			"これは ||秘密|| です",
		);
	});
});

describe("toDiscordMarkdown - 表", () => {
	it("小さい表は等幅のコードブロックにする", () => {
		const table = [
			"| 項目 | Aプラン | Bプラン |",
			"| --- | --- | --- |",
			"| 価格 | 1000円 | 1200円 |",
			"| 在庫 | 20 | 0 |",
		].join("\n");

		expect(toDiscordMarkdown(table)).toBe(
			[
				"```",
				"項目 | Aプラン | Bプラン",
				"-----+---------+--------",
				"価格 | 1000円  | 1200円",
				"在庫 | 20      | 0",
				"```",
			].join("\n"),
		);
	});

	it("幅が広い表はラベル付き箇条書きにする", () => {
		const table = [
			"| 項目 | 説明 | 備考 |",
			"| --- | --- | --- |",
			"| とても長い項目名がここに入ります | この列にはかなり長い説明文が入ります | 特になし |",
			"| 2つめ | みじかい | あり |",
		].join("\n");

		expect(toDiscordMarkdown(table)).toBe(
			[
				"**とても長い項目名がここに入ります**",
				"",
				"- 説明: この列にはかなり長い説明文が入ります",
				"- 備考: 特になし",
				"",
				"**2つめ**",
				"",
				"- 説明: みじかい",
				"- 備考: あり",
			].join("\n"),
		);
	});

	it("列数が多い表はラベル付き箇条書きにする", () => {
		const table = [
			"| a | b | c | d | e |",
			"| --- | --- | --- | --- | --- |",
			"| 1 | 2 | 3 | 4 | 5 |",
		].join("\n");

		const result = toDiscordMarkdown(table);
		expect(result).not.toContain("```");
		expect(result).toContain("**1**");
		expect(result).toContain("- b: 2");
		expect(result).toContain("- e: 5");
	});

	it("1列の表は見出しと箇条書きにする", () => {
		const table = ["| 単一 |", "| --- |", "| あ |", "| い |"].join("\n");
		expect(toDiscordMarkdown(table)).toBe("**単一**\n\n- あ\n- い");
	});

	it("本文行がない表は等幅のコードブロックにする", () => {
		const table = ["| A | B |", "| --- | --- |"].join("\n");
		expect(toDiscordMarkdown(table)).toBe("```\nA | B\n--+--\n```");
	});

	it("空セルがあっても桁が揃う", () => {
		const table = [
			"| 空セル | 値 |",
			"| --- | --- |",
			"| | 1 |",
			"| x | |",
		].join("\n");

		expect(toDiscordMarkdown(table)).toBe(
			[
				"```",
				"空セル | 値",
				"-------+---",
				"       | 1",
				"x      |",
				"```",
			].join("\n"),
		);
	});

	it("セル内のバッククォートはコードブロックを壊さないよう置き換える", () => {
		const table = ["| A | B |", "| --- | --- |", "| a`b | 1 |"].join("\n");
		expect(toDiscordMarkdown(table)).toContain("a'b");
	});

	it("ラベル付き箇条書きではセル内の装飾を保つ", () => {
		const table = [
			"| 項目 | 説明 | 備考 |",
			"| --- | --- | --- |",
			"| とても長い項目名がここに入ります | **強調された説明がここに入ります** | なし |",
		].join("\n");

		expect(toDiscordMarkdown(table)).toContain(
			"- 説明: **強調された説明がここに入ります**",
		);
	});
});

describe("toDiscordMarkdown - Discordが解釈できない記法", () => {
	it("水平線をサブテキストの罫線に置き換える", () => {
		expect(toDiscordMarkdown("前\n\n---\n\n後")).toBe(
			"前\n\n-# ────────────────\n\n後",
		);
	});

	it("4段以上の見出しを太字に落とす", () => {
		expect(toDiscordMarkdown("#### h4\n\n##### h5\n\n###### h6")).toBe(
			"**h4**\n\n**h5**\n\n**h6**",
		);
	});

	it("画像をリンクに降格する", () => {
		expect(toDiscordMarkdown("![猫](https://example.com/cat.png)")).toBe(
			"[猫](https://example.com/cat.png)",
		);
	});

	it("altテキストのない画像は裸のURLになる", () => {
		expect(toDiscordMarkdown("![](https://example.com/cat.png)")).toBe(
			"https://example.com/cat.png",
		);
	});

	it("タスクリストを記号に置き換える", () => {
		expect(toDiscordMarkdown("- [x] 完了\n- [ ] 未完了")).toBe(
			"- ☑ 完了\n- ☐ 未完了",
		);
	});

	it("ネストした引用を深さ1に潰す", () => {
		const result = toDiscordMarkdown("> 外側\n>\n> > 内側");
		expect(result).toContain("> 外側");
		expect(result).toContain("> 内側");
		expect(result).not.toContain("> > ");
	});

	it("HTMLタグを取り除く", () => {
		expect(toDiscordMarkdown("前\n\n<div>html</div>\n\n後")).toBe("前\n\n後");
	});

	it("参照リンクをインラインリンクへ展開する", () => {
		expect(
			toDiscordMarkdown("[タイトル][ref]\n\n[ref]: https://example.com/a"),
		).toBe("[タイトル](https://example.com/a)");
	});

	it("脚注を番号付きのサブテキストへ移す", () => {
		expect(toDiscordMarkdown("本文[^1]。\n\n[^1]: 脚注の内容")).toBe(
			"本文[1]。\n\n-# [1] 脚注の内容",
		);
	});

	it("複数の脚注を出現順に採番する", () => {
		const result = toDiscordMarkdown(
			"A[^a] B[^b]。\n\n[^a]: ひとつめ\n\n[^b]: ふたつめ",
		);
		expect(result).toBe("A[1] B[2]。\n\n-# [1] ひとつめ\n-# [2] ふたつめ");
	});
});

describe("toDiscordMarkdown - Discord固有記法の保護", () => {
	it("サブテキストをエスケープしない", () => {
		expect(toDiscordMarkdown("-# 小さい注釈")).toBe("-# 小さい注釈");
	});

	it("引用の中のサブテキストもエスケープしない", () => {
		expect(toDiscordMarkdown("> -# 小さい注釈")).toBe("> -# 小さい注釈");
	});

	it("メンションをエスケープしない", () => {
		expect(toDiscordMarkdown("<@123456789> さん")).toBe("<@123456789> さん");
	});

	it("ロールメンション・チャンネル・絵文字・タイムスタンプを保つ", () => {
		expect(
			toDiscordMarkdown("<@&12> <#34> <:name:56> <a:anim:78> <t:1700000000:R>"),
		).toBe("<@&12> <#34> <:name:56> <a:anim:78> <t:1700000000:R>");
	});

	it("下線として書かれた __ を太字に書き換えない", () => {
		expect(toDiscordMarkdown("__下線__ と **太字**")).toBe(
			"__下線__ と **太字**",
		);
	});
});

describe("toDiscordMarkdown - リスト", () => {
	it("箇条書きの記号を - に統一する", () => {
		expect(toDiscordMarkdown("* ひとつ\n* ふたつ")).toBe("- ひとつ\n- ふたつ");
	});

	it("番号付きリストとネストを維持する", () => {
		expect(toDiscordMarkdown("1. ひとつ\n2. ふたつ\n   * ネスト")).toBe(
			"1. ひとつ\n2. ふたつ\n   - ネスト",
		);
	});
});
