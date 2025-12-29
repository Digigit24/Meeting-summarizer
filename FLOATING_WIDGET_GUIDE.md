# 🎯 Floating Widget Extension - Usage Guide

## What's New

The extension now features a **persistent floating widget** that's always visible on every webpage. No more clicking the extension icon - just one click to start/stop recording!

---

## 🌟 Features

### 1. **Always Visible**
- Widget appears on **ALL webpages** automatically
- Small, minimalist design that doesn't interfere with your browsing
- Default position: **Bottom-right corner**
- Remembers your preferred position across sessions

### 2. **Drag & Drop**
- **Click and drag** anywhere on the widget to move it
- Position is **automatically saved**
- Reloads in the same position when you revisit the page

### 3. **One-Click Recording**
- **● Button** (idle): Click to start recording
- **■ Button** (recording): Click to stop
- **Live timer** shows recording duration
- **Smooth animations** indicate recording status

### 4. **Smart Naming**
- After stopping, a modal appears asking for meeting name
- **Optional**: Leave blank for default name
- **Default format**: `Meeting - Dec 29, 2025 2:30 PM`
- **Cancel**: Resume recording without uploading
- **Save & Upload**: Finalizes recording with your chosen name

### 5. **Long Meeting Support**
- Handles **hours-long meetings** (even 2+ hours!)
- Automatically chunks large files (>20MB)
- Processes in **15-minute segments**
- Combines all chunks seamlessly
- **No data loss** - all chunks are tracked and verified

---

## 📖 How to Use

### Step 1: Install/Update Extension

1. **Pull latest changes:**
   ```bash
   git pull origin claude/fix-recording-transcription-z91dz
   ```

2. **Build the extension:**
   ```bash
   npm install
   npm run build
   ```

3. **Load in Chrome:**
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` folder

### Step 2: Using the Widget

1. **Open any webpage** (Google Meet, Zoom, Teams, or any site)
2. **Look for the floating widget** in the bottom-right corner
3. **Click the ● button** to start recording
4. **Widget shows:**
   - Status changes to "Recording"
   - Button becomes red with ■ icon
   - Timer starts counting (00:00, 00:01, etc.)
5. **Click ■ button** when done
6. **Name your meeting:**
   - Modal appears with input field
   - Enter custom name OR leave blank for default
   - Default: `Meeting - [Current Date Time]`
7. **Click "Save & Upload"**
   - Recording stops
   - File uploads to backend
   - Processing begins automatically

### Step 3: View Results

1. **Open Admin Dashboard:**
   ```
   http://localhost:3001/admin/admin.html
   ```

2. **See your meeting:**
   - Client captions (from Google Meet)
   - ElevenLabs transcription
   - AI-powered summary with speaker names
   - Action items

---

## 🎨 Widget Appearance

### Idle State
```
┌─────────────────┐
│  ●  Ready      │  ← Purple gradient background
│                │  ← White record button
└─────────────────┘
```

### Recording State
```
┌─────────────────┐
│  ■  Recording  │  ← Pulsing animation
│     00:42      │  ← Red stop button
└─────────────────┘  ← Live timer
```

### Name Modal
```
┌──────────────────────────────┐
│  Name Your Meeting           │
│  ┌──────────────────────────┐│
│  │ Enter meeting name...    ││
│  └──────────────────────────┘│
│  Leave blank for default     │
│  [Cancel] [Save & Upload]    │
└──────────────────────────────┘
```

---

## 🔧 Customization

### Change Widget Position
- **Click and drag** to your preferred location
- Position is **saved automatically**
- Try these positions:
  - Bottom-right (default)
  - Top-right (common for productivity tools)
  - Bottom-left
  - Top-left (if you prefer)

### Change Widget Size
Edit `src/content/floatingWidget.js` line ~16:
```javascript
min-width: 140px;  // Change to 160px for larger
padding: 12px 16px;  // Change to 16px 20px
```

### Change Colors
Edit `src/content/floatingWidget.js` styles:
```javascript
// Purple gradient (current)
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);

// Blue gradient
background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);

// Green gradient
background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
```

---

## 🚀 Advanced: Long Meeting Processing

### How Chunking Works

1. **File Size Check:**
   - If audio > 20MB → Chunk it
   - If audio ≤ 20MB → Process as-is

2. **Chunking Process:**
   ```
   [2-hour meeting] → [15 min] [15 min] [15 min] ... [15 min]
                       ↓        ↓        ↓            ↓
                     ElevenLabs ElevenLabs ElevenLabs ElevenLabs
                       ↓        ↓        ↓            ↓
                     Combine all chunks → Single transcript
   ```

3. **Backend Logs:**
   ```
   [ElevenLabs] ⚠️  File size (25.4 MB) exceeds limit (20 MB)
   [ElevenLabs] 🔄 Will process in 15-minute chunks
   [ElevenLabs] Audio duration: 125.3 minutes
   [ElevenLabs] 📊 Processing 9 chunks...
   [ElevenLabs] ▶️  Chunk 1/9...
   [ElevenLabs] ✅ Chunk 1/9 completed
   [ElevenLabs] ▶️  Chunk 2/9...
   [ElevenLabs] ✅ Chunk 2/9 completed
   ...
   [ElevenLabs] ✅ All 9 chunks processed successfully
   [ElevenLabs] 🧹 Cleaning up 9 chunk files...
   ```

4. **Verification:**
   - Tracks total chunks created
   - Verifies all chunks processed
   - Error if any chunk fails
   - Automatic cleanup

### Requirements for Chunking

**ffmpeg must be installed:**

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install ffmpeg
```

**macOS:**
```bash
brew install ffmpeg
```

**Windows:**
- Download from https://ffmpeg.org/download.html
- Add to PATH

