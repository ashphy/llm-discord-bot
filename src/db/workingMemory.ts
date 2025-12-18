import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { WorkingMemory } from "../lib/workingMemory.js";
import { docClient } from "./dynnamodb.js";

const MEMORY_TEMPLATE = `# 🧠 Working Memory

> This memory is maintained to improve long-term conversation quality.
> Only explicitly stated facts are promoted. Assumptions are marked separately.
> Old or irrelevant information should be summarized, updated, or removed.

---

## 👤 User Profile (Mostly Stable)

- **Name / Preferred Address**:
- **Language / Tone**: (e.g. English – casual / polite)
- **Timezone / Region**:
- **Preferred Units**: (currency, temperature, time format, etc.)
- **General Interests**:
  - 
- **Topics to Avoid (Explicitly Stated)**:
  - 

## 🎯 Usage Goals & Expectations (Mid-term)

- **Primary Use Cases**:
  - Daily lookups / research
  - Casual advice & consultation
  - Idea brainstorming
- **Expected Role of the Bot**:
  - (e.g. neutral thinking partner, supportive advisor)
- **What the User Values Most**:
  - (e.g. clarity, empathy, speed, accuracy)

## 🧩 Conversation Style Preferences

- **Preferred Answer Length**:
  - Short / Medium / Detailed
- **Preferred Structure**:
  - Bullet points / Paragraphs / Mixed
- **Questioning Style**:
  - Proceed with assumptions / Ask before proceeding
- **Tone Preference**:
  - Friendly / Calm / Analytical

## 📌 Important Principles & Preferences

- 
- 

> Examples:
> - "Practicality over theory when unsure"
> - "Avoid overly definitive claims"

---

## 🛠 Common Context & Environment

- **Devices / OS**:
- **Frequently Used Tools / Services**:
  - 
- **Constraints (time, budget, etc.)**:
  - 

---

## 🔄 Ongoing Topics & Interests (Short–Mid Term)

| Topic | Status | Notes | Last Updated |
|------|--------|-------|--------------|
|      |        |       |              |

> Status examples: Exploring / Deciding / Paused / Completed

---

## 💡 Key Past Conclusions & Learnings

- **[YYYY-MM-DD]**
  - Summary:
  - Context / Reasoning:
- 

> Store only distilled conclusions to reduce repetition.

---

## ⚠️ Warnings, Boundaries & Explicit NOs

- 
- 

> Only include items clearly stated by the user.

---

## 🧪 Assumptions & Tentative Notes (Low Confidence)

- 
- 

> Promote to official sections only after user confirmation.

---

## 🧹 Memory Management (Internal)

- **Last Updated**:
- **Review / Expiration Date for Tentative Notes**:
- **Candidates for Removal**:
  -
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
