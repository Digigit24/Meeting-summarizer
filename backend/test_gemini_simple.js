import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

async function testGemini() {
  try {
    console.log("\n========================================");
    console.log("[Gemini Test] Testing Gemini API");
    console.log("========================================\n");

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    // Test with gemini-1.5-flash (free tier)
    console.log("[Gemini Test] Using model: gemini-1.5-flash");

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 200,
      }
    });

    const testTranscript = `
Speaker 0: Hello. Hi, this is Prateek, calling from Prateek's mic.
Speaker 1: Hi, this is Divya, calling from Divya's mic.
Speaker 0: Hi.
    `.trim();

    const prompt = `Summarize this short meeting transcript in 2-3 sentences:

${testTranscript}

Provide a brief summary.`;

    console.log("[Gemini Test] Sending request...\n");

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const summary = response.text();

    console.log("[Gemini Test] ✓ SUCCESS!");
    console.log("\n--- Summary ---");
    console.log(summary);
    console.log("---------------\n");

    console.log("========================================");
    console.log("Gemini API is working correctly!");
    console.log("========================================\n");

  } catch (error) {
    console.error("\n[Gemini Test] ✗ FAILED");
    console.error("Error:", error.message);

    if (error.message.includes("quota") || error.message.includes("429")) {
      console.error("\n⚠️ QUOTA EXCEEDED");
      console.error("You've hit the free tier quota limit.");
      console.error("Solutions:");
      console.error("  1. Wait 24 hours for quota to reset");
      console.error("  2. Use a different API key");
      console.error("  3. Upgrade to paid tier\n");
    }
  }
}

testGemini();
