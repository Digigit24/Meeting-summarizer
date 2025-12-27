import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import meetingRoutes from "./routes/meetingRoutes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Logging Middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  console.log("Headers:", req.headers);
  next();
});

app.use(
  cors({
    origin: "*", // For dev. In prod, use: `chrome-extension://${EXTENSION_ID}`
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
  })
);
app.use(express.json());

// Auth Middleware (Basic API Key)
app.use((req, res, next) => {
  // Skip auth for health check
  if (req.path === "/") {
    return next();
  }

  const apiKey = req.headers["x-api-key"];
  console.log(`[Auth] Checking API key. Provided: ${apiKey ? "Yes" : "No"}, Expected: ${process.env.API_SECRET_KEY}`);

  if (!apiKey || apiKey !== process.env.API_SECRET_KEY) {
    // Warning: For this demo/dev, we might want to be lenient if env is missing
    if (process.env.API_SECRET_KEY) {
      console.log("[Auth] API key mismatch. Unauthorized.");
      return res.status(401).json({ error: "Unauthorized" });
    }
    console.log("[Auth] No API_SECRET_KEY configured. Allowing request.");
  }
  next();
});

app.use("/api", meetingRoutes);
app.use("/uploads", express.static("uploads")); // Serve local audio files if S3 fails

app.get("/", (req, res) => {
  res.send("MeetSync Backend Running");
});

app.listen(PORT, () => {
  console.log(`✅ MeetSync Backend Running on http://localhost:${PORT}`);
  console.log(`✅ API Key configured: ${process.env.API_SECRET_KEY ? "Yes" : "No"}`);
  console.log(`✅ ElevenLabs API Key configured: ${process.env.ELEVENLABS_API_KEY ? "Yes" : "No"}`);
  console.log(`✅ Gemini API Key configured: ${process.env.GEMINI_API_KEY ? "Yes" : "No"}`);
  console.log(`✅ AWS configured: ${process.env.AWS_ACCESS_KEY_ID ? "Yes" : "No (using local fallback)"}`);
});
