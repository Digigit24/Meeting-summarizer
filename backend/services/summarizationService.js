import { encoding_for_model } from "tiktoken";
import { Groq } from "groq-sdk";

let groq = null;

function getGroqClient() {
  if (!groq) {
    groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });
  }
  return groq;
}

const GROQ_MODEL = "llama-3.3-70b-versatile";
const MAX_CHUNK_TOKENS = 6000; // Increased for longer meetings

/**
 * Summarizes a long meeting transcript using map-reduce chunking with Groq
 * @param {string} transcript - Full meeting transcript with speaker labels
 * @param {Array} segments - Array of speaker segments (optional)
 * @returns {Promise<Object>} - Summary, action items, and key points
 */
export async function summarizeMeeting(transcript, segments = []) {
  try {
    console.log("[Summarization] Starting meeting summarization with Groq...");
    console.log(
      `[Summarization] Transcript length: ${transcript.length} characters`
    );

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
      console.log(
        `[Summarization] Processing chunk ${i + 1}/${chunks.length}...`
      );
      const chunkSummary = await summarizeChunk(
        chunks[i],
        i + 1,
        chunks.length
      );
      chunkSummaries.push(chunkSummary);
    }

    // Step 3: Create final comprehensive summary from chunk summaries
    console.log("[Summarization] Creating final summary...");
    const finalSummary = await createFinalSummary(chunkSummaries);

    // Step 4: Extract action items and key points
    const actionItems = await extractActionItems(chunkSummaries);
    const keyPoints = extractKeyPoints(finalSummary, chunks.length);

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
  console.log(
    `[Tokenization] Starting tokenization with max ${maxTokens} tokens per chunk`
  );

  const encoder = encoding_for_model("gpt-3.5-turbo");
  const lines = text.split("\n");
  const chunks = [];
  let currentChunk = [];
  let currentTokens = 0;

  console.log(`[Tokenization] Processing ${lines.length} lines`);

  for (const line of lines) {
    if (!line.trim()) continue; // Skip empty lines

    const lineTokens = encoder.encode(line);
    const lineTokenCount = lineTokens.length;

    if (currentTokens + lineTokenCount > maxTokens && currentChunk.length > 0) {
      // Save current chunk and start new one
      const chunkText = currentChunk.join("\n");
      chunks.push(chunkText);
      console.log(
        `[Tokenization] Created chunk ${chunks.length}: ${currentTokens} tokens, ${currentChunk.length} lines`
      );

      currentChunk = [line];
      currentTokens = lineTokenCount;
    } else {
      currentChunk.push(line);
      currentTokens += lineTokenCount;
    }
  }

  // Add remaining chunk
  if (currentChunk.length > 0) {
    const chunkText = currentChunk.join("\n");
    chunks.push(chunkText);
    console.log(
      `[Tokenization] Created final chunk ${chunks.length}: ${currentTokens} tokens, ${currentChunk.length} lines`
    );
  }

  encoder.free();

  console.log(`[Tokenization] Total chunks created: ${chunks.length}`);
  return chunks;
}

/**
 * Summarizes a single chunk of the transcript using Groq (Llama 3.3)
 */
async function summarizeChunk(chunkText, chunkIndex, totalChunks) {
  const maxRetries = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const chatCompletion = await getGroqClient().chat.completions.create({
        messages: [
          {
            role: "system",
            content: `You are an expert meeting summarizer. Extract key information in a clear, scannable format. Support multilingual input (English, Hinglish, Marathi) but ALWAYS output in English only.`,
          },
          {
            role: "user",
            content: `Summarize this meeting segment (part ${chunkIndex} of ${totalChunks}).

LANGUAGE RULES:
- Input may be in English, Hinglish (Hindi-English mix), or Marathi
- ALWAYS write output in ENGLISH ONLY - translate if needed
- Keep names and technical terms in original form

FORMAT RULES:
- Use clear headings and bullet points
- Keep each point SHORT (one line max)
- Use ** for emphasis on names/key terms
- Be scannable - no long paragraphs

TRANSCRIPT:
${chunkText}

Output format:
**Key Points:**
• [Speaker Name] - [brief point in English]
• [Speaker Name] - [brief point in English]

**Decisions Made:**
• [Decision in English] (by [Name])

**Action Items:**
• [Task in English] - [Assignee]`,
          },
        ],
        model: GROQ_MODEL,
        temperature: 0.3,
        max_completion_tokens: 1200,
        top_p: 0.9,
      });

      return (
        chatCompletion.choices[0]?.message?.content ||
        `[Error: No response for chunk ${chunkIndex}]`
      );
    } catch (error) {
      lastError = error;
      console.error(
        `[Summarization] Error summarizing chunk ${chunkIndex} (attempt ${attempt}/${maxRetries}):`,
        error.message
      );

      // If rate limited, wait before retrying
      if (error.message.includes("rate") || error.message.includes("429")) {
        if (attempt < maxRetries) {
          const waitTime = Math.min(5000 * attempt, 30000);
          console.log(
            `[Summarization] Rate limited, waiting ${
              waitTime / 1000
            }s before retry...`
          );
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
      } else {
        break;
      }
    }
  }

  console.error(
    `[Summarization] Failed to summarize chunk ${chunkIndex} after ${maxRetries} attempts`
  );
  return `[Unable to summarize this segment - ${
    lastError?.message || "Unknown error"
  }]`;
}

