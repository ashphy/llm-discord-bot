import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { WorkingMemory } from "../lib/workingMemory.js";
import { docClient } from "./dynnamodb.js";

const MEMORY_TEMPLATE = `# 🧠 Working Memory

> This memory stores only long-term useful information.
> One-time questions or transient topics should NOT be recorded here.
> Actively remove outdated or irrelevant entries to keep memory concise.

---

## 👤 User Profile (Mostly Stable)

- **Name / Preferred Address**:
- **Language / Tone**: (e.g. English – casual / polite)
- **Timezone / Region**:
- **General Interests**:
  -
- **Topics to Avoid (Explicitly Stated)**:
  -

## 🧩 Conversation Style Preferences

- **Preferred Answer Length**:
  - Short / Medium / Detailed
- **Tone Preference**:
  - Friendly / Calm / Analytical

## 📌 Important Principles & Preferences

-
-

---

## 🔄 Recurring Interests (Long-term only, Max 3 items)

- (一時的なトピックは記録しない。繰り返し話題に上がるものだけ記録)
-

---

## 💡 Key Learnings (Max 5 items — oldest-out when full)

- (30日以上経過したものは削除する)
-

---

## ⚠️ Warnings, Boundaries & Explicit NOs

-
-

> Only include items clearly stated by the user.

---

## 🧪 Assumptions & Tentative Notes (Low Confidence)

-
-

> Promote to official sections only after 2 conversations confirming.
> Delete if not confirmed within 2 conversations.

---

## 🧹 Memory Management (Internal)

- **Last Updated**:
- **Max total lines**: 60行を超えたら古い・重要度の低い情報から削除
- **Recurring Interests**: 最大3件。完了・30日経過したものは削除
- **Key Learnings**: 最大5件。古いものから削除
- **Tentative Notes**: 2回の会話で確認されなければ削除
`;

/**
 * ワーキングメモリー読み出します
 * @param userId
 */
export const readWorkingMemory = async (
	userId: string,
): Promise<WorkingMemory | undefined> => {
	const command = new GetCommand({
		TableName: "WorkingMemories",
		Key: {
			UserId: userId,
		},
	});

	const response = await docClient.send(command);
	if (response.Item) {
		return response.Item.WorkingMemory;
	}

	// デフォルト値を返す
	return {
		memory: MEMORY_TEMPLATE,
	};
};

/**
 * ワーキングメモリーを保存します
 */
export const saveWorkingMemory = async (
	userId: string,
	workingMemory: WorkingMemory,
) => {
	const command = new PutCommand({
		TableName: "WorkingMemories",
		Item: {
			UserId: userId,
			WorkingMemory: workingMemory,
		},
	});

	return await docClient.send(command);
};
