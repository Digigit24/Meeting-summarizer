/**
 * Platform Detection Logic
 * Returns configuration objects for specific meeting platforms.
 */
export function getPlatformConfig() {
  const hostname = window.location.hostname;

  // Google Meet
  if (hostname.includes("meet.google.com")) {
    return {
      platform: "Google Meet",
      // Primary selectors
      captionContainer: "div[jsname='tS799b']", // Container for caption area
      // Specific selectors as requested
      // Note: Google Meet classes are dynamic/obfuscated, but we stick to user request + knowns
      speakerSelector: ".bhS89c",
      textSelector: ".V67SHe",

      // Fallbacks (Common obfuscated classes seen in wild)
      fallbacks: {
        speaker: [".zs7s8d", "[jscontroller='D1tHje']"],
        text: [".iTTPOb", ".CNusmb"],
      },

      // Optional: Auto-enable captions selector (Button with 'cc' in aria-label or specific icon)
      autoCaptionButton: "button[aria-label*='captions']",
    };
  }

  // Zoom Web Client
  if (hostname.includes("zoom.us")) {
    return {
      platform: "Zoom Web",
      captionContainer: ".caption-window",
      speakerSelector: ".speaker-name", // Hypothesis
      textSelector: ".caption-text",
      fallbacks: {
        text: [".caption-content"],
      },
    };
  }

  // Microsoft Teams
  if (hostname.includes("teams.microsoft.com")) {
    return {
      platform: "Microsoft Teams",
      // Teams structure varies wildly between V1 and V2
      captionContainer: ".ui-chat__item", // This is usually chat, not live captions
      // Live captions in Teams are often in a separate overlay with non-standard classes
      speakerSelector: ".ui-chat__message__author",
      textSelector: ".ui-chat__message__content",
    };
  }

  return null;
}
