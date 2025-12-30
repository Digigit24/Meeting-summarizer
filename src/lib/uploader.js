import {
  getMeetingAudio,
  getFullTranscript,
  clearMeetingData,
  updateMeetingStatus,
} from "./db";

const BACKEND_URL = "http://127.0.0.1:3001/api";

export async function uploadMeetingData(tempMeetingId, meetingName) {
  try {
    console.log("[Uploader] Starting upload");
    console.log("[Uploader] Temp ID (for audio lookup):", tempMeetingId);
    console.log("[Uploader] Final meeting name:", meetingName);

    updateMeetingStatus(tempMeetingId, "uploading");

    // 1. Gather Data - use tempMeetingId to fetch audio chunks
    const audioBlob = await getMeetingAudio(tempMeetingId);
    const transcript = await getFullTranscript(tempMeetingId);

    console.log("[Uploader] Audio blob size:", audioBlob.size, "bytes");
    console.log("[Uploader] Transcript entries:", transcript.length);

    if (audioBlob.size === 0 && transcript.length === 0) {
      console.error("[Uploader] No data to upload - both audio and transcript are empty");
      return false;
    }

    // 2. Prepare Form Data
    const formData = new FormData();
    formData.append("audio", audioBlob, `meeting_${meetingName}.webm`);
    formData.append("name", meetingName);
    formData.append("transcript", JSON.stringify(transcript));

    console.log("[Uploader] Uploading to backend:", BACKEND_URL + "/upload");

    // 3. Upload
    const response = await fetch(`${BACKEND_URL}/upload`, {
      method: "POST",
      body: formData,
      headers: {
        "x-api-key": "my-secret-extension-key",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Uploader] Upload failed:", response.status, errorText);
      throw new Error(`Upload failed: ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();
    console.log("[Uploader] Upload success:", result);

    // 4. Cleanup - use tempMeetingId
    updateMeetingStatus(tempMeetingId, "uploaded");
    await clearMeetingData(tempMeetingId);
    console.log("[Uploader] Cleanup completed for:", tempMeetingId);

    return result;
  } catch (error) {
    console.error("[Uploader] Upload error:", error);
    updateMeetingStatus(tempMeetingId, "pending_upload");
    return null;
  }
}
