import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import fs from "fs";
import path from "path";
import ffmpegFluent from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";

// Set ffmpeg and ffprobe paths from installed packages
ffmpegFluent.setFfmpegPath(ffmpegInstaller.path);
ffmpegFluent.setFfprobePath(ffprobeInstaller.path);

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

// Limits for chunking (ElevenLabs typically supports up to 100MB)
const MAX_FILE_SIZE_MB = 20; // Split if larger than 20MB for safety
const CHUNK_DURATION_MINUTES = 15; // 15-minute chunks for long recordings

/**
 * Get audio duration in seconds using ffprobe (fluent-ffmpeg)
 */
async function getAudioDuration(audioFilePath) {
  return new Promise((resolve) => {
    ffmpegFluent.ffprobe(audioFilePath, (err, metadata) => {
      if (err) {
        console.warn("[ElevenLabs] Could not determine audio duration:", err.message);
        resolve(null);
      } else {
        const duration = metadata.format.duration;
        resolve(duration);
      }
    });
  });
}

/**
 * Split large audio file into chunks using ffmpeg (fluent-ffmpeg)
 */
async function splitAudioIntoChunks(audioFilePath, chunkDurationSeconds) {
  const fileName = path.basename(audioFilePath, path.extname(audioFilePath));
  const fileDir = path.dirname(audioFilePath);
  const fileExt = path.extname(audioFilePath);
  const chunkPattern = path.join(fileDir, `${fileName}_chunk_%03d${fileExt}`);

  console.log(`[ElevenLabs] Splitting audio into ${chunkDurationSeconds}s chunks...`);
  console.log(`[ElevenLabs] Chunk pattern: ${chunkPattern}`);

  return new Promise((resolve, reject) => {
    ffmpegFluent(audioFilePath)
      .outputOptions([
        '-f segment',
        `-segment_time ${chunkDurationSeconds}`,
        '-c copy'
      ])
      .output(chunkPattern)
      .on('end', () => {
        // Find all created chunk files
        const chunkFiles = fs.readdirSync(fileDir)
          .filter(file => file.startsWith(`${fileName}_chunk_`) && file.endsWith(fileExt))
          .map(file => path.join(fileDir, file))
          .sort();

        console.log(`[ElevenLabs] Created ${chunkFiles.length} chunks`);
        resolve(chunkFiles);
      })
      .on('error', (err) => {
        console.error("[ElevenLabs] Error splitting audio:", err.message);
        reject(new Error(`Failed to split audio: ${err.message}`));
      })
      .run();
  });
}

/**
 * Transcribe a single audio file (chunk) with ElevenLabs
 */
async function transcribeSingleFile(audioFilePath, chunkIndex = null) {
  const label = chunkIndex !== null ? `chunk ${chunkIndex}` : "file";
  console.log(`[ElevenLabs] Transcribing ${label}: ${path.basename(audioFilePath)}`);

  const client = new ElevenLabsClient({ apiKey: ELEVENLABS_API_KEY });
  const audioStream = fs.createReadStream(audioFilePath);

  const response = await client.speechToText.convert({
    file: audioStream,
    modelId: "scribe_v1",
    tagAudioEvents: true,
    languageCode: "eng",
    diarize: true,
  });

  const transcriptText = response.text || "";
  const wordCount = transcriptText.trim() ? transcriptText.trim().split(/\s+/).filter(w => w.length > 0).length : 0;

  console.log(`[ElevenLabs] ${label} transcribed: ${wordCount} words, ${response.words?.length || 0} diarized words`);

  return {
    text: transcriptText,
    words: response.words || [],
    language: response.language_code || "eng"
  };
}

/**
 * Combine results from multiple chunks, adjusting timestamps
 */
function combineChunkResults(chunkResults, chunkDurationSeconds) {
  console.log(`[ElevenLabs] Combining ${chunkResults.length} chunk results...`);

  let fullText = "";
  let allWords = [];
  let timeOffset = 0;

  for (let i = 0; i < chunkResults.length; i++) {
    const chunk = chunkResults[i];

    // Add text
    if (fullText && chunk.text) {
      fullText += " " + chunk.text;
    } else {
      fullText += chunk.text;
    }

    // Add words with adjusted timestamps
    if (chunk.words && Array.isArray(chunk.words)) {
      const adjustedWords = chunk.words.map(w => ({
        ...w,
        start: (w.start || 0) + timeOffset,
        end: (w.end || 0) + timeOffset
      }));
      allWords.push(...adjustedWords);
    }

    // Update time offset for next chunk
    timeOffset += chunkDurationSeconds;
  }

  console.log(`[ElevenLabs] Combined: ${fullText.length} chars, ${allWords.length} words`);

  return {
    text: fullText,
    words: allWords,
    language_code: chunkResults[0]?.language || "eng"
  };
}

