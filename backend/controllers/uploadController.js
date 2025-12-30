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
    let s3UploadSuccess = false;

    // Attempt S3 upload
    try {
      console.log(`[S3 Upload] Attempting upload to bucket: ${process.env.AWS_BUCKET_NAME}`);
      console.log(`[S3 Upload] Region: ${process.env.AWS_REGION}`);
      console.log(`[S3 Upload] File key: ${fileKey}`);

      await s3.send(new PutObjectCommand(uploadParams));
      s3Url = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;
      s3UploadSuccess = true;

      console.log(`[S3 Upload] ✅ SUCCESS! File uploaded to S3: ${s3Url}`);
    } catch (s3Error) {
      console.error("[S3 Upload] ❌ FAILED - Using local fallback");
      console.error("[S3 Upload] Error name:", s3Error.name);
      console.error("[S3 Upload] Error message:", s3Error.message);
      console.error("[S3 Upload] Error code:", s3Error.code);
      console.error("[S3 Upload] Full error:", JSON.stringify(s3Error, null, 2));

      // Use local fallback
      s3Url = `http://127.0.0.1:${process.env.PORT || 3001}/uploads/${file.filename}`;
      console.log(`[S3 Upload] Using local URL instead: ${s3Url}`);
    }

    // 2. Create Initial DB Record
    // Store the uploaded transcript if available (as fallback or primary)
    // The transcript comes as a JSON string from FormData
    const rawTranscript = transcript ? JSON.parse(transcript) : [];
    const formattedClientTranscript = rawTranscript
      .map((t) => `${t.speaker}: ${t.text}`)
      .join("\n");

    console.log(`[Backend Upload] Audio file size: ${file.size} bytes`);
    console.log(`[Backend Upload] Client transcript entries: ${rawTranscript.length}`);

    const meeting = await prisma.meeting.create({
      data: {
        name: name || "Untitled Meeting",
        s3_url: s3Url,
        client_transcript: formattedClientTranscript || "", // Store client captions separately
        audio_file_size: file.size,
        processing_stage: "uploaded",
        status: "processing",
      },
    });

    console.log(`[Backend Upload] Created meeting record: ${meeting.id}`);

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
