import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import fs from "fs";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

/**
 * Transcribes audio using the official ElevenLabs SDK
 * @param {string} audioFilePath - Path to the audio file
 * @returns {Promise<Object>} - Transcript with text and metadata
 */
export async function transcribeWithElevenLabs(audioFilePath) {
  try {
    console.log("[ElevenLabs] Starting transcription using SDK...");
    console.log(`[ElevenLabs] Audio file path: ${audioFilePath}`);

    // Verify file exists and get size
    if (!fs.existsSync(audioFilePath)) {
      throw new Error(`Audio file not found: ${audioFilePath}`);
    }

    const fileStats = fs.statSync(audioFilePath);
    const fileSizeMB = (fileStats.size / (1024 * 1024)).toFixed(2);
    console.log(`[ElevenLabs] Audio file size: ${fileSizeMB} MB (${fileStats.size} bytes)`);

    if (fileStats.size === 0) {
      throw new Error("Audio file is empty (0 bytes)");
    }

    if (
      !ELEVENLABS_API_KEY ||
      ELEVENLABS_API_KEY === "your-elevenlabs-api-key-here"
    ) {
      throw new Error("ElevenLabs API key not configured");
    }

    const client = new ElevenLabsClient({ apiKey: ELEVENLABS_API_KEY });
    // createReadStream returns a stream, which the SDK accepts as 'file'
    const audioStream = fs.createReadStream(audioFilePath);

    console.log("[ElevenLabs] Sending audio to ElevenLabs API...");
    console.log("[ElevenLabs] Model: scribe_v1, Diarization: enabled");

    // Using scribe_v1 with diarization and audio events as requested
    const response = await client.speechToText.convert({
      file: audioStream,
      modelId: "scribe_v1",
      tagAudioEvents: true,
      languageCode: "eng",
      diarize: true,
    });

    console.log("[ElevenLabs] Transcription completed successfully");
    console.log(`[ElevenLabs] Response structure:`, {
      hasText: !!response.text,
      textLength: response.text?.length || 0,
      hasWords: !!response.words,
      wordsCount: Array.isArray(response.words) ? response.words.length : 0,
      languageCode: response.language_code,
    });

    // The response structure from the new SDK should be inspected.
    // Assuming it returns an object with 'text' and 'language_code' and potentially 'words' for diarization.
    const transcriptText = response.text || "";
    const language = response.language_code || "eng";

    console.log(`[ElevenLabs] Transcript text preview (first 200 chars): "${transcriptText.substring(0, 200)}..."`);
    console.log(`[ElevenLabs] Full transcript length: ${transcriptText.length} characters`);

    // Count words properly (excluding empty strings)
    const wordCount = transcriptText.trim() ? transcriptText.trim().split(/\s+/).filter(w => w.length > 0).length : 0;
    console.log(`[ElevenLabs] Word count: ${wordCount} words`);

    // Map diarization words if available to segments
    let segments = [];
    if (response.words && Array.isArray(response.words)) {
      console.log(`[ElevenLabs] Processing ${response.words.length} diarized words into segments`);

      // Group words by speaker to create speaker segments
      const wordSegments = response.words.map((w) => ({
        text: w.text,
        startTime: w.start,
        endTime: w.end,
        speaker: w.speaker_id || "Unknown",
      }));

      // Merge consecutive words from the same speaker into segments
      segments = mergeWordsIntoSegments(wordSegments);
      console.log(`[ElevenLabs] Created ${segments.length} speaker segments from words`);
    } else {
      console.log("[ElevenLabs] No diarization data in response");
    }

    const result = {
      fullText: transcriptText,
      language: language,
      segments: segments,
      words: wordCount,
      raw: response,
    };

    console.log(`[ElevenLabs] Returning transcript with ${wordCount} words and ${segments.length} segments`);

    return result;
  } catch (error) {
    console.error("[ElevenLabs] Transcription error:", error);

    let errorMessage = error.message;
    // Handle SDK specific error objects if necessary
    if (error.body && error.body.detail) {
      errorMessage =
        typeof error.body.detail === "object"
          ? JSON.stringify(error.body.detail)
          : error.body.detail;
    }

    if (errorMessage.includes("Unusual activity")) {
      console.error(
        "[ElevenLabs] 🛑 BLOCKED: Account flagged for unusual activity/free tier abuse."
      );
    }

    throw new Error(`ElevenLabs API error: ${errorMessage}`);
  }
}

