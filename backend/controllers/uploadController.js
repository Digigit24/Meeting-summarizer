import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { PrismaClient } from "@prisma/client";
import { startProcessing } from "../controllers/processController.js";
import fs from "fs";

const prisma = new PrismaClient();
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

export const uploadMeeting = async (req, res) => {
  try {
    console.log("[Backend Upload] Received upload request.");
    const file = req.file;
    const { name, transcript } = req.body;

    if (!file) {
      console.error("[Backend Upload] No file in request.");
      return res.status(400).json({ error: "No file uploaded" });
    }
    console.log(
      `[Backend Upload] File: ${file.originalname}, Size: ${file.size}, Mime: ${file.mimetype}`
    );

    const fileKey = `meetings/${Date.now()}_${file.originalname}`;

    // 1. Upload to S3
    // Ensure stream is open
    const fileStream = fs.createReadStream(file.path);
    const uploadParams = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: fileKey,
      Body: fileStream,
      ContentType: file.mimetype,
    };

    let s3Url = "";
    try {
      await s3.send(new PutObjectCommand(uploadParams));
      s3Url = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;
    } catch (s3Error) {
      console.warn("S3 Upload Failed. Using local fallback.", s3Error.message);
      s3Url = `http://localhost:${process.env.PORT || 3000}/uploads/${
        file.filename
      }`;
    }

    // 2. Create Initial DB Record
    // Store the uploaded transcript if available (as fallback or primary)
    // The transcript comes as a JSON string from FormData
    const rawTranscript = transcript ? JSON.parse(transcript) : [];
    const formattedTranscript = rawTranscript
      .map((t) => `${t.speaker}: ${t.text}`)
      .join("\n");

    const meeting = await prisma.meeting.create({
      data: {
        name: name || "Untitled Meeting",
        s3_url: s3Url,
        raw_transcript: formattedTranscript || "", // Store initial draft
      },
    });

    // 3. Trigger Async Processing (Fire and Forget)
    // Pass the transcript draft too if we want to merge it
    startProcessing(meeting.id, file.path, rawTranscript).catch((err) => {
      console.error(
        `Background processing failed for meeting ${meeting.id}:`,
        err
      );
    });

    // 4. Return success
    res.status(201).json({
      message: "Upload successful, processing started",
      meetingId: meeting.id,
    });
  } catch (error) {
    console.error("Upload Controller Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
