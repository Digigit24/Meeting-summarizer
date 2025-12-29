import { encoding_for_model } from "tiktoken";
import { Groq } from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

const GROQ_MODEL = "llama-3.3-70b-versatile";
const MAX_CHUNK_TOKENS = 4000; // Chunk size for better summaries

/**
 * Summarizes a long meeting transcript using map-reduce chunking with Groq
 * @param {string} transcript - Full meeting transcript with speaker labels
 * @param {Array} segments - Array of speaker segments (optional)
 * @returns {Promise<Object>} - Summary, action items, and key points
 */
export async function summarizeMeeting(transcript, segments = []) {
  try {
    console.log("[Summarization] Starting meeting summarization with Groq...");
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
  console.log(`[Tokenization] Starting tokenization with max ${maxTokens} tokens per chunk`);

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
      console.log(`[Tokenization] Created chunk ${chunks.length}: ${currentTokens} tokens, ${currentChunk.length} lines`);

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
    console.log(`[Tokenization] Created final chunk ${chunks.length}: ${currentTokens} tokens, ${currentChunk.length} lines`);
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
      const chatCompletion = await groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: `You are an expert meeting summarizer. You understand multiple languages including English, Hindi, Hinglish (Hindi-English mix), and Marathi. Extract every important detail, preserve speaker names exactly as shown, and create comprehensive summaries.`
          },
          {
            role: "user",
            content: `Summarize this meeting transcript segment (part ${chunkIndex} of ${totalChunks}).

IMPORTANT INSTRUCTIONS:
1. **Preserve Speaker Names**: Keep exact speaker names from transcript (e.g., "Prateek", "Divya", not "Speaker 0")
2. **Multilingual Support**: This transcript may contain Hindi, English, Hinglish, or Marathi. Understand and summarize all languages.
3. **Comprehensive Details**: Do NOT miss any important points, decisions, or discussions
4. **Speaker Attribution**: Always mention WHO said WHAT for every important point
5. **Structure**: Use clear sections and bullet points

FORMAT YOUR RESPONSE AS:
### Key Discussion Points
- **[Speaker Name]**: [What they said/discussed] - [Context/details]
- **[Speaker Name]**: [What they said/discussed] - [Context/details]

### Decisions Made
- [Decision] - Proposed by **[Speaker Name]**
- [Decision] - Agreed upon by **[Speaker Name]** and **[Speaker Name]**

### Action Items
- [Task] - Assigned to **[Speaker Name]**
- [Task] - To be done by **[Speaker Name]**

### Important Notes
- [Any other critical information with speaker attribution]

TRANSCRIPT SEGMENT:
${chunkText}

Provide a detailed, comprehensive summary preserving ALL speaker names and important information.`
          }
        ],
        model: GROQ_MODEL,
        temperature: 0.3,  // Lower temperature for more accurate transcription
        max_completion_tokens: 2048,  // Increased for comprehensive summaries
        top_p: 0.9,
      });

      return chatCompletion.choices[0]?.message?.content || `[Error: No response for chunk ${chunkIndex}]`;
    } catch (error) {
      lastError = error;
      console.error(`[Summarization] Error summarizing chunk ${chunkIndex} (attempt ${attempt}/${maxRetries}):`, error.message);

      // If rate limited, wait before retrying
      if (error.message.includes('rate') || error.message.includes('429')) {
        if (attempt < maxRetries) {
          const waitTime = Math.min(5000 * attempt, 30000); // Wait 5s, 10s, 15s
          console.log(`[Summarization] Rate limited, waiting ${waitTime/1000}s before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      } else {
        // For other errors, don't retry
        break;
      }
    }
  }

  console.error(`[Summarization] Failed to summarize chunk ${chunkIndex} after ${maxRetries} attempts`);
  return `[Unable to summarize this segment - ${lastError?.message || 'Unknown error'}]`;
}

/**
 * Creates final comprehensive summary from chunk summaries using Groq
 */
async function createFinalSummary(chunkSummaries) {
  const combinedSummaries = chunkSummaries.join("\n\n---\n\n");

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `You are an expert at creating comprehensive meeting summaries. You understand multiple languages (English, Hindi, Hinglish, Marathi). Create detailed, well-formatted summaries that preserve all speaker names and important information.`
        },
        {
          role: "user",
          content: `Create a comprehensive final summary from these segment summaries.

CRITICAL REQUIREMENTS:
1. **Preserve ALL Speaker Names**: Use exact names from segments (e.g., "Prateek", "Divya", NOT "Speaker 0" or generic names)
2. **Comprehensive Coverage**: Include EVERY important point, decision, and discussion from ALL segments
3. **Speaker Attribution**: Always attribute WHO said or did WHAT
4. **Professional Format**: Use Notion-style markdown formatting with clear sections
5. **Chronological Flow**: Maintain the meeting's natural progression

FORMAT YOUR RESPONSE EXACTLY LIKE THIS:

# 📋 Meeting Summary

## 🎯 Overview
[2-3 sentences about what this meeting was about, main topic, and overall outcome]

## 💬 Key Discussion Points

### Topic 1: [Topic Name]
- **Prateek** mentioned that [specific point with details]
- **Divya** responded by [specific response with context]
- **[Name]** added that [additional context]

### Topic 2: [Topic Name]
- **[Name]** discussed [specific discussion point]
- **[Name]** agreed and [their input]

## ✅ Decisions Made

| Decision | Proposed By | Status |
|----------|------------|--------|
| [Specific decision] | **[Speaker Name]** | Approved |
| [Specific decision] | **[Speaker Name]** | Pending |

## 📝 Action Items

- [ ] **[Task description]** - Assigned to: **[Speaker Name]** - Due: [if mentioned]
- [ ] **[Task description]** - Assigned to: **[Speaker Name]** - Due: [if mentioned]
- [ ] **[Task description]** - Assigned to: **[Speaker Name]** - Due: [if mentioned]

## 🎙️ Speaker Contributions

- **Prateek**: [Brief summary of their main contributions]
- **Divya**: [Brief summary of their main contributions]
- **[Other Names]**: [Their contributions]

## 🔍 Important Notes
- [Any critical information, deadlines, or concerns mentioned]
- [Follow-up items or next meeting topics]

## 🚀 Next Steps
1. [First next step with responsible person]
2. [Second next step with responsible person]

---

SEGMENT SUMMARIES TO CONSOLIDATE:

${combinedSummaries}

Create a comprehensive final summary following the exact format above. Use actual speaker names from the segments.`
        }
      ],
      model: GROQ_MODEL,
      temperature: 0.2,
      max_completion_tokens: 3000,  // Increased for comprehensive final summary
      top_p: 0.9,
    });

    return chatCompletion.choices[0]?.message?.content || chunkSummaries.join("\n\n");
  } catch (error) {
    console.error("[Summarization] Error creating final summary:", error.message);
    // Fallback: concatenate chunk summaries
    return chunkSummaries.join("\n\n");
  }
}

/**
 * Extracts action items from summaries using Groq
 */
async function extractActionItems(chunkSummaries) {
  const combinedSummaries = chunkSummaries.join("\n\n");

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: `Extract all action items from the meeting summaries.
Format each action item as:
- [Action item description] (Owner: [name if mentioned, else "Unassigned"])

Return only the bullet list, no extra text.

Summaries:
${combinedSummaries}`
        }
      ],
      model: GROQ_MODEL,
      temperature: 0.2,
      max_completion_tokens: 512,
      top_p: 1,
    });

    const actionItemsText = chatCompletion.choices[0]?.message?.content || '';

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
