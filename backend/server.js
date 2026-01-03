import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import meetingRoutes from "./routes/meetingRoutes.js";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || "super-secret-jwt-key-change-me";

// Logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Middleware
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(cookieParser()); // For JWT cookies

// JWT Verification Middleware
const verifyToken = (req, res, next) => {
  // 1. Check Cookie
  let token = req.cookies.access_token;

  // 2. Fallback to Header (Bearer token)
  if (!token && req.headers["authorization"]) {
    const parts = req.headers["authorization"].split(" ");
    if (parts.length === 2 && parts[0] === "Bearer") {
      token = parts[1];
    }
  }

  if (!token) {
    return res.status(401).json({ error: "Unauthorized: No token provided" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id, email }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Unauthorized: Invalid token" });
  }
};

// --- PUBLIC ROUTES (No Auth) ---

// 1. Serve Admin Panel HTML (Public accessible, but API calls inside will fail if not auth)
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// 2. Admin Login (Database backed)
app.post("/api/admin/login", async (req, res) => {
  try {
    let { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "Missing credentials" });

    const admin = await prisma.admin.findUnique({
      where: { email: email.trim() },
    });

    if (!admin) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Generate Token (24h)
    const token = jwt.sign({ id: admin.id, email: admin.email }, JWT_SECRET, {
      expiresIn: "24h",
    });

    // Set Cookie (HTTP Only)
    res.cookie("access_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // Secure in prod
      maxAge: 24 * 60 * 60 * 1000, // 24h
    });

    res.json({ success: true, token }); // Return token for fallback use if needed
  } catch (e) {
    console.error("Login Error:", e);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// 3. Extension Upload (Public / API Key protected if needed, but user asked for 'no auth' for extension)
// We will import meetingRoutes but we need to apply auth middleware SELECTIVELY.
// The meetingRoutes file defines router.get('/meetings'), router.delete... etc.
// We can wrap them here or modify meetingRoutes. Let's modify usage.

// We will mount a separate router for protected admin actions vs public upload
// But meetingRoutes has mixed routes. Let's keep it simple: Mount it, but inside meetingRoutes we can apply middleware/logic?
// OR: We apply middleware to specific paths BEFORE mounting meetingRoutes.

// Protected Paths:
// GET /api/meetings
// DELETE /api/meetings/:id
// POST /api/meetings/:id/restore

app.use("/api/meetings", (req, res, next) => {
  // Check if it is the PUBLIC upload endpoint? No, upload is at /api/upload (separate from /api/meetings)
  // Wait, meetingRoutes defines router.post("/upload"...)
  // router.get("/meetings"...)

  // So /api/meetings is protected.
  // /api/meetings/:id/restore is protected.
  verifyToken(req, res, next);
});

// But wait! meetingRoutes is mounted at /api.
// Inside meetingRoutes:
// POST /upload  -> MUST BE OPEN
// GET /meetings -> PROTECTED
// DELETE /meetings/:id -> PROTECTED
// GET /audio/:id -> PROTECTED? (Admin views it).
// The user said: "autherization headers as fallback... to delete recording or summaries it need to access admin page"
// "for extention thier will not be any authentication... upload recording... make sure you are not disturbing"

// Strategy: Move verifyToken INSIDE meetingRoutes or apply it here strictly.
// If I apply app.use('/api', meetingRoutes), I can't easily split inside unless I edit meetingRoutes.
// Editing meetingRoutes is safer.

app.use("/api", meetingRoutes);

// Serve local audio (Public? Ideally protected but simple static serve is hard to protect with JWT cookie easily for <audio src>)
// User prompt implies protection for admin actions. Viewing audio is an admin action usually.
// But <audio> tag requests don't send Authorization header easily. They DO send cookies!
// So if we use cookies, we CAN protect it.
app.use(
  "/uploads",
  (req, res, next) => {
    // Optional: Protect audio? User didn't strictly say protect audio FILE access, but "admin page... to delete".
    // If we rely on cookies, this works.
    // But for now, let's keep it open to ensure "not disturbing" playback if logic is complex.
    // Actually, let's allow it.
    res.setHeader("Access-Control-Allow-Origin", "*");
    next();
  },
  express.static("uploads")
);

app.get("/", (req, res) => {
  res.send("MeetSync Backend Running - Visit /admin");
});

app.listen(PORT, () => {
  console.log(`✅ Server Running on http://localhost:${PORT}`);
  console.log(`📊 Panel: http://localhost:${PORT}/admin`);
});
