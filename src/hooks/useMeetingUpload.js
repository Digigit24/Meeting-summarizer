import { useState } from "react";
import { apiService } from "../lib/apiService";
import {
  getMeetingAudio,
  getFullTranscript,
  clearMeetingData,
  updateMeetingStatus,
} from "../lib/db";

export function useMeetingUpload() {
  const [uploadProgress, setUploadProgress] = useState(0);
  const [status, setStatus] = useState("idle"); // idle, uploading, processing, success, error
  const [error, setError] = useState(null);

  const startUpload = async (meetingId, meetingName) => {
    setStatus("uploading");
    setUploadProgress(0);
    setError(null);

    try {
      updateMeetingStatus(meetingId, "uploading");

      // 1. Gather Data
      const audioBlob = await getMeetingAudio(meetingId);
      const transcript = await getFullTranscript(meetingId);

      if (audioBlob.size === 0 && transcript.length === 0) {
        throw new Error("No recording data found");
      }

      // 2. Prepare Payload
      const formData = new FormData();
      formData.append("audio", audioBlob, `meeting_${meetingId}.webm`);
      formData.append("name", meetingName);
      formData.append("transcript", JSON.stringify(transcript));
      formData.append("duration", audioBlob.size); // Rough Proxy or calculate duration

      // 3. Upload with Progress
      const result = await apiService.uploadMeeting(formData, (percent) => {
        setUploadProgress(percent);
        if (percent === 100) setStatus("processing");
      });

      // 4. Success Handling
      setStatus("success");
      updateMeetingStatus(meetingId, "uploaded");

      // Cleanup local heavy data
      await clearMeetingData(meetingId);

      return result;
    } catch (err) {
      console.error("Upload Hook Error:", err);
      setError(err.message || "Upload Failed");
      setStatus("error");
      updateMeetingStatus(meetingId, "pending_upload");
      throw err;
    }
  };

  return {
    uploadProgress,
    status,
    error,
    startUpload,
  };
}
