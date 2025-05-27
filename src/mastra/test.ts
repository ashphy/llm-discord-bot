import { mastra } from "./index.js";

const agent = mastra.getAgent("discordAgent");

const stream = await agent.stream(
	[{ role: "user", content: "IIJという会社について教えて" }],
	{
		threadId: "test",
		resourceId: "channel",
		maxSteps: 10,
	},
);

for await (const chunk of stream.fullStream) {
	switch (chunk.type) {
		case "text-delta":
			process.stdout.write(chunk.textDelta);
			break;
		case "tool-call":
			console.log("TOOL CALL", chunk.toolName);
	}
}

// const messages = convertResponseMessageToCoreMessage(response.messages);
// console.dir(messages, { depth: null });