/**
 * Creates Notion-style final summary from chunk summaries using Groq
 */
async function createFinalSummary(chunkSummaries) {
  const combinedSummaries = chunkSummaries.join("\n\n---\n\n");

  // Dynamic point limit based on meeting length
  const numChunks = chunkSummaries.length;
  const maxPoints = Math.min(Math.max(10, numChunks * 3), 30); // 10-30 points based on length

  try {
    const chatCompletion = await getGroqClient().chat.completions.create({
      messages: [
        {
          role: "system",
          content: `You create professional, scannable meeting summaries in Notion style. Support multilingual input (English, Hinglish, Marathi) but ALWAYS output in English. Use simple, clear language.`,
        },
        {
          role: "user",
          content: `Create a final meeting summary from these segment summaries.

LANGUAGE RULES:
- Input may be English, Hinglish, or Marathi
- ALWAYS output in ENGLISH ONLY
- Use SIMPLE English - avoid complex words
- Translate regional language content to English

FORMATTING RULES:
- Use Notion-style formatting (headings, bullets, emojis)
- Keep it scannable - short points only
- No long paragraphs or walls of text
- Use emojis sparingly for visual markers
- Balanced spacing - not too cramped, not too much

CONTENT RULES:
- Meeting length: ${numChunks} segments - use up to ${maxPoints} points total
- CRITICAL: For hours-long meetings, do NOT over-summarize. Key details are important.
- Longer meetings = more points (don't limit to 10 if meeting is long)
- Focus on outcomes, decisions, and actions
- Skip small talk and repetition

OUTPUT FORMAT:

# 📝 Meeting Summary

**Meeting Topic:** [One clear sentence in simple English]

---

## 🎯 Key Discussion Points

• **[Name]** - [Short point in simple English]
• **[Name]** - [Short point in simple English]
[Add more based on meeting length - up to ${maxPoints} total across all sections]

---

## ✅ Decisions Made

• [Decision in simple English] - **[Name]**
• [Another decision if any]

---

## 📌 Action Items

• [ ] [Task in simple English] - **[Assignee]**
• [ ] [Another task] - **[Assignee]**

---

## 🔄 Next Steps

1. [Clear next step with owner]
2. [Another next step if any]

---

SEGMENT SUMMARIES:
${combinedSummaries}

Remember: Simple English, scannable format, up to ${maxPoints} points for this ${numChunks}-segment meeting.`,
        },
      ],
      model: GROQ_MODEL,
      temperature: 0.2,
      max_completion_tokens: 4096, // Increased for longer meetings
      top_p: 0.9,
    });

    return (
      chatCompletion.choices[0]?.message?.content || chunkSummaries.join("\n\n")
    );
  } catch (error) {
    console.error(
      "[Summarization] Error creating final summary:",
      error.message
    );
    // Fallback: concatenate chunk summaries with proper formatting
    return `# 📝 Meeting Summary\n\n${chunkSummaries.join("\n\n---\n\n")}`;
  }
}

/**
 * Extracts action items from summaries using Groq
 */
async function extractActionItems(chunkSummaries) {
  const combinedSummaries = chunkSummaries.join("\n\n");

  try {
    const chatCompletion = await getGroqClient().chat.completions.create({
      messages: [
        {
          role: "system",
          content: `Extract action items from multilingual meeting summaries. Support English, Hinglish, Marathi input but ALWAYS output in English using simple language.`,
        },
        {
          role: "user",
          content: `Extract all action items from the meeting summaries.

RULES:
- Translate to ENGLISH if in other languages
- Use SIMPLE English words
- Format: - [Action description in English] (Owner: [Name or "Unassigned"])

Return only the bullet list, no extra text.

Summaries:
${combinedSummaries}`,
        },
      ],
      model: GROQ_MODEL,
      temperature: 0.2,
      max_completion_tokens: 800,
      top_p: 1,
    });

    const actionItemsText = chatCompletion.choices[0]?.message?.content || "";

    // Parse into array
    return actionItemsText
      .split("\n")
      .filter(
        (line) => line.trim().startsWith("-") || line.trim().startsWith("•")
      )
      .map((line) => line.trim().replace(/^[-•]\s*/, "")); // Remove bullet prefix
  } catch (error) {
    console.error(
      "[Summarization] Error extracting action items:",
      error.message
    );
    return [];
  }
}

/**
 * Extracts key points from final summary
 */
function extractKeyPoints(summary, numChunks = 1) {
  // Simple extraction: find bullet points in summary
  const lines = summary.split("\n");
  const keyPoints = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed.startsWith("-") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("•")
    ) {
      const point = trimmed.replace(/^[-*•]\s*/, "").trim();
      if (point.length > 0) {
        keyPoints.push(point);
      }
    }
  }

  // Dynamic limit based on meeting length: 10-30 points
  const maxKeyPoints = Math.min(Math.max(10, numChunks * 3), 30);
  return keyPoints.slice(0, maxKeyPoints);
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
