import axios from "axios";
import FormData from "form-data";
import fs from "fs";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1/speech-to-text";

/**
 * Transcribes audio using ElevenLabs Speech-to-Text API
 * @param {string} audioFilePath - Path to the audio file
 * @returns {Promise<Object>} - Transcript with text and metadata
 */
export async function transcribeWithElevenLabs(audioFilePath) {
  try {
    console.log("[ElevenLabs] Starting transcription...");

    if (!ELEVENLABS_API_KEY || ELEVENLABS_API_KEY === "your-elevenlabs-api-key-here") {
      throw new Error("ElevenLabs API key not configured");
    }

    // Create form data with audio file
    // ElevenLabs expects parameter name "file" not "audio"
    const formData = new FormData();
    formData.append("file", fs.createReadStream(audioFilePath));

    // Use the latest speech-to-text model
    // Valid models: 'scribe_v1', 'scribe_v1_experimental', 'scribe_v2'
    formData.append("model_id", "scribe_v2");

    // Make API request
    const response = await axios.post(ELEVENLABS_API_URL, formData, {
      headers: {
        ...formData.getHeaders(),
        "xi-api-key": ELEVENLABS_API_KEY,
      },
      timeout: 300000, // 5 minutes timeout for large files
    });

    console.log("[ElevenLabs] Transcription completed successfully");

    // ElevenLabs returns: { text: "...", language: "en", ... }
    const transcriptText = response.data.text || "";
    const language = response.data.language || "unknown";

    // Return in standard format
    return {
      fullText: transcriptText,
      language: language,
      segments: [], // ElevenLabs basic API doesn't provide speaker diarization
      words: transcriptText.split(" ").length,
    };
  } catch (error) {
    console.error("[ElevenLabs] Transcription error:", error.message);

    if (error.response) {
      console.error("[ElevenLabs] API Response:", error.response.data);
      throw new Error(`ElevenLabs API error: ${error.response.data.detail || error.response.statusText}`);
    }

    throw error;
  }
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

  console.log(`[ElevenLabs] Creating segments from ${captionData.length} caption entries`);

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
export function combineTranscriptWithCaptions(elevenLabsTranscript, captionData) {
  // If we have caption data, use it for speaker identification
  if (captionData && captionData.length > 0) {
    console.log("[ElevenLabs] Using caption data for speaker identification");

    const segments = createSegmentsFromCaptions(elevenLabsTranscript, captionData);
    const fullText = segments.map(s => `${s.speaker}: ${s.text}`).join("\n");

    return {
      fullText: fullText,
      segments: segments,
      transcriptSource: "elevenlabs_with_captions",
    };
  }

  // No caption data, return plain transcript
  console.log("[ElevenLabs] No caption data available, using plain transcript");
  return {
    fullText: elevenLabsTranscript,
    segments: [],
    transcriptSource: "elevenlabs_only",
  };
}
