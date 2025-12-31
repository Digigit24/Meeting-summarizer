// Background Service Worker
import { uploadMeetingData } from "../lib/uploader.js";

const OFFSCREEN_DOCUMENT_PATH = "/offscreen.html";
let sessionTranscript = [];

async function hasOffscreenDocument() {
  const matchedClients = await clients.matchAll();
  for (const client of matchedClients) {
    if (client.url.endsWith(OFFSCREEN_DOCUMENT_PATH)) {
      return true;
    }
  }
  return false;
}

async function closeOffscreenDocument() {
  try {
    const exists = await hasOffscreenDocument();
    if (exists) {
      console.log("[Background] Closing existing offscreen document");
      await chrome.offscreen.closeDocument();
      console.log("[Background] Offscreen document closed");
    }
  } catch (err) {
    console.warn("[Background] Error closing offscreen document:", err);
  }
}

async function setupOffscreenDocument(path) {
  // Always close existing offscreen document first to ensure clean state
  await closeOffscreenDocument();

  // Small delay to ensure cleanup completes
  await new Promise((resolve) => setTimeout(resolve, 100));

  if (creating) {
    await creating;
  } else {
    console.log("[Background] Creating new offscreen document");
    creating = chrome.offscreen.createDocument({
      url: path,
      reasons: ["AUDIO_PLAYBACK", "USER_MEDIA"],
      justification: "Recording meeting audio in the background",
    });
    await creating;
    creating = null;
    console.log("[Background] Offscreen document created");
  }
}

