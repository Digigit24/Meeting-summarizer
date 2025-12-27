import { PrismaClient } from "@prisma/client";
import { transcribeWithSpeakers, mapSpeakersToRealNames } from "../services/assemblyaiService.js";
import { summarizeMeeting } from "../services/summarizationService.js";
import fs from "fs";

const prisma = new PrismaClient();

/**
 * Main orchestrator for processing meeting recordings
 * Pipeline: Audio Upload -> Transcription (AssemblyAI) -> Summarization (OpenAI) -> Save to DB
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

    // STEP 1: Transcription with Speaker Diarization
    if (process.env.ASSEMBLYAI_API_KEY && process.env.ASSEMBLYAI_API_KEY !== "your-assemblyai-api-key-here") {
      try {
        console.log("[Orchestrator] Step 1: Transcribing with AssemblyAI...");
        const aiResult = await transcribeWithSpeakers(filePath);

        speakerSegments = aiResult.segments || [];
        fullTranscript = aiResult.fullText || "";
        transcriptSource = "assemblyai";

        // Optional: Map AI speaker labels to real names if we have caption data
        if (clientTranscript.length > 0 && speakerSegments.length > 0) {
          console.log("[Orchestrator] Mapping AI speakers to real names...");
          const speakerMap = mapSpeakersToRealNames(speakerSegments, clientTranscript);

          // Apply mapping
          speakerSegments = speakerSegments.map(seg => ({
            ...seg,
            speaker: speakerMap[seg.speakerLabel] || seg.speaker,
          }));

          // Regenerate full transcript with real names
          fullTranscript = speakerSegments.map(s => `${s.speaker}: ${s.text}`).join("\n");
        }

        console.log(`[Orchestrator] ✓ AssemblyAI transcription completed`);
        console.log(`[Orchestrator]   - Segments: ${speakerSegments.length}`);
        console.log(`[Orchestrator]   - Duration: ${aiResult.duration}ms`);
      } catch (aiError) {
        console.error("[Orchestrator] AssemblyAI transcription failed:", aiError.message);
        console.log("[Orchestrator] Falling back to client transcript...");
      }
    } else {
      console.log("[Orchestrator] AssemblyAI API key not configured. Skipping AI transcription.");
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
