import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Use Gemini 2.5 Flash (latest model)
// Fallback order: gemini-2.5-flash -> gemini-2.0-flash-exp -> gemini-1.5-flash
const MODEL_NAME = "gemini-2.5-flash";

async function summarizeWithGemini(transcriptText, retryCount = 0) {
  const MAX_RETRIES = 3;
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig: {
      responseMimeType: "application/json",
    },
  });

  const prompt = `
    You are an expert executive assistant. Your goal is to transform the following raw meeting transcript into professional, structured meeting minutes.
    
    Processing Instructions:
    1. Ignore filler words (um, ah, like).
    2. Focus strictly on 'Who' said 'What' and 'When'.
    3. If the transcript contains mixed languages (e.g., Hindi-English/Hinglish), translate the summary into clean, professional English.
    
    Transcript:
    "${transcriptText}"
    
    Output the result in this VALID JSON format (do not wrap in markdown code blocks, just raw JSON):
    {
      "title": "A catchy and relevant title based on content",
      "overall_sentiment": "Positive, Neutral, or Tense",
      "summary_points": [
        "Concise point 1",
        "Concise point 2"
      ],
      "decisions_made": [
        "Decision 1",
        "Decision 2"
      ],
      "action_items": [
        { "owner": "Name or Role", "task": "Specific task description", "deadline": "Date/Time if mentioned, else 'TBD'" }
      ],
      "next_meeting_agenda": "Brief agenda if discussed, else null"
    }
    `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    return JSON.parse(text);
  } catch (error) {
    console.error(`Gemini Attempt ${retryCount + 1} failed:`, error.message);

    if (retryCount < MAX_RETRIES) {
      // Exponential backoff: 1s, 2s, 4s...
      const delay = Math.pow(2, retryCount) * 1000;
      console.log(`Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return summarizeWithGemini(transcriptText, retryCount + 1);
    } else {
      throw new Error("Gemini API failed after max retries.");
    }
  }
}

export { summarizeWithGemini };

export async function transcribeWithGemini(
  filePath,
  mimeType = "audio/webm",
  retryCount = 0
) {
  try {
    const fs = await import("fs");
    const audioData = fs.readFileSync(filePath).toString("base64");
    const MAX_RETRIES = 3;

    const model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    const prompt = `
      Transcribe the following audio meeting recording.
      Verify the speakers by analyzing voice characteristics if possible, or label as Speaker 1, Speaker 2 etc.
      
      Return the result in this JSON format:
      {
        "language": "en",
        "words": 0,
        "fullText": "Full transcript...",
        "segments": [
          { "speaker": "Speaker 1", "text": "Hello", "startTime": 0.0 }
        ]
      }
    `;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: mimeType,
          data: audioData,
        },
      },
    ]);

    const response = await result.response;
    return JSON.parse(response.text());
  } catch (error) {
    console.error(
      `Gemini Transcription Attempt ${retryCount + 1} failed:`,
      error.message
    );

    // Check for rate limit error specifically (429) or general failure
    const isRateLimit =
      error.message.includes("429") || error.message.includes("Quota exceeded");
    const MAX_RETRIES = 3;

    if (retryCount < MAX_RETRIES) {
      // Heavier backoff for rate limits: 5s, 10s, 20s
      const backoffBase = isRateLimit ? 5000 : 2000;
      const delay = backoffBase * (retryCount + 1);

      console.log(`Retrying transcription in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return transcribeWithGemini(filePath, mimeType, retryCount + 1);
    }

    throw error;
  }
}
