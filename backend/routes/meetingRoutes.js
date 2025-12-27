import express from "express";
import multer from "multer";
import { uploadMeeting } from "../controllers/uploadController.js";
import { PrismaClient } from "@prisma/client";

const router = express.Router();
const prisma = new PrismaClient();
const upload = multer({ dest: "uploads/" }); // Temp storage

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

export default router;
