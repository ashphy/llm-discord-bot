/**
 * sliceChunks - Discordの文字数制限に合わせてメッセージを分割する
 *
 * 単純に2000文字で切ると、コードブロックの途中で分断されて
 * 後続のメッセージが崩れる。行単位で区切りつつ、コードブロックの中で
 * 分割せざるを得ないときはフェンスを閉じ直してから次のチャンクで開き直す。
 *
 * この関数が受け取るのは複数のパートを連結した後のテキストで、
 * Discord固有の記法（-# など）も混ざっているため、Markdownとして
 * 再パースはせず行単位の状態管理だけで処理する。
 */

/** Discordの1メッセージあたりの最大文字数 */
const MAX_MESSAGE_LENGTH = 2000;

/** コードブロックのフェンス行（``` または ~~~） */
const FENCE_LINE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

export const sliceChunks = (message: string): string[] => {
	if (message === "") return [];
	if (message.length <= MAX_MESSAGE_LENGTH) return [message];

	const chunks: string[] = [];
	let current = "";
	/** 未閉じのコードブロックの開始行（次のチャンクで開き直すために保持する） */
	let openingFence: string | undefined;
	/** 未閉じのコードブロックを閉じる記号 */
	let closingFence: string | undefined;

	/** 開いているコードブロックを閉じるために確保しておく文字数 */
	const reserved = (): number => (closingFence ? closingFence.length + 1 : 0);

	/** 現在のチャンクを確定し、開いているコードブロックを引き継ぐ */
	const startNewChunk = (): void => {
		if (current === "") return;
		chunks.push(closingFence ? `${current}\n${closingFence}` : current);
		current = openingFence ?? "";
	};

	/** 現在のチャンクがまだ中身を持っていないか（開き直したフェンスだけの状態） */
	const isEmptyChunk = (): boolean => current === (openingFence ?? "");

	/** 1行を現在のチャンクへ追加する（入りきらなければ分割する） */
	const appendLine = (line: string): void => {
		let rest = line;

		while (true) {
			const separator = current === "" ? "" : "\n";
			const length =
				current.length + separator.length + rest.length + reserved();
			if (length <= MAX_MESSAGE_LENGTH) break;

			// チャンクを変えれば収まるなら、行を割らずに次のメッセージへ送る
			if (!isEmptyChunk()) {
				startNewChunk();
				continue;
			}

			// 1行だけで上限を超える場合は行の途中で割る
			const available = Math.max(
				1,
				MAX_MESSAGE_LENGTH - current.length - separator.length - reserved(),
			);
			current += separator + rest.slice(0, available);
			rest = rest.slice(available);
			startNewChunk();
		}

		current += current === "" ? rest : `\n${rest}`;
	};

	/** コードブロックの開閉状態を更新する */
	const updateFenceState = (line: string): void => {
		const match = FENCE_LINE.exec(line);
		if (!match) return;

		const [, marker, info] = match;
		if (!closingFence) {
			openingFence = line;
			closingFence = marker;
			return;
		}

		// 閉じフェンスは開始と同じ記号で、同じ長さ以上、情報文字列を持たない
		if (
			marker[0] === closingFence[0] &&
			marker.length >= closingFence.length &&
			info.trim() === ""
		) {
			openingFence = undefined;
			closingFence = undefined;
		}
	};

	for (const line of message.split("\n")) {
		appendLine(line);
		updateFenceState(line);
	}

	if (current !== "") chunks.push(current);

	return chunks;
};
