import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_PROMPT_GAL } from "./systemPrompt.js";

describe("SYSTEM_PROMPT_GAL", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("ギャルとしての基本情報を含む", () => {
		const prompt = SYSTEM_PROMPT_GAL();
		expect(prompt).toContain("アシスタントギャル");
		expect(prompt).toContain("あーし");
	});

	it("利用可能なツールの説明を含む", () => {
		const prompt = SYSTEM_PROMPT_GAL();
		expect(prompt).toContain("WebResearchTool");
		expect(prompt).toContain("CodeExecutionTool");
		expect(prompt).toContain("DeepThinkTool");
	});

	it("現在の日時情報を含む", () => {
		vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
		const prompt = SYSTEM_PROMPT_GAL();
		expect(prompt).toContain("CurrentDateTime");
		expect(prompt).toContain("Asia/Tokyo");
	});

	it("workingMemoryBlockなしの場合はWORKING_MEMORY_SYSTEM_INSTRUCTIONを含まない", () => {
		const prompt = SYSTEM_PROMPT_GAL();
		expect(prompt).not.toContain("WORKING_MEMORY_SYSTEM_INSTRUCTION");
	});

	it("workingMemoryBlockありの場合はWORKING_MEMORY_SYSTEM_INSTRUCTIONを含む", () => {
		const prompt = SYSTEM_PROMPT_GAL("## Memory\nSome memory content");
		expect(prompt).toContain("WORKING_MEMORY_SYSTEM_INSTRUCTION");
		expect(prompt).toContain("## Memory\nSome memory content");
	});
});
