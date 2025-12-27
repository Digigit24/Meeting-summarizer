import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Use Gemini 2.0 Flash (Preview) or fallback to 1.5 Flash if 2.0 is not yet available in the region/SDK alias
// 'gemini-2.0-flash-exp' is the likely model name for the preview.
const MODEL_NAME = "gemini-2.0-flash-exp";

export async function summarizeWithGemini(transcriptText, retryCount = 0) {
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
