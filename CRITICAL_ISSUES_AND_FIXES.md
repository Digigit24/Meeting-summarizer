# Critical Issues & Fixes Needed

## 🔴 CRITICAL ISSUES

### 1. Extension Audio Not Capturing
**Problem**: Can't hear speakers when recording
**Root Cause**: The scraper is being double-injected
- Manifest.json injects scraper.js automatically on meeting pages
- Background.js tries to inject it again when START_RECORDING
- Guard prevents re-initialization, so `initScraper()` never runs

**Fix Needed**:
```javascript
// In background.js, REMOVE the scraper injection, just send message:
// REMOVE THIS:
chrome.scripting.executeScript({
  target: { tabId: tab.id },
  files: ["src/content/scraper.js"],
})

// KEEP ONLY THIS:
chrome.tabs.sendMessage(tab.id, { type: "START_SCRAPER" });
```

### 2. Captions Not Being Captured
**Problem**: Google Meet captions not showing in database
**Root Cause**: Same as above - scraper not initializing properly
**Fix**: Same as #1

### 3. Messy Meeting Name
**Problem**: Shows `Meeting_2025-12-29T11:29:04.088Z`
**Root Cause**: Popup.jsx line 44 uses ISO format
**Current**: `Meeting_${new Date().toISOString()}`
**Should Be**: `Meeting 29-12-25 11:29:04`

**Fix**:
```javascript
// In floatingWidget.js, update getDefaultMeetingName():
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

## 🟡 HIGH PRIORITY UI ISSUES

### 4. Admin Panel Showing Summary Twice
**Problem**: Summary appears in two places
**Root Cause**: Need to verify - might be rendering issue
**Fix**: Check admin.html rendering logic

### 5. Admin Panel Only Shows 2 Sections (Need 3)
**Problem**: Currently shows:
1. Summary
2. ElevenLabs Transcription

**Should Show**:
1. **Meeting Captions** (client_transcript from Google Meet) - EXPANDED
2. **AI Summary** (Notion format) - EXPANDED
3. **ElevenLabs Transcription** - COLLAPSED

**Fix**: Update admin.html rendering order:
```javascript
// Change order in renderMeetings():
${renderCaptions(meeting)}      // First, expanded by default
${renderSummary(meeting)}        // Second, expanded by default
${renderTranscription(meeting)}  // Third, collapsed by default
```

### 6. Font Sizes Too Small
**Current Sizes**:
- Meeting title: 22px
- Section titles: 14px
- Content: 14px

**Should Be**:
- Meeting title: 28px (+6px)
- Section titles: 16px (+2px)
- Content: 15px (+1px)

**Fix in admin.html CSS**:
```css
.meeting-title {
  font-size: 28px;  /* was 22px */
}

.block-title {
  font-size: 16px;  /* was 14px */
}

.block-content {
  font-size: 15px;  /* was 14px */
}
```

### 7. Better Meeting Separation
**Problem**: Hard to distinguish different recordings
**Fix**: Add more visual separation
```css
.meeting-item {
  padding: 40px 0;  /* was 32px */
  margin-bottom: 20px;
  border-bottom: 2px solid var(--separator);  /* was 1px */
}

