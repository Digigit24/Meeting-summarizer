import express from "express";
import multer from "multer";
import { uploadMeeting } from "../controllers/uploadController.js";
import { PrismaClient } from "@prisma/client";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "stream";

const router = express.Router();
const prisma = new PrismaClient();
const upload = multer({ dest: "uploads/" }); // Temp storage

// S3 Client for audio proxy
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Upload Endpoint
router.post("/upload", upload.single("audio"), uploadMeeting);

// List Meetings (includes soft-deleted)
router.get("/meetings", async (req, res) => {
  try {
    const meetings = await prisma.meeting.findMany({
      orderBy: { created_at: "desc" },
    });
    res.json({ meetings });
  } catch (error) {
    console.error("[Meetings API] Error fetching meetings:", error);
    res.status(500).json({ error: "Failed to fetch meetings" });
  }
});

// Soft Delete Meeting
router.delete("/meetings/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Soft delete by setting deleted_at timestamp
    const meeting = await prisma.meeting.update({
      where: { id },
      data: { deleted_at: new Date() },
    });

    console.log(`[Meetings API] Soft deleted meeting: ${id}`);
    res.json({ message: "Meeting moved to trash", meeting });
  } catch (error) {
    console.error("[Meetings API] Error deleting meeting:", error);
    res.status(500).json({ error: "Delete failed" });
  }
});

// Restore Meeting
router.post("/meetings/:id/restore", async (req, res) => {
  try {
    const { id } = req.params;

    // Restore by clearing deleted_at
    const meeting = await prisma.meeting.update({
      where: { id },
      data: { deleted_at: null },
    });

    console.log(`[Meetings API] Restored meeting: ${id}`);
    res.json({ message: "Meeting restored", meeting });
  } catch (error) {
    console.error("[Meetings API] Error restoring meeting:", error);
    res.status(500).json({ error: "Restore failed" });
  }
});

// Permanently Delete Old Meetings (auto-cleanup cron job)
router.delete("/meetings/cleanup/old", async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Delete meetings that were soft-deleted more than 30 days ago
    const result = await prisma.meeting.deleteMany({
      where: {
        deleted_at: {
          lte: thirtyDaysAgo,
          not: null,
        },
      },
    });

    console.log(
      `[Meetings API] Permanently deleted ${result.count} old meetings`
    );
    res.json({
      message: `Deleted ${result.count} old meetings`,
      count: result.count,
    });
  } catch (error) {
    console.error("[Meetings API] Error cleaning up old meetings:", error);
    res.status(500).json({ error: "Cleanup failed" });
  }
});

// Force Delete Meeting (permanently delete before 30 days)
router.delete("/meetings/:id/force", async (req, res) => {
  try {
    const { id } = req.params;

    // Check if meeting exists and is archived (deleted_at is not null)
    const meeting = await prisma.meeting.findUnique({
      where: { id },
    });

    if (!meeting) {
      return res.status(404).json({ error: "Meeting not found" });
    }

    if (!meeting.deleted_at) {
      return res.status(400).json({
        error:
          "Meeting must be archived before force deletion. Archive it first.",
      });
    }

    // Permanently delete the meeting
    await prisma.meeting.delete({
      where: { id },
    });

    console.log(`[Meetings API] Force deleted meeting: ${id}`);
    res.json({ message: "Meeting permanently deleted", id });
  } catch (error) {
    console.error("[Meetings API] Error force deleting meeting:", error);
    res.status(500).json({ error: "Force delete failed" });
  }
});

// Generate Presigned URL for S3 files (or return local/relative URL)
router.get("/audio/:meetingId", async (req, res) => {
  try {
    const { meetingId } = req.params;

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
    });

    if (!meeting) {
      return res.status(404).json({ error: "Meeting not found" });
    }

    let s3Url = meeting.s3_url;
    if (!s3Url) {
      return res
        .status(404)
        .json({ error: "No audio URL found for this meeting" });
    }

    // 1. Handle Local/Dev URLs -> Convert to Relative Path
    // This ensures http://localhost:3001/uploads/x.webm works on https://prod.com/uploads/x.webm
    if (
      s3Url.includes("localhost") ||
      s3Url.includes("127.0.0.1") ||
      !s3Url.startsWith("http")
    ) {
      // If it's effectively a local path, try to extract the relative part
      // e.g. "http://localhost:3001/uploads/file.webm" -> "/uploads/file.webm"
      if (s3Url.includes("/uploads/")) {
        const relativePath = "/uploads/" + s3Url.split("/uploads/")[1];
        return res.json({ url: relativePath });
      }
      // If it doesn't start with http (already relative), return as is
      return res.json({ url: s3Url });
    }

    // 2. Handle S3 URLs
    try {
      // Try parsing as a URL
      const urlObj = new URL(s3Url);
      const host = urlObj.hostname;

      // Basic check if it looks like AWS S3
      if (host.includes("amazonaws.com")) {
        // Extract Key: "https://bucket.s3.region.amazonaws.com/folder/key" -> "folder/key"
        // pathname starts with /, remove it
        const s3Key = urlObj.pathname.startsWith("/")
          ? urlObj.pathname.substring(1)
          : urlObj.pathname;

        // Ensure AWS Client is configured before trying to sign
        if (
          process.env.AWS_ACCESS_KEY_ID &&
          process.env.AWS_SECRET_ACCESS_KEY &&
          process.env.AWS_BUCKET_NAME
        ) {
          const command = new GetObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: s3Key,
          });
          const signedUrl = await getSignedUrl(s3, command, {
            expiresIn: 3600,
          });
          return res.json({ url: signedUrl });
        }
      }
    } catch (parseError) {
      console.warn(
        "[Audio URL] URL parsing failed, returning raw URL:",
        parseError.message
      );
    }

    // Fallback: Return raw URL if it's not S3 or if signing fails/is skipped
    return res.json({ url: s3Url });
  } catch (error) {
    console.error("[Audio URL] Critical Error:", error);
    // Even in critical error, try to return the raw URL from DB if we have the meeting object
    try {
      const fallbackMeeting = await prisma.meeting.findUnique({
        where: { id: req.params.meetingId },
      });
      if (fallbackMeeting && fallbackMeeting.s3_url) {
        // Attempt relative conversion one last time in fallback
        if (fallbackMeeting.s3_url.includes("/uploads/")) {
          const rp = "/uploads/" + fallbackMeeting.s3_url.split("/uploads/")[1];
          return res.json({ url: rp });
        }
        return res.json({ url: fallbackMeeting.s3_url });
      }
    } catch (e) {}

    res.status(500).json({ error: "Failed to generate audio URL" });
  }
});

export default router;
