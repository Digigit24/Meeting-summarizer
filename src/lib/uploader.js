import {
  getMeetingAudio,
  getFullTranscript,
  clearMeetingData,
  updateMeetingStatus,
} from "./db";

// Production URL
const BACKEND_URL = "https://meeting-summarizer.celiyo.com/api";
const FALLBACK_URL = "https://meeting-summarizer.celiyo.com/api";

export async function uploadMeetingData(tempMeetingId, meetingName) {
  try {
    console.log("=== [Uploader] Starting Upload ===");
    console.log("[Uploader] Temp ID (for audio lookup):", tempMeetingId);
    console.log("[Uploader] Final meeting name:", meetingName);
    console.log("[Uploader] Backend URL:", BACKEND_URL);

    updateMeetingStatus(tempMeetingId, "uploading");

    // 1. Gather Data - use tempMeetingId to fetch audio chunks
    console.log("[Uploader] Fetching audio from IndexedDB...");
    const audioBlob = await getMeetingAudio(tempMeetingId);
    console.log("[Uploader] Fetching transcript from IndexedDB...");
    const transcript = await getFullTranscript(tempMeetingId);

    console.log("[Uploader] Audio blob size:", audioBlob.size, "bytes");
    console.log("[Uploader] Audio blob type:", audioBlob.type);
    console.log("[Uploader] Transcript entries:", transcript.length);

    if (audioBlob.size === 0 && transcript.length === 0) {
      console.error(
        "[Uploader] ❌ UPLOAD FAILED: No data to upload - both audio and transcript are empty"
      );
      console.error("[Uploader] Meeting ID used for lookup:", tempMeetingId);
      return false;
    }

    if (audioBlob.size === 0) {
      console.warn("[Uploader] ⚠️ Warning: Audio blob is empty (0 bytes)");
    }

    if (transcript.length === 0) {
      console.warn("[Uploader] ⚠️ Warning: Transcript is empty (0 entries)");
    }

    // 2. Prepare Form Data
    const formData = new FormData();
    formData.append("audio", audioBlob, `meeting_${meetingName}.webm`);
    formData.append("name", meetingName);
    formData.append("transcript", JSON.stringify(transcript));

    console.log("[Uploader] 📤 Uploading to backend:", BACKEND_URL + "/upload");
    console.log("[Uploader] FormData contents:");
    console.log(
      "  - audio file:",
      `meeting_${meetingName}.webm`,
      audioBlob.size,
      "bytes"
    );
    console.log("  - name:", meetingName);
    console.log("  - transcript entries:", transcript.length);

    // 3. Upload (with fallback)
    console.log("[Uploader] Initiating fetch request...");
    let response;
    let uploadUrl = `${BACKEND_URL}/upload`;

    try {
      response = await fetch(uploadUrl, {
        method: "POST",
        body: formData,
        headers: {
          "x-api-key": "my-secret-extension-key",
        },
      });
      console.log(
        "[Uploader] Response received - Status:",
        response.status,
        response.statusText
      );
    } catch (primaryError) {
      console.warn(
        "[Uploader] Primary URL failed, trying fallback:",
        primaryError.message
      );
      uploadUrl = `${FALLBACK_URL}/upload`;
      response = await fetch(uploadUrl, {
        method: "POST",
        body: formData,
        headers: {
          "x-api-key": "my-secret-extension-key",
        },
      });
      console.log(
        "[Uploader] Fallback response received - Status:",
        response.status,
        response.statusText
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Uploader] ❌ Upload failed:", response.status, errorText);
      throw new Error(`Upload failed: ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();
    console.log("[Uploader] ✅ Upload success:", result);

    // 4. Cleanup - use tempMeetingId
    updateMeetingStatus(tempMeetingId, "uploaded");
    await clearMeetingData(tempMeetingId);
    console.log("[Uploader] Cleanup completed for:", tempMeetingId);

    return result;
  } catch (error) {
    console.error("[Uploader] ❌ Upload error:", error);
    console.error("[Uploader] Error name:", error.name);
    console.error("[Uploader] Error message:", error.message);
    console.error("[Uploader] Error stack:", error.stack);

    // Check for network errors
    if (error instanceof TypeError && error.message.includes("fetch")) {
      console.error("[Uploader] ⚠️ NETWORK ERROR: Cannot reach backend server");
      console.error(
        "[Uploader] Please ensure backend is running at:",
        BACKEND_URL
      );
    }

    updateMeetingStatus(tempMeetingId, "pending_upload");
    return null;
  }
}