/**
 * Transcribes audio using the official ElevenLabs SDK
 * Handles large files by chunking them if necessary
 * @param {string} audioFilePath - Path to the audio file
 * @returns {Promise<Object>} - Transcript with text and metadata
 */
export async function transcribeWithElevenLabs(audioFilePath) {
  let chunkFiles = [];

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

    // Check if file needs chunking
    const needsChunking = parseFloat(fileSizeMB) > MAX_FILE_SIZE_MB;
    let response;

    if (needsChunking) {
      console.log(`[ElevenLabs] ⚠️  File size (${fileSizeMB} MB) exceeds limit (${MAX_FILE_SIZE_MB} MB)`);
      console.log(`[ElevenLabs] 🔄 Will process in ${CHUNK_DURATION_MINUTES}-minute chunks to ensure reliability`);

      // Get audio duration
      const durationSeconds = await getAudioDuration(audioFilePath);
      if (durationSeconds) {
        console.log(`[ElevenLabs] Audio duration: ${(durationSeconds / 60).toFixed(2)} minutes`);
      }

      // Split into chunks
      const chunkDurationSeconds = CHUNK_DURATION_MINUTES * 60;
      chunkFiles = await splitAudioIntoChunks(audioFilePath, chunkDurationSeconds);

      console.log(`[ElevenLabs] 📊 Processing ${chunkFiles.length} chunks (${CHUNK_DURATION_MINUTES} min each)...`);

      // Process each chunk
      const chunkResults = [];
      for (let i = 0; i < chunkFiles.length; i++) {
        console.log(`[ElevenLabs] ▶️  Chunk ${i + 1}/${chunkFiles.length}...`);

        try {
          const chunkResult = await transcribeSingleFile(chunkFiles[i], i + 1);
          chunkResults.push(chunkResult);
          console.log(`[ElevenLabs] ✅ Chunk ${i + 1}/${chunkFiles.length} completed`);
        } catch (error) {
          console.error(`[ElevenLabs] ❌ Chunk ${i + 1} failed:`, error.message);
          throw new Error(`Failed to process chunk ${i + 1}: ${error.message}`);
        }
      }

      // Verify all chunks were processed
      if (chunkResults.length !== chunkFiles.length) {
        throw new Error(`Chunk processing incomplete: ${chunkResults.length}/${chunkFiles.length} chunks processed`);
      }

      console.log(`[ElevenLabs] ✅ All ${chunkFiles.length} chunks processed successfully`);

      // Combine chunk results
      response = combineChunkResults(chunkResults, chunkDurationSeconds);

      // Clean up chunk files
      console.log(`[ElevenLabs] 🧹 Cleaning up ${chunkFiles.length} chunk files...`);
      for (const chunkFile of chunkFiles) {
        try {
          if (fs.existsSync(chunkFile)) {
            fs.unlinkSync(chunkFile);
          }
        } catch (error) {
          console.warn(`[ElevenLabs] Could not delete chunk: ${chunkFile}`);
        }
      }
      chunkFiles = []; // Clear array after cleanup

    } else {
      // Process single file (no chunking needed)
      console.log("[ElevenLabs] File size is within limits, processing as single file");
      console.log("[ElevenLabs] Model: scribe_v1, Diarization: enabled");

      const client = new ElevenLabsClient({ apiKey: ELEVENLABS_API_KEY });
      const audioStream = fs.createReadStream(audioFilePath);

      response = await client.speechToText.convert({
        file: audioStream,
        modelId: "scribe_v1",
        tagAudioEvents: true,
        languageCode: "eng",
        diarize: true,
      });
    }

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
      const wordSegments = response.words.map((w, idx) => {
        // Log first few words to debug speaker ID format
        if (idx < 3) {
          console.log(`[ElevenLabs] Word ${idx}: "${w.text}", speaker_id:`, w.speaker_id, `(type: ${typeof w.speaker_id})`);
        }

        // Handle speaker ID - could be number, string, or undefined
        let speakerId;
        if (w.speaker_id !== undefined && w.speaker_id !== null) {
          speakerId = String(w.speaker_id);
        } else if (w.speaker !== undefined && w.speaker !== null) {
          speakerId = String(w.speaker);
        } else {
          speakerId = "0"; // Default to speaker 0 if not provided
        }

        return {
          text: w.text,
          startTime: w.start,
          endTime: w.end,
          speaker: speakerId,
        };
      });

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

    // Clean up chunk files if they exist
    if (chunkFiles.length > 0) {
      console.log(`[ElevenLabs] 🧹 Cleaning up ${chunkFiles.length} chunk files after error...`);
      for (const chunkFile of chunkFiles) {
        try {
          if (fs.existsSync(chunkFile)) {
            fs.unlinkSync(chunkFile);
          }
        } catch (cleanupError) {
          console.warn(`[ElevenLabs] Could not delete chunk: ${chunkFile}`);
        }
      }
    }

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