**Verify installation:**
```bash
ffmpeg -version
ffprobe -version
```

---

## 🐛 Troubleshooting

### Widget Not Appearing

1. **Check extension is loaded:**
   - Go to `chrome://extensions/`
   - Ensure "MeetSync AI Extension" is enabled

2. **Reload the page:**
   - Press `Ctrl+Shift+R` (hard reload)
   - Widget should appear in bottom-right

3. **Check browser console:**
   - Press `F12` → Console tab
   - Look for errors with "MeetSync"

### Widget Not Draggable

1. **Don't click the button** when dragging
2. **Click and hold** on the gradient background
3. **Drag** to new position
4. **Release** - position is saved

### Recording Not Starting

1. **Check background script:**
   - Go to `chrome://extensions/`
   - Click "Service Worker" under extension
   - Look for error messages

2. **Check permissions:**
   - Extension needs tabCapture permission
   - Should be granted on install

3. **Try on Google Meet:**
   - The extension works best on meeting platforms
   - Test with https://meet.google.com

### Long Meetings Failing

1. **Check ffmpeg installed:**
   ```bash
   ffmpeg -version
   ```

2. **Check backend logs:**
   ```bash
   cd backend
   npm start
   ```
   Look for chunking progress

3. **Check disk space:**
   - Chunking creates temporary files
   - Ensure enough space (2x file size)

### Name Modal Not Showing

1. **Check for JavaScript errors:**
   - Open console (F12)
   - Look for errors after clicking stop

2. **Try clicking outside widget:**
   - Modal appears as overlay
   - Should be centered on screen

3. **Clear storage and retry:**
   ```javascript
   chrome.storage.local.clear()
   ```

---

## 📊 Expected Workflow

### Short Meeting (< 20MB, ~30 min)

```
1. User opens Google Meet
2. Widget appears in corner
3. User clicks ● to start
4. Meeting proceeds (captions captured)
5. User clicks ■ to stop
6. Modal appears
7. User names meeting "Q4 Review"
8. Clicks "Save & Upload"
9. Backend processes:
   - Single file to ElevenLabs
   - Groq summarization
   - Saves to database
10. Admin panel shows results
```

### Long Meeting (> 20MB, 2+ hours)

```
1. User opens Google Meet
2. Widget appears in corner
3. User clicks ● to start
4. Long meeting proceeds
5. User clicks ■ to stop
6. Modal appears
7. User leaves blank (default name)
8. Clicks "Save & Upload"
9. Backend processes:
   ⚠️  Large file detected (45 MB)
   🔄 Splitting into chunks
   📊 Created 6 chunks (15 min each)
   ▶️  Processing chunk 1/6...
   ✅ Chunk 1/6 completed
   ▶️  Processing chunk 2/6...
   ✅ Chunk 2/6 completed
   ... (continues for all chunks)
   ✅ All 6 chunks processed
   🔄 Combining chunks
   ✅ Combined transcript ready
   🔄 Groq summarization
   ✅ Summary complete
   🧹 Cleaning up chunks
10. Admin panel shows results
```

---

## 🎯 Best Practices

### For Best Results:

1. **Enable Captions:** Always enable captions in Google Meet for speaker names
2. **Good Audio:** Use a good microphone for better transcription
3. **Stable Internet:** Ensure stable connection during upload
4. **Name Meetings:** Give descriptive names for easy identification
5. **Check Admin Panel:** Verify recordings uploaded successfully

### For Long Meetings:

1. **Keep Backend Running:** Don't stop backend during processing
2. **Monitor Logs:** Watch backend terminal for progress
3. **Wait for Completion:** Chunking takes time (1-2 min per chunk)
4. **Check Disk Space:** Ensure enough space for temporary chunks

---

## 🔍 Technical Details

### Widget Implementation
- **File:** `src/content/floatingWidget.js`
- **Injection:** Content script on `<all_urls>`
- **Guard:** Prevents multiple injections
- **Storage:** Chrome local storage for position

### Chunking Implementation
- **File:** `backend/services/elevenLabsService.js`
- **Limit:** 20MB per file, 15-minute chunks
- **Tools:** ffmpeg for splitting, ffprobe for duration
- **Cleanup:** Automatic on success and error

### Data Flow
```
Extension Widget
    ↓ (recording)
Chrome Storage
    ↓ (stop + upload)
Background Script
    ↓ (POST /api/upload)
Backend Server
    ↓ (large file detected)
Audio Chunking (ffmpeg)
    ↓ (process each chunk)
ElevenLabs API (x N chunks)
    ↓ (combine results)
Single Transcript
    ↓ (summarize)
Groq API
    ↓ (save)
PostgreSQL Database
    ↓ (display)
Admin Dashboard
```

---

## ✅ Success Checklist

After update, verify:

- [ ] Widget appears on all pages
- [ ] Widget is draggable
- [ ] Position is saved
- [ ] Start button works
- [ ] Timer shows during recording
- [ ] Stop button works
- [ ] Name modal appears
- [ ] Default name shows current date/time
- [ ] Upload succeeds
- [ ] Admin panel shows recording
- [ ] Long meetings are chunked (if > 20MB)
- [ ] All chunks processed successfully
- [ ] Speaker names appear (from captions)
- [ ] Summary is comprehensive
- [ ] No errors in console or backend

---

**All changes committed and pushed to `claude/fix-recording-transcription-z91dz`!** 🚀

Now you have:
- ✅ Always-on floating widget on every page
- ✅ Drag-and-drop positioning
- ✅ One-click start/stop
- ✅ Smart name input with defaults
- ✅ Support for hours-long meetings
- ✅ Automatic chunking (15-min segments)
- ✅ No data loss (all chunks verified)
- ✅ Easy to use, effective, perfect!
