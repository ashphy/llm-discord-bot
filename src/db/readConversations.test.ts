import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Conversation } from "../lib/conversation.js";

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock("./dynnamodb.js", () => ({
	docClient: { send: sendMock },
	CONVERSATIONS_TABLE_NAME: "Conversations",
}));

const { readConversation } = await import("./readConversations.js");

const conversation: Conversation = {
	messages: [{ role: "user", content: "こんにちは" }],
};

/** 取得されたキーのMessageIdを順に取り出す */
const requestedIds = () =>
	sendMock.mock.calls.map((call) => call[0].input.Key.MessageId as string);

describe("readConversation", () => {
	beforeEach(() => {
		sendMock.mockReset();
	});

	it("実体を持つアイテムからそのまま会話を返す", async () => {
		sendMock.mockResolvedValueOnce({ Item: { Conversation: conversation } });

		expect(await readConversation("msg-1")).toEqual(conversation);
		expect(requestedIds()).toEqual(["msg-1"]);
	});

	it("エイリアスから実体を辿って会話を返す", async () => {
		sendMock
			.mockResolvedValueOnce({ Item: { ConversationRef: "msg-1" } })
			.mockResolvedValueOnce({ Item: { Conversation: conversation } });

		expect(await readConversation("msg-2")).toEqual(conversation);
		expect(requestedIds()).toEqual(["msg-2", "msg-1"]);
	});

	it("アイテムがなければundefinedを返す", async () => {
		sendMock.mockResolvedValueOnce({});

		expect(await readConversation("msg-1")).toBeUndefined();
	});

	it("エイリアスの参照先がなければundefinedを返す", async () => {
		sendMock
			.mockResolvedValueOnce({ Item: { ConversationRef: "msg-1" } })
			.mockResolvedValueOnce({});

		expect(await readConversation("msg-2")).toBeUndefined();
	});

	it("エイリアスの連鎖は辿らない", async () => {
		sendMock
			.mockResolvedValueOnce({ Item: { ConversationRef: "msg-2" } })
			.mockResolvedValueOnce({ Item: { ConversationRef: "msg-1" } });

		expect(await readConversation("msg-3")).toBeUndefined();
		expect(requestedIds()).toEqual(["msg-3", "msg-2"]);
	});
});
