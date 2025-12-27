import { encoding_for_model } from "tiktoken";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const GEMINI_MODEL = "gemini-2.0-flash-exp"; // Gemini 2.5 Flash when available

const MAX_CHUNK_TOKENS = 4000; // Gemini has larger context window (~1M tokens, but we chunk for better summaries)

/**
 * Summarizes a long meeting transcript using map-reduce chunking
 * @param {string} transcript - Full meeting transcript with speaker labels
 * @param {Array} segments - Array of speaker segments (optional)
 * @returns {Promise<Object>} - Summary, action items, and key points
 */
export async function summarizeMeeting(transcript, segments = []) {
  try {
    console.log("[Summarization] Starting meeting summarization...");
    console.log(`[Summarization] Transcript length: ${transcript.length} characters`);

    // Step 1: Tokenize and chunk the transcript
    const chunks = chunkTranscriptByTokens(transcript, MAX_CHUNK_TOKENS);
    console.log(`[Summarization] Split into ${chunks.length} chunks`);

    if (chunks.length === 0) {
      return {
        summary: "No content to summarize.",
        actionItems: [],
        keyPoints: [],
      };
    }

    // Step 2: Summarize each chunk
    const chunkSummaries = [];
    for (let i = 0; i < chunks.length; i++) {
      console.log(`[Summarization] Processing chunk ${i + 1}/${chunks.length}...`);
      const chunkSummary = await summarizeChunk(chunks[i], i + 1, chunks.length);
      chunkSummaries.push(chunkSummary);
    }

    // Step 3: Create final comprehensive summary from chunk summaries
    console.log("[Summarization] Creating final summary...");
    const finalSummary = await createFinalSummary(chunkSummaries);

    // Step 4: Extract action items and key points
    const actionItems = await extractActionItems(chunkSummaries);
    const keyPoints = extractKeyPoints(finalSummary);

    console.log("[Summarization] Summarization completed successfully");
    return {
      summary: finalSummary,
      actionItems,
      keyPoints,
    };
  } catch (error) {
    console.error("[Summarization] Error:", error.message);
    throw error;
  }
}

/**
 * Chunks transcript by token count to stay under model limits
 */
function chunkTranscriptByTokens(text, maxTokens) {
  const encoder = encoding_for_model("gpt-3.5-turbo");
  const lines = text.split("\n");
  const chunks = [];
  let currentChunk = [];
  let currentTokens = 0;

  for (const line of lines) {
    const lineTokens = encoder.encode(line);
    const lineTokenCount = lineTokens.length;

    if (currentTokens + lineTokenCount > maxTokens) {
      // Save current chunk and start new one
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.join("\n"));
      }
      currentChunk = [line];
      currentTokens = lineTokenCount;
    } else {
      currentChunk.push(line);
      currentTokens += lineTokenCount;
    }
  }

  // Add remaining chunk
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join("\n"));
  }

  encoder.free();
  return chunks;
}

/**
 * Summarizes a single chunk of the transcript using Gemini
 */
async function summarizeChunk(chunkText, chunkIndex, totalChunks) {
  try {
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const prompt = `You are summarizing a segment (part ${chunkIndex} of ${totalChunks}) of a meeting transcript.

Extract key discussion points, decisions made, and any action items mentioned.
Preserve important details like who said what for critical decisions.
Be concise but comprehensive.

Transcript segment:
${chunkText}

Provide a clear, structured summary of this segment.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error(`[Summarization] Error summarizing chunk ${chunkIndex}:`, error.message);
    return `[Error summarizing chunk ${chunkIndex}]`;
  }
}

/**
 * Creates final comprehensive summary from chunk summaries using Gemini
 */
async function createFinalSummary(chunkSummaries) {
  const combinedSummaries = chunkSummaries.join("\n\n---\n\n");

  try {
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: {
        temperature: 0.3,
      }
    });

    const prompt = `You are creating a comprehensive meeting summary from segment summaries.

Create a well-structured summary with:
1. **Overview**: Brief meeting context and main topic
2. **Key Discussion Points**: Main topics discussed (bullet points)
3. **Decisions Made**: Important decisions and outcomes
4. **Action Items**: Tasks and next steps (if mentioned)
5. **Next Steps**: What happens next

Be clear, concise, and professional. Use bullet points for readability.

Here are the segment summaries:

${combinedSummaries}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("[Summarization] Error creating final summary:", error.message);
    // Fallback: concatenate chunk summaries
    return chunkSummaries.join("\n\n");
  }
}

/**
 * Extracts action items from summaries using Gemini
 */
async function extractActionItems(chunkSummaries) {
  const combinedSummaries = chunkSummaries.join("\n\n");

  try {
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: {
        temperature: 0.2,
      }
    });

    const prompt = `Extract all action items from the meeting summaries.
Format each action item as:
- [Action item description] (Owner: [name if mentioned, else "Unassigned"])

Return only the bullet list, no extra text.

Summaries:
${combinedSummaries}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const actionItemsText = response.text();

    // Parse into array
    return actionItemsText
      .split("\n")
      .filter((line) => line.trim().startsWith("-"))
      .map((line) => line.trim().substring(2)); // Remove "- " prefix
  } catch (error) {
    console.error("[Summarization] Error extracting action items:", error.message);
    return [];
  }
}

/**
 * Extracts key points from final summary
 */
function extractKeyPoints(summary) {
  // Simple extraction: find bullet points in summary
  const lines = summary.split("\n");
  const keyPoints = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("-") || trimmed.startsWith("*") || trimmed.startsWith("•")) {
      keyPoints.push(trimmed.substring(2).trim());
    }
  }

  return keyPoints.slice(0, 10); // Limit to top 10 key points
}

/**
 * Count tokens in text (utility function)
 */
export function countTokens(text, model = "gpt-3.5-turbo") {
  const encoder = encoding_for_model(model);
  const tokens = encoder.encode(text);
  const count = tokens.length;
  encoder.free();
  return count;
}