let creating;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log("[Background] Received message:", msg.type, msg);

  // Handle Recording Start
  if (msg.type === "START_RECORDING") {
    console.log("[Background] Starting recording flow for:", msg.meetingName);
    const handleStart = async () => {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab) {
        console.error("[Background] No active tab found.");
        return { success: false, error: "No active tab" };
      }

      // Validate tab URL - must be on a supported meeting platform
      const tabUrl = tab.url || "";
      console.log("[Background] Current tab URL:", tabUrl);

      const isSupportedSite =
        tabUrl.includes("meet.google.com") ||
        tabUrl.includes("zoom.us") ||
        tabUrl.includes("teams.microsoft.com") ||
        tabUrl.includes("localhost") ||
        tabUrl.includes("127.0.0.1");

      if (!isSupportedSite) {
        console.error(
          "[Background] ❌ ERROR: Not on a supported meeting platform!"
        );
        console.error("[Background] Current URL:", tabUrl);
        console.error(
          "[Background] Please navigate to Google Meet, Zoom, or Teams"
        );
        return {
          success: false,
          error:
            "Please open a Google Meet, Zoom, or Microsoft Teams meeting first!",
        };
      }

      // Check for Chrome internal pages
      if (
        tabUrl.startsWith("chrome://") ||
        tabUrl.startsWith("chrome-extension://")
      ) {
        console.error(
          "[Background] ❌ ERROR: Cannot capture Chrome internal pages!"
        );
        return {
          success: false,
          error:
            "Cannot record from Chrome internal pages. Please go to a meeting.",
        };
      }

      // Check if tab is authorized (user clicked extension icon)
      const storageKey = `tabStreamId_${tab.id}`;
      const authData = await chrome.storage.local.get(storageKey);
      let streamId = authData[storageKey];

      if (!streamId) {
        console.error(
          "[Background] ❌ Tab not authorized. User must click extension icon first!"
        );
        return {
          success: false,
          error:
            "Please click the MeetSync extension icon (puzzle piece icon in toolbar) to enable recording!",
        };
      }

      console.log("[Background] ✅ Using pre-authorized streamId:", streamId);

      await setupOffscreenDocument(OFFSCREEN_DOCUMENT_PATH);

      // Await offscreen start to ensure it actually starts
      console.log(
        "[Background] Sending message to offscreen to start recording..."
      );
      const offscreenResponse = await chrome.runtime.sendMessage({
        target: "offscreen",
        type: "START_RECORDING",
        streamId: streamId,
        meetingId: msg.meetingName,
      });

      if (!offscreenResponse || !offscreenResponse.success) {
        throw new Error(
          offscreenResponse?.error ||
            "Failed to start recording in offscreen document."
        );
      }

      // Start Scraper (already injected via manifest.json)
      console.log("[Background] Starting scraper on tab:", tab.id);

      try {
        chrome.tabs.sendMessage(tab.id, { type: "START_SCRAPER" });
        console.log("[Background] START_SCRAPER message sent successfully");
      } catch (e) {
        console.warn("[Background] Could not send START_SCRAPER message:", e);
      }

      sessionTranscript = [];
      return { success: true };
    };
    handleStart()
      .then(sendResponse)
      .catch((error) => {
        console.error("[Background] ❌ Recording start failed:", error);
        sendResponse({
          success: false,
          error:
            error.message || "Failed to start recording. Please try again.",
        });
      });
    return true;
  }

  // Handle Recording Discard
  if (msg.type === "DISCARD_RECORDING") {
    console.log("[Background] Discarding recording");
    chrome.runtime.sendMessage({ target: "offscreen", type: "STOP_RECORDING" });
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "STOP_SCRAPER" });
      }
    });
    sessionTranscript = [];
    console.log("[Background] Recording discarded, no upload");
    return;
  }

  // Handle Recording Stop
  if (msg.type === "STOP_RECORDING") {
    console.log("=== [Background] STOP_RECORDING received ===");
    console.log("[Background] Meeting name:", msg.meetingId);
    console.log("[Background] Temp ID:", msg.tempMeetingId);
    console.log(
      "[Background] Transcript entries collected:",
      sessionTranscript.length
    );

    // Stop recording in offscreen document
    chrome.runtime.sendMessage({ target: "offscreen", type: "STOP_RECORDING" });

    // Close offscreen document after a delay to ensure recording stops
    setTimeout(() => {
      closeOffscreenDocument().catch((err) =>
        console.warn("[Background] Failed to close offscreen on stop:", err)
      );
    }, 500);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        console.log("[Background] Stopping scraper on tab:", tabs[0].id);
        chrome.tabs.sendMessage(tabs[0].id, { type: "STOP_SCRAPER" });
      }
    });

    // Save transcript metadata
    const finalData = {
      id: msg.meetingId || Date.now().toString(),
      transcript: sessionTranscript,
      timestamp: Date.now(),
    };
    chrome.storage.local.set({ [`meta_${finalData.id}`]: finalData });
    console.log(
      "[Background] Saved transcript meta. Items:",
      sessionTranscript.length
    );

    // Trigger Upload (Async) - use tempMeetingId for audio lookup, meetingId for final name
    const tempId = msg.tempMeetingId || msg.meetingId;
    const finalName = msg.meetingId;
    console.log("[Background] 📤 Triggering uploadMeetingData...");
    console.log("[Background] Audio lookup ID:", tempId);
    console.log("[Background] Final meeting name:", finalName);
    console.log(
      "[Background] Note: Using",
      tempId === msg.tempMeetingId ? "tempMeetingId" : "meetingId as fallback",
      "for audio lookup"
    );

    uploadMeetingData(tempId, finalName).then((res) => {
      console.log("[Background] 📊 Upload result:", res);
      if (res) {
        chrome.notifications.create({
          type: "basic",
          title: "MeetSync Uploaded",
          message: "Meeting uploaded and processing started!",
        });
      } else {
        console.error("[Background] Upload returned false/null.");
        chrome.notifications.create({
          type: "basic",
          title: "MeetSync Upload Failed",
          message: "Will retry later. check pending uploads.",
        });
      }
    });

    sendResponse({ success: true });
  }

  // Handle Transcript Updates
  if (msg.type === "TRANSCRIPT_UPDATE") {
    // console.log("[Background] Transcript update:", msg.data.text.substring(0, 20) + "...");
    sessionTranscript.push(msg.data);
  }
});
// Handle extension icon click - this provides the user gesture needed for tabCapture
chrome.action.onClicked.addListener(async (tab) => {
  console.log("[Background] Extension icon clicked on tab:", tab.id);

  // Check if on a supported meeting platform
  const tabUrl = tab.url || "";
  const isSupportedSite =
    tabUrl.includes("meet.google.com") ||
    tabUrl.includes("zoom.us") ||
    tabUrl.includes("teams.microsoft.com");

  if (!isSupportedSite) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon48.png",
      title: "MeetSync",
      message: "Please open a Google Meet, Zoom, or Teams meeting first!",
    });
    return;
  }

  // Pre-authorize tabCapture for this tab by calling getMediaStreamId
  // Omit consumerTabId to make streamId valid for offscreen documents
  chrome.tabCapture.getMediaStreamId((streamId) => {
    if (chrome.runtime.lastError) {
      console.error(
        "[Background] Failed to authorize tab:",
        chrome.runtime.lastError.message
      );
      chrome.notifications.create({
        type: "basic",
        title: "MeetSync Error",
        message: "Failed to enable recording. Please try again.",
      });
      return;
    }

    console.log("[Background] ✅ Tab capture authorized! Stream ID:", streamId);
    chrome.notifications.create({
      type: "basic",
      title: "MeetSync Ready",
      message: "Recording enabled! Click the floating widget to start recording.",
    });

    // Store the streamId for this tab
    chrome.storage.local.set({
      [`tabStreamId_${tab.id}`]: streamId,
      [`tabAuthorized_${tab.id}`]: true,
    });
  });
});

// Open permissions page on install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({ url: "permissions.html" });
  }
});
