import express from "express";
import multer from "multer";
import { uploadMeeting } from "../controllers/uploadController.js";
import { PrismaClient } from "@prisma/client";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "stream";
import { verifyToken as checkAuth } from "../middleware/auth.js";

const router = express.Router();
const prisma = new PrismaClient();
const upload = multer({ dest: "uploads/" }); // Temp storage

// S3 Client
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Upload - PUBLIC
router.post("/upload", upload.single("audio"), uploadMeeting);

// List Meetings - AUTH REQUIRED
router.get("/meetings", checkAuth, async (req, res) => {
  try {
    const meetings = await prisma.meeting.findMany({
      orderBy: { created_at: "desc" },
    });
    res.setHeader("Cache-Control", "no-store"); // Prevent 304 caching
    res.json({ meetings });
  } catch (error) {
    console.error("[Meetings API] Error fetching meetings:", error);
    res.status(500).json({ error: "Failed to fetch meetings" });
  }
});

// Soft Delete - AUTH REQUIRED
router.delete("/meetings/:id", checkAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const meeting = await prisma.meeting.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
    res.json({ message: "Meeting moved to trash", meeting });
  } catch (error) {
    res.status(500).json({ error: "Delete failed" });
  }
});

// Restore - AUTH REQUIRED
router.post("/meetings/:id/restore", checkAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const meeting = await prisma.meeting.update({
      where: { id },
      data: { deleted_at: null },
    });
    res.json({ message: "Meeting restored", meeting });
  } catch (error) {
    res.status(500).json({ error: "Restore failed" });
  }
});

// Clean Old - AUTH REQUIRED
router.delete("/meetings/cleanup/old", checkAuth, async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const result = await prisma.meeting.deleteMany({
      where: { deleted_at: { lte: thirtyDaysAgo, not: null } },
    });
    res.json({ message: `Deleted ${result.count}`, count: result.count });
  } catch (error) {
    res.status(500).json({ error: "Cleanup failed" });
  }
});

// Force Delete - AUTH REQUIRED
router.delete("/meetings/:id/force", checkAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const meeting = await prisma.meeting.findUnique({ where: { id } });
    if (!meeting) return res.status(404).json({ error: "Not found" });
    if (!meeting.deleted_at)
      return res.status(400).json({ error: "Must archive first" });

    // 1. Delete from S3 (Best Effort)
    if (meeting.s3_url && meeting.s3_url.includes("amazonaws.com")) {
      try {
        const urlObj = new URL(meeting.s3_url);
        // Clean Key
        const s3Key = urlObj.pathname.startsWith("/")
          ? urlObj.pathname.substring(1)
          : urlObj.pathname;

        console.log(`[Force Delete] Removing S3 Object: ${s3Key}`);
        await s3.send(
          new DeleteObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: s3Key,
          })
        );
      } catch (s3Err) {
        console.error("[Force Delete] Failed to delete S3 object:", s3Err);
        // Start a "Soft Failure" log but proceed to delete DB record
      }
    }

    // 2. Delete from DB
    await prisma.meeting.delete({ where: { id } });
    res.json({ message: "Permanently deleted", id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Force delete failed" });
  }
});

// Audio URL - AUTH REQUIRED (Admin View)
router.get("/audio/:meetingId", checkAuth, async (req, res) => {
  try {
    const { meetingId } = req.params;
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
    });
    if (!meeting) return res.status(404).json({ error: "Meeting not found" });

    let s3Url = meeting.s3_url;
    if (!s3Url) return res.status(404).json({ error: "No audio URL" });

    // Handle Local -> Relative
    if (
      s3Url.includes("localhost") ||
      s3Url.includes("127.0.0.1") ||
      !s3Url.startsWith("http")
    ) {
      if (s3Url.includes("/uploads/")) {
        const relativePath = "/uploads/" + s3Url.split("/uploads/")[1];
        return res.json({ url: relativePath });
      }
      return res.json({ url: s3Url });
    }

    // Handle S3
    try {
      const urlObj = new URL(s3Url);
      if (urlObj.hostname.includes("amazonaws.com")) {
        const s3Key = urlObj.pathname.startsWith("/")
          ? urlObj.pathname.substring(1)
          : urlObj.pathname;
        if (process.env.AWS_ACCESS_KEY_ID) {
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
    } catch (e) {}

    return res.json({ url: s3Url });
  } catch (error) {
    // Fail Open Fallback
    try {
      const fb = await prisma.meeting.findUnique({
        where: { id: req.params.meetingId },
      });
      if (fb && fb.s3_url) {
        if (fb.s3_url.includes("/uploads/"))
          return res.json({
            url: "/uploads/" + fb.s3_url.split("/uploads/")[1],
          });
        return res.json({ url: fb.s3_url });
      }
    } catch (e) {}
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
