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
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`); // Access Log
  next();
});

// Middleware
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(cookieParser()); // For JWT cookies

// --- PUBLIC ROUTES (No Auth) ---

// 1. Serve Admin Panel HTML
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// Auto-Seed Admin Function
async function ensureAdmin() {
  // Critical Check: ensure Prisma Client is generated
  if (!prisma.admin) {
    console.error("❌ CRITICAL ERROR: 'prisma.admin' is undefined.");
    console.error(
      "👉 ACTION REQUIRED: Run 'npx prisma generate' in your backend directory to update the Prisma Client."
    );
    return;
  }

  try {
    const email = process.env.ADMIN_EMAIL || "admin@celiyo.com";
    const passwordPlain = process.env.ADMIN_PASSWORD || "Letmegoin@0007";

    // Check if admin exists
    const admin = await prisma.admin.findUnique({ where: { email } });
    if (!admin) {
      console.log(`[Startup] Seeding Admin User (${email})...`);
      const password = await bcrypt.hash(passwordPlain, 10);
      await prisma.admin.create({ data: { email, password } });
      console.log("[Startup] Admin Created.");
    } else {
      console.log("[Startup] Admin User exists.");
    }
  } catch (e) {
    console.error(
      "[Startup] Failed to check/seed admin. DB might be missing 'Admin' table?",
      e.message
    );
  }
}

// 2. Admin Login
app.post("/api/admin/login", async (req, res) => {
  try {
    if (!prisma.admin) {
      throw new Error(
        "Prisma Client out of sync. 'prisma.admin' is undefined. Run 'npx prisma generate'."
      );
    }

    let { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "Missing credentials" });

    email = email.trim();

    const admin = await prisma.admin.findUnique({ where: { email } });

    if (!admin) {
      console.warn(`[Login Failed] Admin not found: ${email}`);
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) {
      console.warn(`[Login Failed] Invalid password for: ${email}`);
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Generate Token (24h)
    const token = jwt.sign({ id: admin.id, email: admin.email }, JWT_SECRET, {
      expiresIn: "24h",
    });

    // Set Cookie (HTTP Only)
    res.cookie("access_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.json({ success: true, token });
  } catch (e) {
    console.error("[Login Error]", e);
    res
      .status(500)
      .json({ error: "Internal Server Error", details: e.message });
  }
});

// Mount Routes
app.use("/api", meetingRoutes);

// Serve local audio (Public)
app.use(
  "/uploads",
  (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    next();
  },
  express.static("uploads")
);

app.get("/", (req, res) => {
  res.send("MeetSync Backend Running - Visit /admin");
});

// Start Server with Admin Check
app.listen(PORT, async () => {
  await ensureAdmin();
  console.log(`✅ Server Running on http://localhost:${PORT}`);
  console.log(`📊 Panel: http://localhost:${PORT}/admin`);
});
