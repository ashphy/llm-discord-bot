import type {
	GroundingChunk,
	GroundingSupport,
	RetrievalMetadata,
	SearchEntryPoint,
} from "@google/generative-ai";

export declare interface GroundingMetadata {
	/**
	 * Google search entry for the following-up web searches.
	 */
	searchEntryPoint?: SearchEntryPoint;
	/**
	 * List of supporting references retrieved from specified grounding source.
	 */
	groundingChunks?: GroundingChunk[];
	/**
	 * List of grounding support.
	 */
	groundingSupports?: GroundingSupport[];
	/**
	 * Metadata related to retrieval in the grounding flow.
	 */
	retrievalMetadata?: RetrievalMetadata;
	/**
	 * * Web search queries for the following-up web search.
	 */
	webSearchQueries: string[];
}
