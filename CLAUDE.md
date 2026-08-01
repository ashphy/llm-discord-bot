# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Essential Commands
- `npm run build` - Compile TypeScript to JavaScript in `dist/` folder
- `npm run start` - Run the production bot using compiled code with dotenvx
- `npm run dev` - Start development server using Mastra's dev mode
- `npm test` - Run test using dotenvx and tsx (executes `src/mastra/test.ts`)

### Code Quality
- Uses Biome for linting and formatting with tab indentation and double quotes
- Run Biome check manually: `npx biome check`
- Run Biome format: `npx biome format --write`

## Architecture Overview

### Core Framework
- **Discord.js + Sapphire Framework**: Main Discord bot framework using decorators and command/listener pattern
- **Mastra**: AI orchestration framework that manages agents, tools, and memory
- **Environment**: Uses @t3-oss/env-core for type-safe environment variable validation

### Key Components

#### Discord Bot Structure
- **Entry Point**: `src/server.ts` - Initializes SapphireClient with required intents
- **Commands**: `src/commands/llm.ts` - Slash command `/llm` for AI interactions
- **Listeners**: `src/listeners/reply.ts` - Handles reply-based conversations with the bot

#### AI Agent System
- **Main Agent**: `src/mastra/agents/diacordAgent.ts` - Discord-specific agent using Claude Sonnet 4
- **Core Logic**: `src/lib/aiAgent.ts` - AiAgent class managing conversations and streaming responses
- **Memory**: Uses LibSQLStore with in-memory database for conversation persistence
- **Tools**: Located in `src/mastra/tools/` including web research, code execution, YouTube analysis
- **MCP Integration**: Context7 MCP server for documentation retrieval

#### Database & Storage
- **DynamoDB**: Conversation persistence using AWS SDK
- **Read/Write**: `src/db/readConversations.ts` and `src/db/saveConversation.ts`
- **Memory Storage**: In-memory LibSQLStore for Mastra agent memory
- **S3**: Attached images (`src/db/s3.ts`). Discord CDN URLs expire in ~24h, so image bytes are copied to S3 and the conversation stores only an `s3://<key>` reference

#### Image Input
- **Slash command**: `image` / `image2` / `image3` / `image4` attachment options on `/llm`
- **Reply**: images attached to a reply message are picked up automatically
- **`src/lib/discordImages.ts`**: validates attachments (JPEG/PNG/GIF/WebP, 5MB, 4 images max) and uploads them to S3
- **`src/lib/imageStore.ts`**: S3 upload/download plus `hydrateImageParts()`, which swaps `s3://` references for the actual bytes right before the request is sent to the LLM. Expired images are replaced with a text placeholder

#### Image Generation
- **`src/mastra/tools/ImageGenerationTool.ts`**: generates and edits images with OpenAI `gpt-image-2`
- Returning the bytes from a tool would blow up the context, so the tool stores the image in S3 and pushes it onto a queue held in `RequestContext` (`src/lib/generatedImages.ts`). `AiAgent` drains the queue while reading the stream and hands each image to the `onImage` callback, which posts it as a standalone Discord message
- To edit an image, the model passes an `s3://` reference: user attachments are listed in `<attachedImages>` on the user message, and generated images come back as the tool result's `ref`

#### Conversation Flow
1. User sends `/llm` command or replies to bot message
2. Message content moderated via `src/lib/moderation.ts`
3. `AiAgent` processes message through Mastra's Discord agent
4. Streaming response with tool calls displayed to user
5. Conversation saved to DynamoDB for continuity

### Message Handling
- **useReplyMessage**: `src/lib/useReplyMessage.ts` - Manages Discord message updates and chunking
- **Conversation Types**: Defined in `src/lib/conversation.ts`
- **System Prompts**: Located in `src/lib/systemPrompt.ts`

## Environment Variables Required
- `BOT_TOKEN` - Discord bot token
- `OPENAI_API_KEY` - OpenAI API access
- `GOOGLE_GENERATIVE_AI_API_KEY` - Google AI access  
- `ANTHROPIC_API_KEY` - Anthropic Claude access
- `PERPLEXITY_API_KEY` - Perplexity API access
- `FIRECRAWL_API_KEY` - Web scraping service access
- `IMAGE_BUCKET_NAME` - S3 bucket for attached images (needs a 30-day lifecycle rule on the `images/` prefix)

## Key Development Notes
- Uses ES modules (`"type": "module"` in package.json)
- TypeScript with strict mode and decorators enabled
- Bot requires Guild, GuildMessages, and MessageContent intents
- Conversation continuity maintained through message ID tracking
- Tools are dynamically loaded from MCP servers and local implementations