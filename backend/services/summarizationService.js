import { encoding_for_model } from "tiktoken";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MAX_CHUNK_TOKENS = 3000; // Safe limit for GPT-3.5-turbo input
const MODEL = "gpt-3.5-turbo-16k"; // Larger context window
const FINAL_MODEL = "gpt-4o-mini"; // Better quality for final summary

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
 * Summarizes a single chunk of the transcript
 */
async function summarizeChunk(chunkText, chunkIndex, totalChunks) {
  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `You are summarizing a segment (part ${chunkIndex} of ${totalChunks}) of a meeting transcript.
Extract key discussion points, decisions made, and any action items mentioned.
Preserve important details like who said what for critical decisions.
Be concise but comprehensive.`,
        },
        {
          role: "user",
          content: chunkText,
        },
      ],
      temperature: 0.3,
      max_tokens: 800,
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error(`[Summarization] Error summarizing chunk ${chunkIndex}:`, error.message);
    return `[Error summarizing chunk ${chunkIndex}]`;
  }
}

/**
 * Creates final comprehensive summary from chunk summaries
 */
async function createFinalSummary(chunkSummaries) {
  const combinedSummaries = chunkSummaries.join("\n\n---\n\n");

  try {
    const response = await openai.chat.completions.create({
      model: FINAL_MODEL,
      messages: [
        {
          role: "system",
          content: `You are creating a comprehensive meeting summary from segment summaries.

Create a well-structured summary with:
1. **Overview**: Brief meeting context and main topic
2. **Key Discussion Points**: Main topics discussed (bullet points)
3. **Decisions Made**: Important decisions and outcomes
4. **Action Items**: Tasks and next steps (if mentioned)
5. **Next Steps**: What happens next

Be clear, concise, and professional. Use bullet points for readability.`,
        },
        {
          role: "user",
          content: `Here are the segment summaries:\n\n${combinedSummaries}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 1500,
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error("[Summarization] Error creating final summary:", error.message);
    // Fallback: concatenate chunk summaries
    return chunkSummaries.join("\n\n");
  }
}

/**
 * Extracts action items from summaries
 */
async function extractActionItems(chunkSummaries) {
  const combinedSummaries = chunkSummaries.join("\n\n");

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `Extract all action items from the meeting summaries.
Format each action item as:
- [Action item description] (Owner: [name if mentioned, else "Unassigned"])

Return only the bullet list, no extra text.`,
        },
        {
          role: "user",
          content: combinedSummaries,
        },
      ],
      temperature: 0.2,
      max_tokens: 500,
    });

    const actionItemsText = response.choices[0].message.content;
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
