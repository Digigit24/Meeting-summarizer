import { GoogleGenerativeAI } from "@google/generative-ai";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import dotenv from "dotenv";

dotenv.config();

console.log("\n========================================");
console.log("Testing API Credentials");
console.log("========================================\n");

// Test Gemini API
async function testGemini() {
  try {
    console.log("[Gemini Test] Starting...");
    console.log(`[Gemini Test] API Key: ${process.env.GEMINI_API_KEY ? '✓ Set' : '✗ Missing'}`);

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 100,
      }
    });

    const prompt = "Say 'Hello, I am working!' in exactly 5 words.";
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    console.log(`[Gemini Test] ✓ Success! Response: "${text}"`);
    return true;
  } catch (error) {
    console.error(`[Gemini Test] ✗ Failed:`, error.message);
    return false;
  }
}

// Test ElevenLabs API
async function testElevenLabs() {
  try {
    console.log("\n[ElevenLabs Test] Starting...");
    console.log(`[ElevenLabs Test] API Key: ${process.env.ELEVENLABS_API_KEY ? '✓ Set' : '✗ Missing'}`);

    // Check if we have a test audio file
    const testFile = './uploads/25541170b61018af4e020fbe89caed6e';
    const fs = await import('fs');

    if (!fs.existsSync(testFile)) {
      console.log(`[ElevenLabs Test] ⚠️ No test file found at ${testFile}`);
      console.log(`[ElevenLabs Test] Skipping transcription test`);
      return false;
    }

    const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
    const audioStream = fs.createReadStream(testFile);

    console.log(`[ElevenLabs Test] Transcribing test file...`);
    const response = await client.speechToText.convert({
      file: audioStream,
      modelId: "scribe_v1",
      tagAudioEvents: true,
      languageCode: "eng",
      diarize: true,
    });

    console.log(`[ElevenLabs Test] ✓ Success!`);
    console.log(`[ElevenLabs Test] Response structure:`, {
      hasText: !!response.text,
      textLength: response.text?.length || 0,
      hasWords: !!response.words,
      wordsCount: Array.isArray(response.words) ? response.words.length : 0,
      languageCode: response.language_code,
    });

    // Check first few words to see speaker IDs
    if (response.words && response.words.length > 0) {
      console.log(`\n[ElevenLabs Test] First 5 words with speakers:`);
      response.words.slice(0, 5).forEach((w, i) => {
        console.log(`  ${i + 1}. "${w.text}" - Speaker: ${w.speaker_id} (type: ${typeof w.speaker_id})`);
      });
    }

    return true;
  } catch (error) {
    console.error(`[ElevenLabs Test] ✗ Failed:`, error.message);
    return false;
  }
}

// Run tests
async function runTests() {
  console.log("Running API tests...\n");

  const geminiWorks = await testGemini();
  const elevenLabsWorks = await testElevenLabs();

  console.log("\n========================================");
  console.log("Test Results:");
  console.log("========================================");
  console.log(`Gemini API: ${geminiWorks ? '✓ Working' : '✗ Failed'}`);
  console.log(`ElevenLabs API: ${elevenLabsWorks ? '✓ Working' : '✗ Failed'}`);
  console.log("========================================\n");
}

runTests().catch(console.error);
