import axios from "axios";
import FormData from "form-data";
import fs from "fs";

const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;
const ASSEMBLYAI_BASE_URL = "https://api.assemblyai.com/v2";

/**
 * Transcribes audio with speaker diarization using AssemblyAI
 * @param {string} audioFilePath - Path to the audio file
 * @returns {Promise<Object>} - Transcript with speaker segments
 */
export async function transcribeWithSpeakers(audioFilePath) {
  try {
    console.log("[AssemblyAI] Starting transcription with speaker diarization...");

    // Step 1: Upload audio file to AssemblyAI
    const uploadUrl = await uploadAudioFile(audioFilePath);
    console.log(`[AssemblyAI] Audio uploaded: ${uploadUrl}`);

    // Step 2: Request transcription with speaker labels
    const transcriptId = await requestTranscription(uploadUrl);
    console.log(`[AssemblyAI] Transcription requested. ID: ${transcriptId}`);

    // Step 3: Poll for completion
    const transcript = await pollTranscriptionStatus(transcriptId);
    console.log(`[AssemblyAI] Transcription completed. Utterances: ${transcript.utterances?.length || 0}`);

    // Step 4: Format and return results
    return formatTranscriptWithSpeakers(transcript);
  } catch (error) {
    console.error("[AssemblyAI] Transcription error:", error.message);
    throw error;
  }
}

/**
 * Uploads audio file to AssemblyAI's upload endpoint
 */
async function uploadAudioFile(filePath) {
  const fileStream = fs.createReadStream(filePath);

  const response = await axios.post(
    `${ASSEMBLYAI_BASE_URL}/upload`,
    fileStream,
    {
      headers: {
        authorization: ASSEMBLYAI_API_KEY,
        "content-type": "application/octet-stream",
      },
    }
  );

  return response.data.upload_url;
}

/**
 * Requests transcription with speaker diarization enabled
 */
async function requestTranscription(audioUrl) {
  const response = await axios.post(
    `${ASSEMBLYAI_BASE_URL}/transcript`,
    {
      audio_url: audioUrl,
      speaker_labels: true, // Enable speaker diarization
      punctuate: true,
      format_text: true,
    },
    {
      headers: {
        authorization: ASSEMBLYAI_API_KEY,
        "content-type": "application/json",
      },
    }
  );

  return response.data.id;
}

/**
 * Polls AssemblyAI for transcription completion
 */
async function pollTranscriptionStatus(transcriptId, maxAttempts = 60) {
  const pollInterval = 3000; // 3 seconds

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await axios.get(
      `${ASSEMBLYAI_BASE_URL}/transcript/${transcriptId}`,
      {
        headers: {
          authorization: ASSEMBLYAI_API_KEY,
        },
      }
    );

    const { status } = response.data;
    console.log(`[AssemblyAI] Poll ${attempt + 1}/${maxAttempts}: ${status}`);

    if (status === "completed") {
      return response.data;
    } else if (status === "error") {
      throw new Error(`Transcription failed: ${response.data.error}`);
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error("Transcription timeout after maximum attempts");
}

/**
 * Formats AssemblyAI transcript into speaker segments
 */
function formatTranscriptWithSpeakers(transcript) {
  const segments = [];

  if (!transcript.utterances || transcript.utterances.length === 0) {
    // Fallback: No speaker diarization, use full text
    return {
      fullText: transcript.text || "",
      segments: [],
      speakerMap: {},
    };
  }

  const speakerMap = {}; // Map speaker labels to indexes
  let speakerCounter = 0;

  for (const utterance of transcript.utterances) {
    const speakerLabel = utterance.speaker;

    // Create friendly speaker name if not exists
    if (!speakerMap[speakerLabel]) {
      speakerCounter++;
      speakerMap[speakerLabel] = `Speaker ${speakerCounter}`;
    }

    segments.push({
      speaker: speakerMap[speakerLabel],
      speakerLabel: speakerLabel, // Original label (A, B, C, etc.)
      text: utterance.text,
      startTime: utterance.start,
      endTime: utterance.end,
      confidence: utterance.confidence,
    });
  }

  const fullText = segments.map(s => `${s.speaker}: ${s.text}`).join("\n");

  return {
    fullText,
    segments,
    speakerMap,
    duration: transcript.audio_duration,
    words: transcript.words?.length || 0,
  };
}

/**
 * Maps AssemblyAI speaker labels to real names from caption data
 * @param {Array} aiSegments - Segments from AssemblyAI
 * @param {Array} captionData - Caption data with real names from extension
 * @returns {Object} - Speaker label to real name mapping
 */
export function mapSpeakersToRealNames(aiSegments, captionData) {
  const speakerMap = {};

  if (!captionData || captionData.length === 0) {
    return speakerMap; // No mapping available
  }

  // Try to match AI segments with caption data based on timestamps
  for (const segment of aiSegments) {
    const matchingCaptions = captionData.filter((caption) => {
      const timeDiff = Math.abs(caption.timestamp - segment.startTime);
      return timeDiff < 3000; // 3 second window
    });

    if (matchingCaptions.length > 0) {
      const realName = matchingCaptions[0].speaker;
      speakerMap[segment.speakerLabel] = realName;
    }
  }

  console.log("[AssemblyAI] Speaker mapping:", speakerMap);
  return speakerMap;
}
