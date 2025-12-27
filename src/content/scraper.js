import { getPlatformConfig } from "./platformDetect.js";

// Global Guard to prevent re-declaration errors on re-injection
if (!window.meetSyncScraperInjected) {
  window.meetSyncScraperInjected = true;

  let observer = null;
  let lastProcessedText = "";
  // eslint-disable-next-line no-unused-vars
  let lastProcessedTime = 0;

  function initScraper() {
    const config = getPlatformConfig();
    if (!config) return console.log("MeetSync: Unsupported Platform");

    console.log(`MeetSync: Scraper active for ${config.platform}`);

    // Optional: Auto-enable captions
    if (config.autoCaptionButton) {
      const btn = document.querySelector(config.autoCaptionButton);
      if (btn && btn.getAttribute("aria-pressed") === "false") {
        btn.click();
        console.log("MeetSync: Auto-enabled captions.");
      }
    }

    const body = document.body;

    observer = new MutationObserver((mutations) => {
      let shouldCheck = false;
      mutations.forEach((m) => {
        if (m.type === "childList" || m.type === "characterData")
          shouldCheck = true;
      });

      if (shouldCheck) {
        extractCaptions(config);
      }
    });

    observer.observe(body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  function extractCaptions(config) {
    // 1. Find all caption text candidates
    let textNodes = document.querySelectorAll(config.textSelector);
    if (textNodes.length === 0 && config.fallbacks) {
      for (const sel of config.fallbacks.text) {
        textNodes = document.querySelectorAll(sel);
        if (textNodes.length > 0) break;
      }
    }

    if (textNodes.length === 0) return;

    // 2. Get the most recent one (usually the last in DOM order)
    const latestNode = textNodes[textNodes.length - 1];
    const rawText = latestNode.innerText.trim();

    if (!rawText || rawText.length < 2) return; // Ignore noise
    if (rawText === lastProcessedText) return; // Ignore duplicates

    // 3. Find Speaker
    let speaker = "Unknown";
    const parent = latestNode.parentElement?.parentElement; // Heuristic
    if (parent) {
      let speakerNode = parent.querySelector(config.speakerSelector);
      if (!speakerNode && config.fallbacks) {
        for (const sel of config.fallbacks.speaker) {
          speakerNode = parent.querySelector(sel);
          if (speakerNode) break;
        }
      }
      if (speakerNode) speaker = speakerNode.innerText;
    }

    lastProcessedText = rawText;
    lastProcessedTime = Date.now();

    // 4. Send Message
    chrome.runtime.sendMessage({
      type: "TRANSCRIPT_UPDATE",
      data: {
        speaker,
        text: rawText,
        timestamp: Date.now(),
      },
    });
  }

  // Lifecycle Hooks
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "START_SCRAPER") initScraper();
    if (msg.type === "STOP_SCRAPER") observer?.disconnect();
  });
}
