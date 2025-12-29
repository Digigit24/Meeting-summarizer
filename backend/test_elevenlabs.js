import axios from "axios";
import FormData from "form-data";
import fs from "fs";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });

const API_KEY = process.env.ELEVENLABS_API_KEY;
const FILE_PATH = path.join(
  __dirname,
  "uploads/b170a5a41c2ff3b036d45571c9ae5dae"
); // The 22KB file

async function testElevenLabs() {
  console.log("Testing ElevenLabs API...");
  console.log(`API Key present: ${!!API_KEY}`);

  if (!fs.existsSync(FILE_PATH)) {
    console.error("Test file not found:", FILE_PATH);
    return;
  }

  const formData = new FormData();
  formData.append("file", fs.createReadStream(FILE_PATH));
  formData.append("model_id", "scribe_v1"); // Try v1 first as it might be more stable for free tier?

  try {
    console.log("Sending request...");
    const response = await axios.post(
      "https://api.elevenlabs.io/v1/speech-to-text",
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          "xi-api-key": API_KEY,
        },
      }
    );
    console.log("✅ Success!");
    console.log(response.data);
  } catch (error) {
    console.error("❌ Failed:", error.message);
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Data:", JSON.stringify(error.response.data, null, 2));
    }
  }
}

testElevenLabs();
