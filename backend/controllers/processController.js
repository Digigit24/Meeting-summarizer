import { PrismaClient } from "@prisma/client";
import { transcribeWithElevenLabs, combineTranscriptWithCaptions } from "../services/elevenLabsService.js";
import { summarizeMeeting } from "../services/summarizationService.js";
import fs from "fs";

const prisma = new PrismaClient();

/**
 * Main orchestrator for processing meeting recordings
 * Pipeline: Audio Upload -> Transcription (ElevenLabs) -> Summarization (Gemini) -> Save to DB
 */
export const startProcessing = async (
  meetingId,
  filePath,
  clientTranscript = []
) => {
  try {
    console.log(`\n========================================`);
    console.log(`[Orchestrator] Starting pipeline for meeting: ${meetingId}`);
    console.log(`[Orchestrator] Audio file: ${filePath}`);
    console.log(`[Orchestrator] Client transcript entries: ${clientTranscript.length}`);
    console.log(`========================================\n`);

    let fullTranscript = "";
    let speakerSegments = [];
    let transcriptSource = "none";

    // STEP 1: Transcription with ElevenLabs Speech-to-Text
    if (process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_API_KEY !== "your-elevenlabs-api-key-here") {
      try {
        console.log("[Orchestrator] Step 1: Transcribing with ElevenLabs...");
        const elevenLabsResult = await transcribeWithElevenLabs(filePath);

        console.log(`[Orchestrator] ✓ ElevenLabs transcription completed`);
        console.log(`[Orchestrator]   - Language: ${elevenLabsResult.language}`);
        console.log(`[Orchestrator]   - Words: ${elevenLabsResult.words}`);

        // Combine with caption data for speaker identification
        if (clientTranscript.length > 0) {
          console.log("[Orchestrator] Combining ElevenLabs transcript with caption data...");
          const combined = combineTranscriptWithCaptions(elevenLabsResult.fullText, clientTranscript);

          fullTranscript = combined.fullText;
          speakerSegments = combined.segments;
          transcriptSource = combined.transcriptSource;

          console.log(`[Orchestrator] ✓ Combined with ${speakerSegments.length} speaker segments`);
        } else {
          // No caption data, use plain ElevenLabs transcript
          fullTranscript = elevenLabsResult.fullText;
          speakerSegments = [];
          transcriptSource = "elevenlabs_only";
          console.log("[Orchestrator] ⚠️  No caption data available for speaker identification");
        }
      } catch (elevenLabsError) {
        console.error("[Orchestrator] ElevenLabs transcription failed:", elevenLabsError.message);
        console.log("[Orchestrator] Falling back to client transcript...");
      }
    } else {
      console.log("[Orchestrator] ElevenLabs API key not configured. Skipping AI transcription.");
    }

    // STEP 1B: Fallback to Client Transcript (from scraped captions)
    if (!fullTranscript && clientTranscript.length > 0) {
      console.log("[Orchestrator] Using client-scraped transcript as primary source");
      fullTranscript = clientTranscript
        .map((t) => `${t.speaker}: ${t.text}`)
        .join("\n");
      transcriptSource = "client_captions";

      // Convert to segments format
      speakerSegments = clientTranscript.map(t => ({
        speaker: t.speaker,
        text: t.text,
        startTime: t.timestamp,
      }));
    }

    if (!fullTranscript) {
      console.log("[Orchestrator] ⚠️  No transcript available. Saving meeting without processing.");
      await prisma.meeting.update({
        where: { id: meetingId },
        data: {
          raw_transcript: "No transcript available",
          summary: "Processing failed: No transcript could be generated",
        },
      });
      return;
    }

    console.log(`[Orchestrator] Transcript ready (source: ${transcriptSource})`);
    console.log(`[Orchestrator] Length: ${fullTranscript.length} chars, ${fullTranscript.split("\n").length} lines`);

    // STEP 2: Summarization with Chunking
    let summaryResult = {
      summary: "Summarization skipped (no API key)",
      actionItems: [],
      keyPoints: [],
    };

    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "your-gemini-api-key-here") {
      try {
        console.log("\n[Orchestrator] Step 2: Summarizing with Gemini 2.5 Flash...");
        summaryResult = await summarizeMeeting(fullTranscript, speakerSegments);
        console.log(`[Orchestrator] ✓ Summarization completed`);
        console.log(`[Orchestrator]   - Summary length: ${summaryResult.summary.length} chars`);
        console.log(`[Orchestrator]   - Action items: ${summaryResult.actionItems.length}`);
        console.log(`[Orchestrator]   - Key points: ${summaryResult.keyPoints.length}`);
      } catch (sumError) {
        console.error("[Orchestrator] Summarization failed:", sumError.message);
        summaryResult.summary = `Summarization error: ${sumError.message}`;
      }
    } else {
      console.log("[Orchestrator] Gemini API key not configured. Skipping summarization.");
    }

    // STEP 3: Save Speaker Segments to Database
    console.log("\n[Orchestrator] Step 3: Saving to database...");

    // Save speaker segments
    if (speakerSegments.length > 0) {
      for (const segment of speakerSegments) {
        await prisma.speakerSegment.create({
          data: {
            meeting_id: meetingId,
            speaker_name: segment.speaker,
            text: segment.text,
            timestamp: new Date(segment.startTime || Date.now()),
          },
        });
      }
      console.log(`[Orchestrator] ✓ Saved ${speakerSegments.length} speaker segments`);
    }

    // Update meeting record
    await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        raw_transcript: fullTranscript,
        summary: summaryResult.summary,
        action_items: JSON.stringify(summaryResult.actionItems),
        sentiment: "Neutral", // Can be enhanced with sentiment analysis
      },
    });

    console.log(`[Orchestrator] ✓ Meeting record updated`);

    // STEP 4: Cleanup temporary audio file
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[Orchestrator] ✓ Cleaned up temp file: ${filePath}`);
    }

    console.log(`\n========================================`);
    console.log(`[Orchestrator] ✅ Pipeline completed for ${meetingId}`);
    console.log(`========================================\n`);
  } catch (error) {
    console.error(`\n[Orchestrator] ❌ Pipeline failed for ${meetingId}:`, error);
    console.error("Stack trace:", error.stack);

    // Update meeting status to failed
    try {
      await prisma.meeting.update({
        where: { id: meetingId },
        data: {
          summary: `Processing failed: ${error.message}`,
        },
      });
    } catch (dbError) {
      console.error("[Orchestrator] Failed to update meeting status:", dbError);
    }
  }
};
