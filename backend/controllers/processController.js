import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3"; // If we need to fetch from S3
import { PrismaClient } from "@prisma/client";
import { summarizeWithGemini } from "../services/geminiService.js";
import fs from "fs";
import axios from "axios";
import FormData from "form-data";

// Reuse the ElevenLabs/transcription logic from previous aiService,
// likely moved here or we import it.
// For clarity I will include the transcription stub here or minimal version.

const prisma = new PrismaClient();

// -- Helper: Transcription (Stub/Mock from previous turn) --
async function transcribeAudioScribe(filePath) {
  // Real implementation would call ElevenLabs
  if (!process.env.ELEVENLABS_API_KEY) {
    return {
      text: "User did not provide API Key. This is a mock transcript where Alice discusses backend architecture and Bob agrees to use Gemini 2.0 Flash. Alice assigns Bob to install the SDK.",
      segments: [], // Mock segments
    };
  }
  // ... Implement actual call if key exists ...
  return {
    text: "Mock transcript placeholder for specific implementation.",
    segments: [],
  };
}

// -- Main Orchestrator --
export const startProcessing = async (
  meetingId,
  filePath,
  clientTranscript = []
) => {
  try {
    console.log(`[Orchestrator] Starting pipeline for ${meetingId}`);

    // 1. Transcribe (ElevenLabs)
    const transcriptionResult = await transcribeAudioScribe(filePath);

    // Strategy: Merge or Prefer?
    // If ElevenLabs works, it usually has better timings.
    // If clientTranscript (scraped) is available, it has better Speakers (Real names).
    // For this MVP, we will concat them or just use ElevenLabs if available, falling back to scraped.

    let fullTranscript = transcriptionResult.text;

    // If ElevenLabs returned placeholder/mock/empty and we have client transcript:
    if (
      (!fullTranscript || fullTranscript.includes("Mock")) &&
      clientTranscript.length > 0
    ) {
      console.log("[Orchestrator] Using Client Transcript as primary source.");
      // Format: Speaker: Text
      fullTranscript = clientTranscript
        .map((t) => `${t.speaker}: ${t.text}`)
        .join("\n");
    } else if (clientTranscript.length > 0) {
      // Append context for Gemini
      console.log(
        "[Orchestrator] Merging/Appending Client Transcript for context."
      );
      fullTranscript =
        `Audio Transcript:\n${fullTranscript}\n\nClient Scraped Log:\n` +
        clientTranscript.map((t) => `${t.speaker}: ${t.text}`).join("\n");
    }

    // 2. Summarize (Gemini 2.0 Flash)
    console.log(
      `[Orchestrator] Sending ${fullTranscript.length} chars to Gemini...`
    );
    const geminiResult = await summarizeWithGemini(fullTranscript);

    // 3. Save to DB
    await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        raw_transcript: fullTranscript,
        summary: JSON.stringify(geminiResult), // Save the whole JSON object for frontend to parse
        action_items: JSON.stringify(geminiResult.action_items || []),
        sentiment:
          geminiResult.overall_sentiment || geminiResult.sentiment || "Neutral",
      },
    });

    // 4. Cleanup
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    console.log(`[Orchestrator] Pipeline finished for ${meetingId}`);
  } catch (error) {
    console.error(`[Orchestrator] Failed for ${meetingId}:`, error);
    // Could update DB status to 'FAILED'
  }
};