.meeting-item::before {
  width: 6px;  /* was 4px */
  height: 70%;  /* was 60% */
}
```

## 🟢 NICE TO HAVE

### 8. AI-Generated Meeting Titles
**Feature**: Instead of "Meeting 29-12-25 11:29:04", generate:
- "Meeting with Product Team about Q4 Roadmap"
- "Standup Discussion on Sprint Planning"

**Implementation**:
1. After summarization completes
2. Call Groq API with summary
3. Generate concise title (max 60 chars)
4. Update meeting name in database

**Backend Route Needed**:
```javascript
// POST /api/meetings/:id/generate-title
router.post("/meetings/:id/generate-title", async (req, res) => {
  const meeting = await prisma.meeting.findUnique({ where: { id: req.params.id } });

  // Use Groq to analyze summary and generate title
  const title = await generateMeetingTitle(meeting.summary);

  // Update meeting name
  await prisma.meeting.update({
    where: { id: req.params.id },
    data: { name: title }
  });

  res.json({ title });
});
```

## 🎨 NOTION FORMATTING IMPROVEMENTS

**Current**: Basic markdown parsing
**Needed**: Full Notion-style formatting

**Better Markdown Parser**:
```javascript
function formatSummary(text) {
  return text
    // Headers with emojis
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')

    // Bold and italic
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')

    // Lists
    .replace(/^- \[ \] (.+)$/gm, '<li class="checkbox"><input type="checkbox" disabled> $1</li>')
    .replace(/^- \[x\] (.+)$/gm, '<li class="checkbox"><input type="checkbox" checked disabled> $1</li>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')

    // Wrap lists
    .replace(/(<li>.*<\/li>\n?)+/gm, (match) => {
      if (match.includes('checkbox')) {
        return `<ul class="checklist">${match}</ul>`;
      }
      return `<ul>${match}</ul>`;
    })

    // Tables (if present)
    .replace(/\|(.+)\|/g, (match) => {
      // Table parsing logic
      return match; // Simplified
    })

    // Code blocks
    .replace(/```(\w+)?\n([\s\S]+?)```/g, '<pre><code class="language-$1">$2</code></pre>')
    .replace(/`(.+?)`/g, '<code>$1</code>')

    // Quotes
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')

    // Line breaks
    .replace(/\n\n/g, '<br><br>');
}
```

**Additional CSS for Notion Style**:
```css
.summary-content blockquote {
  border-left: 4px solid var(--accent-primary);
  padding-left: 16px;
  margin: 16px 0;
  color: var(--text-secondary);
  font-style: italic;
}

.summary-content .checklist {
  list-style: none;
  margin-left: 0;
}

.summary-content .checkbox input {
  margin-right: 8px;
}

.summary-content pre {
  background: var(--bg-secondary);
  padding: 16px;
  border-radius: 8px;
  overflow-x: auto;
}

.summary-content code {
  background: var(--bg-secondary);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'Monaco', 'Courier New', monospace;
  font-size: 13px;
}
```

## 📋 IMPLEMENTATION CHECKLIST

### Phase 1: Critical Fixes (Do First)
- [ ] Fix scraper initialization (remove double injection)
- [ ] Fix meeting name format (DD-MM-YY HH:mm:ss)
- [ ] Fix admin panel to show 3 sections in correct order
- [ ] Fix font sizes (larger for readability)
- [ ] Fix meeting separation (better visual distinction)

### Phase 2: UI Improvements
- [ ] Improve Notion formatting (checkboxes, quotes, code blocks)
- [ ] Ensure captions are displayed first (expanded)
- [ ] Ensure summary is second (expanded)
- [ ] Ensure ElevenLabs transcription is third (collapsed)
- [ ] Remove duplicate summary (if exists)

### Phase 3: AI Enhancements (Optional)
- [ ] Add AI-generated meeting titles route
- [ ] Integrate with Groq API for title generation
- [ ] Auto-update meeting name after summarization
- [ ] Show loading state while generating title

## 🧪 TESTING CHECKLIST

After fixes, verify:
- [ ] Start recording on Google Meet
- [ ] Can hear speakers in meeting (not muted)
- [ ] See captions appear in real-time
- [ ] Stop recording
- [ ] Enter meeting name (or leave blank for default)
- [ ] Default name format: "Meeting 29-12-25 14:30:45"
- [ ] Open admin panel
- [ ] See meeting with 3 sections:
  1. Meeting Captions (expanded, from Google Meet)
  2. AI Summary (expanded, Notion format)
  3. ElevenLabs Transcription (collapsed)
- [ ] Fonts are readable (28px title, 16px sections, 15px content)
- [ ] Meetings clearly separated visually
- [ ] Summary has emojis, tables, checkboxes (Notion style)
- [ ] No duplicate summaries
- [ ] Audio playback works

## 🚀 QUICK FIX PRIORITY

**If limited time, fix in this order**:
1. Scraper initialization (fixes audio + captions)
2. Admin panel 3-section display
3. Font sizes
4. Meeting name format
5. Notion formatting
6. AI-generated titles (nice to have)

---

**Status**: Documented issues and solutions
**Next Step**: Implement fixes in order of priority
**Estimated Time**: 1-2 hours for critical fixes, 2-3 hours for all
