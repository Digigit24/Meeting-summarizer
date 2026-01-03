import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import meetingRoutes from "./routes/meetingRoutes.js";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Logging Middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.use(cors({ origin: "*" }));
app.use(express.json());

// Auth Middleware
app.use((req, res, next) => {
  if (
    req.path === "/" ||
    req.path.startsWith("/admin") ||
    req.path.startsWith("/uploads") ||
    req.path === "/api/admin/login"
  ) {
    return next();
  }

  const apiKey = req.headers["x-api-key"];
  const expectedKey = process.env.API_SECRET_KEY || "my-secret-extension-key";

  if (!apiKey || apiKey !== expectedKey) {
    // Only check if we are not in a loose dev environment, but here we enforce if key is present
    if (apiKey !== expectedKey) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }
  next();
});

// 1. Explicit Route to serve Admin Panel
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// 2. Secure Login Route (Checks .env)
app.post("/api/admin/login", (req, res) => {
  let { email, password } = req.body;
  email = (email || "").trim();
  password = (password || "").trim();

  const validEmail = process.env.ADMIN_EMAIL || "admin@celiyo.com";
  const validPass = process.env.ADMIN_PASSWORD || "Letmegoin@0007";

  if (email === validEmail && password === validPass) {
    return res.json({
      success: true,
      apiKey: process.env.API_SECRET_KEY || "my-secret-extension-key",
    });
  }
  return res.status(401).json({ error: "Invalid credentials" });
});

app.use("/api", meetingRoutes);

// Serve local audio files
app.use(
  "/uploads",
  (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    next();
  },
  express.static("uploads")
);

app.get("/", (req, res) => {
  res.send("MeetSync Backend Running - Visit /admin for the dashboard");
});

app.listen(PORT, () => {
  console.log(`✅ Server Running on http://localhost:${PORT}`);
  console.log(`📊 Panel: http://localhost:${PORT}/admin`);
});