/**
 * Merges consecutive words from the same speaker into segments
 * @param {Array} wordSegments - Array of word-level segments with speaker IDs
 * @returns {Array} - Merged speaker segments
 */
function mergeWordsIntoSegments(wordSegments) {
  if (!wordSegments || wordSegments.length === 0) return [];

  const merged = [];
  let currentSegment = {
    speaker: wordSegments[0].speaker,
    text: wordSegments[0].text,
    startTime: wordSegments[0].startTime,
    endTime: wordSegments[0].endTime,
  };

  for (let i = 1; i < wordSegments.length; i++) {
    const word = wordSegments[i];

    // If same speaker, append to current segment
    if (word.speaker === currentSegment.speaker) {
      currentSegment.text += ' ' + word.text;
      currentSegment.endTime = word.endTime;
    } else {
      // Different speaker, save current and start new
      merged.push({ ...currentSegment });
      currentSegment = {
        speaker: word.speaker,
        text: word.text,
        startTime: word.startTime,
        endTime: word.endTime,
      };
    }
  }

  // Push the last segment
  merged.push(currentSegment);

  return merged;
}

/**
 * Maps speaker segments from caption data to transcription
 * Since ElevenLabs doesn't provide speaker diarization, we rely on scraped captions
 * @param {string} transcript - Full transcript text
 * @param {Array} captionData - Caption data with speaker names from extension
 * @returns {Array} - Speaker segments with text and timestamps
 */
export function createSegmentsFromCaptions(transcript, captionData) {
  if (!captionData || captionData.length === 0) {
    return [];
  }

  console.log(
    `[ElevenLabs] Creating segments from ${captionData.length} caption entries`
  );

  // Convert caption data to segments format
  const segments = captionData.map((caption, index) => ({
    speaker: caption.speaker || "Unknown",
    speakerLabel: caption.speaker || "Unknown",
    text: caption.text,
    startTime: caption.timestamp,
    endTime: caption.timestamp + 2000, // Estimate 2 seconds per caption
    confidence: 1.0, // Caption data is from Google Meet, high confidence
    order: index,
  }));

  return segments;
}

/**
 * Combines ElevenLabs transcription with caption-based speaker identification
 * @param {string} elevenLabsTranscript - Transcript from ElevenLabs
 * @param {Array} captionData - Caption data with speakers from extension
 * @returns {Object} - Combined result with speaker segments
 */
export function combineTranscriptWithCaptions(
  elevenLabsTranscript,
  captionData
) {
  // If we have caption data, use it for speaker identification
  if (captionData && captionData.length > 0) {
    console.log("[ElevenLabs] Using caption data for speaker identification");

    const segments = createSegmentsFromCaptions(
      elevenLabsTranscript,
      captionData
    );
    const fullText = segments.map((s) => `${s.speaker}: ${s.text}`).join("\n");

    return {
      fullText: fullText,
      segments: segments,
      transcriptSource: "elevenlabs_with_captions",
    };
  }

  // No caption data, format using ElevenLabs segments if available
  console.log("[ElevenLabs] No caption data available, using ElevenLabs diarization");

  // If we have ElevenLabs segments with speakers, format them
  if (captionData && Array.isArray(captionData) && captionData.length > 0) {
    // captionData here is actually ElevenLabs segments passed from the orchestrator
    const formattedText = captionData
      .map(seg => `Speaker ${seg.speaker || 'Unknown'}: ${seg.text}`)
      .join('\n');

    return {
      fullText: formattedText,
      segments: captionData,
      transcriptSource: "elevenlabs_diarization",
    };
  }

  return {
    fullText: elevenLabsTranscript,
    segments: [],
    transcriptSource: "elevenlabs_only",
  };
}
