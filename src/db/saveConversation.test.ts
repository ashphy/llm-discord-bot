import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Conversation } from "../lib/conversation.js";

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock("./dynnamodb.js", () => ({
	docClient: { send: sendMock },
	CONVERSATIONS_TABLE_NAME: "Conversations",
}));

const { saveConversation } = await import("./saveConversation.js");

const conversation: Conversation = {
	messages: [{ role: "user", content: "こんにちは" }],
};

/** 送信されたPutCommandのItemを取り出す */
const putItems = () =>
	sendMock.mock.calls.map(
		(call) => call[0].input.Item as Record<string, unknown>,
	);

describe("saveConversation", () => {
	beforeEach(() => {
		sendMock.mockClear();
		sendMock.mockResolvedValue({});
	});

	it("エイリアスがなければ実体だけを保存する", async () => {
		await saveConversation("msg-1", conversation);

		expect(putItems()).toEqual([
			{ MessageId: "msg-1", Conversation: conversation },
		]);
	});

	it("エイリアスは実体を指すポインタとして保存する", async () => {
		await saveConversation("msg-1", conversation, ["msg-2", "msg-3"]);

		expect(putItems()).toEqual([
			{ MessageId: "msg-1", Conversation: conversation },
			{ MessageId: "msg-2", ConversationRef: "msg-1" },
			{ MessageId: "msg-3", ConversationRef: "msg-1" },
		]);
	});

	it("会話の実体は複製しない", async () => {
		await saveConversation("msg-1", conversation, ["msg-2", "msg-3"]);

		const withConversation = putItems().filter(
			(item) => "Conversation" in item,
		);
		expect(withConversation).toHaveLength(1);
	});

	it("重複したエイリアスは1回だけ保存する", async () => {
		await saveConversation("msg-1", conversation, ["msg-2", "msg-2"]);

		expect(putItems()).toHaveLength(2);
	});

	it("実体と同じIDはエイリアスにしない", async () => {
		await saveConversation("msg-1", conversation, ["msg-1", "msg-2"]);

		expect(putItems()).toEqual([
			{ MessageId: "msg-1", Conversation: conversation },
			{ MessageId: "msg-2", ConversationRef: "msg-1" },
		]);
	});
});
