import express from "express";
import multer from "multer";
import { uploadMeeting } from "../controllers/uploadController.js";
import { PrismaClient } from "@prisma/client";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
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

// List Meetings
router.get("/meetings", async (req, res) => {
  try {
    const meetings = await prisma.meeting.findMany({
      orderBy: { created_at: "desc" },
    });
    res.json(meetings);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch meetings" });
  }
});

// Delete Meeting
router.delete("/meetings/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.meeting.delete({ where: { id } });
    // Optional: Delete from S3 logic here
    res.json({ message: "Meeting deleted" });
  } catch (error) {
    res.status(500).json({ error: "Delete failed" });
  }
});

// Proxy audio files from S3 to avoid CORS issues
router.get("/audio/:meetingId", async (req, res) => {
  try {
    const { meetingId } = req.params;

    // Get meeting to find S3 URL
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
    });

    if (!meeting) {
      return res.status(404).json({ error: "Meeting not found" });
    }

    const s3Url = meeting.s3_url;

    // If it's a local URL, redirect to it
    if (s3Url.includes("localhost") || s3Url.includes("127.0.0.1")) {
      const localPath = s3Url.split("/uploads/")[1];
      return res.redirect(`/uploads/${localPath}`);
    }

    // Extract S3 key from URL
    const urlParts = s3Url.split(".com/");
    if (urlParts.length < 2) {
      return res.status(400).json({ error: "Invalid S3 URL" });
    }

    const s3Key = urlParts[1];

    // Fetch from S3
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: s3Key,
    });

    const s3Response = await s3.send(command);

    // Set proper headers
    res.setHeader("Content-Type", "audio/webm");
    res.setHeader("Content-Length", s3Response.ContentLength);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Access-Control-Allow-Origin", "*");

    // Stream the audio
    if (s3Response.Body instanceof Readable) {
      s3Response.Body.pipe(res);
    } else {
      res.status(500).json({ error: "Invalid response from S3" });
    }
  } catch (error) {
    console.error("[Audio Proxy] Error:", error);
    res.status(500).json({ error: "Failed to fetch audio" });
  }
});

export default router;
