import { PrismaClient } from "@prisma/client";
import {
  transcribeWithElevenLabs,
  combineTranscriptWithCaptions,
} from "../services/elevenLabsService.js";
import { summarizeMeeting } from "../services/summarizationService.js";
import { transcribeWithGemini } from "../services/geminiService.js";
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
    console.log(
      `[Orchestrator] Client transcript entries: ${clientTranscript.length}`
    );
    console.log(`========================================\n`);

    let fullTranscript = "";
    let speakerSegments = [];
    let transcriptSource = "none";

    // STEP 1: Transcription with ElevenLabs (ONLY - no fallback to Gemini)
    let elevenLabsSuccess = false;

    // Update processing stage
    await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        processing_stage: "transcribing",
        status: "processing",
      },
    });

    // Retry logic for ElevenLabs
    let retries = 3;
    let delay = 5000; // 5 seconds

    while (retries > 0 && !elevenLabsSuccess) {
      if (
        process.env.ELEVENLABS_API_KEY &&
        process.env.ELEVENLABS_API_KEY !== "your-elevenlabs-api-key-here"
      ) {
        try {
          console.log(
            `[Orchestrator] Step 1: Transcribing with ElevenLabs (Attempt ${
              4 - retries
            }/3)...`
          );
          const elevenLabsResult = await transcribeWithElevenLabs(filePath);

          console.log(`[Orchestrator] ✓ ElevenLabs transcription completed`);
          console.log(
            `[Orchestrator]   - Language: ${elevenLabsResult.language}`
          );
          console.log(`[Orchestrator]   - Words: ${elevenLabsResult.words}`);

          // IMMEDIATE SAVE: Store ElevenLabs raw transcript separately
          await prisma.meeting.update({
            where: { id: meetingId },
            data: {
              elevenlabs_transcript: elevenLabsResult.fullText,
              transcription_words: elevenLabsResult.words,
              processing_stage: "transcribed",
              status: "transcribed",
            },
          });
          console.log("[Orchestrator] ✓ Saved ElevenLabs transcript to database");
          console.log(`[Orchestrator]   - Transcript length: ${elevenLabsResult.fullText.length} characters`);
          console.log(`[Orchestrator]   - Word count: ${elevenLabsResult.words}`);

          // Combine with caption data for speaker identification
          if (clientTranscript.length > 0) {
            console.log(
              "[Orchestrator] Combining ElevenLabs transcript with caption data for speaker identification..."
            );
            const combined = combineTranscriptWithCaptions(
              elevenLabsResult.fullText,
              clientTranscript
            );

            fullTranscript = combined.fullText;
            speakerSegments = combined.segments;
            transcriptSource = combined.transcriptSource;

            console.log(`[Orchestrator]   - Combined ${combined.segments.length} speaker segments`);
          } else {
            // Use diarized segments from ElevenLabs
            speakerSegments = elevenLabsResult.segments || [];
            transcriptSource = "elevenlabs_diarization";

            // Format transcript with speaker labels
            if (speakerSegments.length > 0) {
              fullTranscript = speakerSegments
                .map(seg => `Speaker ${seg.speaker}: ${seg.text}`)
                .join('\n');
              console.log(`[Orchestrator] Formatted transcript with ${speakerSegments.length} speaker segments from ElevenLabs`);
            } else {
              // Fallback to plain text if no segments
              fullTranscript = elevenLabsResult.fullText;
              console.log("[Orchestrator] No ElevenLabs segments, using plain transcript");
            }
          }
          elevenLabsSuccess = true;

          // IMMEDIATE SAVE: Save combined transcript with speakers
          await prisma.meeting.update({
            where: { id: meetingId },
            data: {
              raw_transcript: fullTranscript,
            },
          });
          console.log("[Orchestrator] ✓ Saved combined transcript with speaker data");
        } catch (elevenLabsError) {
          console.error(
            `[Orchestrator] ElevenLabs transcription failed (Attempt ${
              4 - retries
            }):`,
            elevenLabsError.message
          );

          // Store error in database
          await prisma.meeting.update({
            where: { id: meetingId },
            data: {
              error_log: `ElevenLabs transcription attempt ${4 - retries} failed: ${elevenLabsError.message}`,
              processing_stage: "transcription_error",
            },
          });

          retries--;
          if (retries > 0) {
            console.log(
              `[Orchestrator] Retrying in ${delay / 1000} seconds...`
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
            delay *= 2; // Exponential backoff
          }
        }
      } else {
        console.log(
          "[Orchestrator] ElevenLabs API key not configured. Cannot proceed without transcription."
        );
        await prisma.meeting.update({
          where: { id: meetingId },
          data: {
            error_log: "ElevenLabs API key not configured",
            processing_stage: "error",
            status: "failed",
          },
        });
        break; // Don't retry if no key
      }
    }

    // NO FALLBACK to Gemini - ElevenLabs only as per user request

    // If ElevenLabs failed after all retries, stop processing
    if (!fullTranscript) {
      console.log(
        "[Orchestrator] ⚠️  ElevenLabs transcription failed after all retries. Cannot proceed."
      );
      await prisma.meeting.update({
        where: { id: meetingId },
        data: {
          raw_transcript: "Transcription failed",
          summary: "Processing failed: ElevenLabs transcription failed after 3 attempts",
          processing_stage: "failed",
          status: "failed",
        },
      });
      return;
    }

    console.log(
      `[Orchestrator] Transcript ready (source: ${transcriptSource})`
    );
    console.log(
      `[Orchestrator] Length: ${fullTranscript.length} chars, ${
        fullTranscript.split("\n").length
      } lines`
    );

    // STEP 2: Summarization with Chunking & Map-Reduce using Gemini
    // Update processing stage
    await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        processing_stage: "summarizing",
      },
    });
    let summaryResult = {
      summary: "Summarization skipped (no API key)",
      actionItems: [],
      keyPoints: [],
    };

    if (
      process.env.GEMINI_API_KEY &&
      process.env.GEMINI_API_KEY !== "your-gemini-api-key-here"
    ) {
      try {
        console.log(
          "\n[Orchestrator] Step 2: Summarizing with Gemini 2.5 Flash (Map-Reduce)..."
        );
        // This service handles:
        // 1. Tokenization (tiktoken)
        // 2. Chunking
        // 3. Map (Summarize each chunk)
        // 4. Reduce (Consolidate into final summary)
        summaryResult = await summarizeMeeting(fullTranscript, speakerSegments);

        console.log(`[Orchestrator] ✓ Summarization completed`);
        console.log(
          `[Orchestrator]   - Summary length: ${summaryResult.summary.length} chars`
        );
        console.log(
          `[Orchestrator]   - Action items: ${summaryResult.actionItems.length}`
        );
        console.log(
          `[Orchestrator]   - Key points: ${summaryResult.keyPoints.length}`
        );

        // IMMEDIATE SAVE: Save summary to DB
        await prisma.meeting.update({
          where: { id: meetingId },
          data: {
            summary: summaryResult.summary,
            action_items: JSON.stringify(summaryResult.actionItems),
            sentiment: "Neutral",
            processing_stage: "summarized",
            status: "completed",
          },
        });
        console.log("[Orchestrator] ✓ Saved summary and action items to database.");
      } catch (sumError) {
        console.error("[Orchestrator] Summarization failed:", sumError.message);
        summaryResult.summary = `Summarization error: ${sumError.message}`;
      }
    } else {
      console.log(
        "[Orchestrator] Gemini API key not configured. Skipping summarization."
      );
    }

    // STEP 3: Save Speaker Segments to Database
    console.log("\n[Orchestrator] Step 3: Saving speaker segments...");

    // Save speaker segments
    if (speakerSegments.length > 0) {
      for (const segment of speakerSegments) {
        await prisma.speakerSegment.create({
          data: {
            meeting_id: meetingId,
            speaker_name: segment.speaker || "Unknown",
            text: segment.text,
            timestamp: new Date(segment.startTime || Date.now()),
          },
        });
      }
      console.log(
        `[Orchestrator] ✓ Saved ${speakerSegments.length} speaker segments to database`
      );
    } else {
      console.log("[Orchestrator] No speaker segments to save");
    }

    // Final update to mark as completed
    await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        processing_stage: "completed",
        status: "completed",
      },
    });

    console.log(`[Orchestrator] ✓ Meeting processing completed`);

    // STEP 4: Cleanup temporary audio file
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[Orchestrator] ✓ Cleaned up temp file: ${filePath}`);
    }

    console.log(`\n========================================`);
    console.log(`[Orchestrator] ✅ Pipeline completed for ${meetingId}`);
    console.log(`========================================\n`);
  } catch (error) {
    console.error(
      `\n[Orchestrator] ❌ Pipeline failed for ${meetingId}:`,
      error
    );
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
