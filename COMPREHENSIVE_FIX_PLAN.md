# Comprehensive Fix Plan

## Issues to Fix:

### 1. Extension Issues
- [ ] Audio not being captured (can't hear speakers)
- [ ] Captions not being captured from Google Meet
- [ ] Messy default meeting name (Meeting_2025-12-29T11:29:04.088Z)
- [ ] Need AI-generated meeting title based on summary

### 2. Admin Panel Issues
- [ ] Summary showing twice
- [ ] Not showing captured captions from Google Meet
- [ ] Only showing 2 sections (should show 3: Captions, ElevenLabs, Summary)
- [ ] UI confusing - hard to distinguish meetings
- [ ] Font size too small
- [ ] Summary not professional/interesting enough

## Root Causes Found:

### Audio Capture Issue:
- Scraper is auto-injected via manifest.json
- Background.js tries to re-inject, causing conflict
- Need to ensure scraper starts properly

### Caption Capture Issue:
- Scraper guard prevents re-initialization
- Message passing might be blocked
- Need to fix initialization flow

### Meeting Name Issue:
- Popup.jsx uses `Meeting_${new Date().toISOString()}`
- Should use better default format or AI-generated title

### Admin Panel Issues:
- admin.html only shows summary and ElevenLabs transcript
- Missing client_transcript (Google Meet captions) display
- Summary rendering twice (need to check)
- Font sizes need to be larger

## Solutions:

### 1. Fix Extension (floatingWidget.js + background.js):
```javascript
// Use better default name format
function getDefaultMeetingName() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = String(now.getFullYear()).slice(-2);
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `Meeting ${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
}
```

### 2. Fix Scraper Initialization:
- Scraper is already injected via manifest
- Just need to send START_SCRAPER message
- Remove re-injection from background.js

### 3. Add AI-Generated Meeting Title:
- Backend route: POST /api/meetings/:id/generate-title
- Use Groq API to analyze summary
- Generate concise title (e.g., "Meeting with X about Y")
- Update meeting name after summarization complete

### 4. Fix Admin Panel UI:
- Show 3 sections:
  1. Meeting Captions (client_transcript) - expanded by default
  2. AI Summary (Notion format) - expanded by default
  3. ElevenLabs Transcription - collapsed by default
- Increase font sizes:
  - Meeting title: 26px (from 22px)
  - Section titles: 16px (from 14px)
  - Content: 15px (from 14px)
- Better separation between meetings
- Fix summary showing twice issue

### 5. Improve Notion Formatting:
- Better markdown parsing
- Add emoji support properly
- Tables, checkboxes, quotes
- Code blocks with syntax highlighting

## Files to Modify:

1. src/content/floatingWidget.js - Better default name
2. src/background/background.js - Fix scraper init
3. backend/routes/meetingRoutes.js - Add generate-title route
4. backend/services/summarizationService.js - Add title generation
5. backend/public/admin.html - Fix UI, show all 3 sections, larger fonts
