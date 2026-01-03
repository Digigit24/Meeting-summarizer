import { saveChunk } from "../lib/db";

let recorder;
let recording = false;
let currentMeetingId = null;
let audioContext;
let mixedStream;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== "offscreen") return;

  if (message.type === "START_RECORDING") {
    startRecording(message.streamId, message.meetingId)
      .then(() => sendResponse({ success: true }))
      .catch((e) => {
        console.error("Failed to start in offscreen:", e);
        sendResponse({ success: false, error: e.toString() });
      });
    return true; // Keep message port open
  } else if (message.type === "STOP_RECORDING") {
    stopRecording();
    sendResponse({ success: true });
    return true;
  }
});

async function startRecording(streamId, meetingId) {
  if (recording) {
    console.log("[Offscreen] Already recording, ignoring start request");
    return;
  }

  console.log("=== [Offscreen] Starting Recording ===");
  console.log("[Offscreen] Stream ID:", streamId);
  console.log("[Offscreen] Meeting ID:", meetingId);

  currentMeetingId = meetingId;
  recording = true;

  // 1. Get Tab Audio (System) using the streamId passed from background
  const tabStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId,
      },
    },
    video: false,
  });

  // 2. Get Microphone Audio
  let micStream;
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log("Microphone access granted.");
  } catch (e) {
    console.error(
      "Microphone access FAILED. Error Name:",
      e.name,
      "Message:",
      e.message
    );
    // Continue with just tab audio if mic fails
  }

  // 3. Mix Streams using Web Audio API
  audioContext = new AudioContext();
  const destination = audioContext.createMediaStreamDestination();

  // Connect Tab Audio
  if (tabStream.getAudioTracks().length > 0) {
    const tabSource = audioContext.createMediaStreamSource(tabStream);
    tabSource.connect(destination);
    // CRITICAL FIX: Connect to speakers so user can hear the meeting!
    tabSource.connect(audioContext.destination);
  }

  // Connect Mic Audio
  if (micStream && micStream.getAudioTracks().length > 0) {
    const micSource = audioContext.createMediaStreamSource(micStream);
    micSource.connect(destination);
  }

  mixedStream = destination.stream;

  // 4. Initialize MediaRecorder
  // Use high quality opus codec if supported
  const options = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? { mimeType: "audio/webm;codecs=opus" }
    : { mimeType: "audio/webm" };

  recorder = new MediaRecorder(mixedStream, options);

  // 5. Heartbeat / Chunk Saving
  // "Send the recording chunk to IndexedDB every 5 seconds"
  recorder.ondataavailable = async (event) => {
    if (event.data.size > 0) {
      console.log(
        `[Offscreen] 💾 Saving audio chunk - Size: ${event.data.size} bytes, Meeting ID: ${currentMeetingId}`
      );
      await saveChunk(currentMeetingId, event.data);
      console.log(`[Offscreen] ✅ Chunk saved successfully`);
    } else {
      console.warn(`[Offscreen] ⚠️ Received empty chunk (0 bytes)`);
    }
  };

  // Heartbeat to keep service worker alive
  setInterval(() => {
    chrome.runtime.sendMessage({ type: "OFFSCREEN_HEARTBEAT" });
  }, 10000);

  recorder.start(5000); // 5000ms timeslice
  console.log("Recording started with 5s heartbeat");
}

function stopRecording() {
  if (!recording || !recorder) {
    console.log("[Offscreen] Stop called but not recording");
    return;
  }

  console.log("=== [Offscreen] Stopping Recording ===");
  console.log("[Offscreen] Meeting ID:", currentMeetingId);

  recorder.stop();
  recording = false;

  if (mixedStream) {
    mixedStream.getTracks().forEach((t) => t.stop());
  }
  if (audioContext) {
    audioContext.close();
  }
  console.log("[Offscreen] ✅ Recording stopped successfully");
}
