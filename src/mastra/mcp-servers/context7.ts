import { MCPClient } from "@mastra/mcp";

export const mcp = new MCPClient({
	servers: {
		context7: {
			url: new URL("https://mcp.context7.com/mcp"),
		},
	},
});
