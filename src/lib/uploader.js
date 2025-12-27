import {
  getMeetingAudio,
  getFullTranscript,
  clearMeetingData,
  updateMeetingStatus,
} from "./db";

const BACKEND_URL = "http://127.0.0.1:3001/api";

export async function uploadMeetingData(meetingId, meetingName) {
  try {
    updateMeetingStatus(meetingId, "uploading");

    // 1. Gather Data
    const audioBlob = await getMeetingAudio(meetingId);
    const transcript = await getFullTranscript(meetingId);

    if (audioBlob.size === 0 && transcript.length === 0) {
      console.error("No data to upload");
      return false;
    }

    // 2. Prepare Form Data
    const formData = new FormData();
    formData.append("audio", audioBlob, `meeting_${meetingId}.webm`);
    formData.append("name", meetingName);
    formData.append("transcript", JSON.stringify(transcript));

    // 3. Upload
    const response = await fetch(`${BACKEND_URL}/upload`, {
      method: "POST",
      body: formData,
      // Headers: Authorization if needed (x-api-key)
      headers: {
        "x-api-key": "my-secret-extension-key", // Dev key
      },
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    const result = await response.json();
    console.log("Upload Success:", result);

    // 4. Cleanup
    updateMeetingStatus(meetingId, "uploaded");
    // Optional: clear huge data immediately or let user do it
    await clearMeetingData(meetingId);

    return result;
  } catch (error) {
    console.error("Upload Error:", error);
    updateMeetingStatus(meetingId, "pending_upload");
    return null; // Signals failure
  }
}
