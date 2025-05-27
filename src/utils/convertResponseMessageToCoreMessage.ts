import type { CoreMessage, appendResponseMessages } from "ai";

type ResponseMessage = Parameters<
	typeof appendResponseMessages
>[0]["responseMessages"][number];

export function convertResponseMessageToCoreMessage(
	messages: ResponseMessage[],
): CoreMessage[] {
	return messages.map((message) => {
		switch (message.role) {
			case "assistant":
				return {
					role: message.role,
					content: message.content,
				};
			case "tool":
				return {
					role: message.role,
					content: message.content,
				};
		}
	});
}
