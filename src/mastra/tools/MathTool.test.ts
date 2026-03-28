import { describe, expect, it } from "vitest";
import { MathTool } from "./MathTool.js";

const evaluate = async (expression: string) => {
	// biome-ignore lint/style/noNonNullAssertion: execute is defined for this tool
	return MathTool.execute!({
		context: { expression },
		runtimeContext: {} as never,
		resourceId: "",
		threadId: "",
	});
};

describe("MathTool", () => {
	it("基本的な四則演算を評価する", async () => {
		expect(await evaluate("2 + 3")).toBe(5);
		expect(await evaluate("10 - 4")).toBe(6);
		expect(await evaluate("3 * 4")).toBe(12);
		expect(await evaluate("15 / 3")).toBe(5);
	});

	it("演算子の優先順位を正しく処理する", async () => {
		expect(await evaluate("2 + 3 * 4")).toBe(14);
	});

	it("三角関数を評価する", async () => {
		const result = (await evaluate("sin(pi / 4)")) as number;
		expect(result).toBeCloseTo(Math.SQRT2 / 2);
	});

	it("単位変換を行う", async () => {
		const result = await evaluate("2 inch to cm");
		expect(String(result)).toContain("cm");
	});

	it("不正な式の場合はエラーメッセージを返す", async () => {
		const result = await evaluate("invalid!!!");
		expect(String(result)).toContain("Error evaluating expression:");
	});

	it("変数の代入と参照ができる", async () => {
		const result = await evaluate("a = 5; a ^ 2");
		// math.jsはセミコロン区切りの複数式でResultSetを返す
		expect(String(result)).toContain("25");
	});
});
