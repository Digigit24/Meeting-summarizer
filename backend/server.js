import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import meetingRoutes from "./routes/meetingRoutes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(
  cors({
    origin: "*", // For dev. In prod, use: `chrome-extension://${EXTENSION_ID}`
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
  })
);
app.use(express.json());

// Auth Middleware (Basic API Key)
app.use((req, res, next) => {
  // Skip auth for public health checks if any, or specific paths
  // For now, require key for everything under /api
  const apiKey = req.headers["x-api-key"];
  if (!apiKey || apiKey !== process.env.API_SECRET_KEY) {
    // Warning: For this demo/dev, we might want to be lenient if env is missing
    if (process.env.API_SECRET_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }
  next();
});

app.use("/api", meetingRoutes);
app.use("/uploads", express.static("uploads")); // Serve local audio files if S3 fails

app.get("/", (req, res) => {
  res.send("MeetSync Backend Running");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
