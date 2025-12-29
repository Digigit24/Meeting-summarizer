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

async function setupOffscreenDocument(path) {
  const exists = await hasOffscreenDocument();
  if (exists) return;

  if (creating) {
    await creating;
  } else {
    creating = chrome.offscreen.createDocument({
      url: path,
      reasons: ["AUDIO_PLAYBACK", "USER_MEDIA"],
      justification: "Recording meeting audio in the background",
    });
    await creating;
    creating = null;
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

      await setupOffscreenDocument(OFFSCREEN_DOCUMENT_PATH);

      // Get Stream ID targeting the Active Tab
      const streamId = await new Promise((resolve) => {
        chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }, (id) => {
          resolve(id);
        });
      });
      console.log("[Background] Got streamId:", streamId);

      chrome.runtime.sendMessage({
        target: "offscreen",
        type: "START_RECORDING",
        streamId: streamId,
        meetingId: msg.meetingName,
      });

      // Inject Scraper
      console.log("[Background] Injecting scraper into tab:", tab.id);
      chrome.scripting
        .executeScript({
          target: { tabId: tab.id },
          files: ["src/content/scraper.js"],
        })
        .then(() => {
          console.log("[Background] Scraper injected. Sending START_SCRAPER.");
          chrome.tabs.sendMessage(tab.id, { type: "START_SCRAPER" });
        })
        .catch((e) =>
          console.error("Scraper injection failed or already present", e)
        );

      sessionTranscript = [];
      return { success: true };
    };
    handleStart().then(sendResponse);
    return true;
  }

  // Handle Recording Stop
  if (msg.type === "STOP_RECORDING") {
    console.log("[Background] Stopping recording for:", msg.meetingId);
    chrome.runtime.sendMessage({ target: "offscreen", type: "STOP_RECORDING" });
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

    // Trigger Upload (Async)
    console.log("[Background] Triggering uploadMeetingData...");
    uploadMeetingData(msg.meetingId, msg.meetingId).then((res) => {
      console.log("[Background] Upload result:", res);
      if (res) {
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icons/icon48.png",
          title: "MeetSync Uploaded",
          message: "Meeting uploaded and processing started!",
        });
      } else {
        console.error("[Background] Upload returned false/null.");
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icons/icon48.png",
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
// Open permissions page on install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({ url: "permissions.html" });
  }
});
