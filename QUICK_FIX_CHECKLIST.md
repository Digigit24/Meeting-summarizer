# 🔧 QUICK FIX CHECKLIST - MeetSync AI

## Issue: Recording not starting, uploads not working, admin panel broken

### ✅ Step 1: Reload Chrome Extension

**The extension needs to be reloaded to pick up latest changes:**

1. Open Chrome: `chrome://extensions/`
2. Find "MeetSync AI Extension"
3. Click the **RELOAD** button (circular arrow icon)
4. Go to Google Meet
5. Hard refresh the page: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)

### ✅ Step 2: Verify Backend is Running

**Backend Status:** ✅ RUNNING (from your logs)
- Server: `http://localhost:3001`
- API: `http://localhost:3001/api`
- Admin: `http://localhost:3001/admin/admin.html`

### ✅ Step 3: Test Recording Flow

1. Go to: `https://meet.google.com/new`
2. Join a meeting
3. Look for the **purple floating widget** (bottom-right corner)
4. Click the **●** button to start recording
5. Click **■** button to stop
6. Enter meeting name
7. Click "Save & Upload"

### ✅ Step 4: Check Admin Panel

1. Open: `http://localhost:3001/admin/admin.html`
2. Hard refresh: `Ctrl+Shift+R`
3. You should see:
   - Dark purple gradient theme
   - "Intelligence Center" header
   - "Intelligence Feed" section
   - Any recorded meetings

### ✅ Step 5: Check Chrome Console for Errors

**If recording still doesn't work:**

1. Open Chrome DevTools: `F12`
2. Go to **Console** tab
3. Look for red errors
4. Check for messages starting with `[FloatingWidget]` or `[Background]`

### ✅ Step 6: Check Extension Logs

1. Go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Under "MeetSync AI Extension", click "**service worker**" (blue link)
4. Look for error messages in the console

---

## 🐛 Common Issues & Fixes

### Issue: "Widget not appearing"
**Fix:**
- Reload extension at `chrome://extensions/`
- Hard refresh the Google Meet page

### Issue: "START_RECORDING not sending"
**Fix:**
- Check Chrome extension service worker logs
- Verify `chrome.runtime.sendMessage` permissions
- Ensure you're on a supported site (Google Meet/Zoom/Teams)

### Issue: "Upload failing"
**Fix:**
- Check backend is running: `http://localhost:3001`
- Verify API key matches in extension and backend `.env`
- Check Network tab in DevTools for failed requests

### Issue: "Admin panel blank/broken"
**Fix:**
- Hard refresh: `Ctrl+Shift+R`
- Check browser console for JavaScript errors
- Verify backend API is responding: `curl http://localhost:3001/api/meetings`

---

## 📝 Latest Changes Committed

✅ Enhanced Notion formatting with table support
✅ Fixed Groq client initialization for ES modules
✅ 3 distinct sections (Captions, Summary, Transcription)
✅ Topic extraction from summaries
✅ Upload flow: local → S3 → delete local file

---

## 🚨 If Nothing Works

Run this diagnostic:

```bash
# Check if backend is responding
curl http://localhost:3001/api/meetings -H "x-api-key: my-secret-extension-key"

# Check Chrome extension folder structure
ls -la public/
ls -la src/content/
ls -la src/background/

# Check for JavaScript errors in admin panel
curl -s http://localhost:3001/admin/admin.html | grep -i error
```

---

**Expected behavior after fixes:**
1. ✅ Widget appears on all pages
2. ✅ Click ● starts recording (turns red ■)
3. ✅ Click ■ shows name modal
4. ✅ After saving, uploads to backend
5. ✅ Admin panel shows meeting with Notion formatting
6. ✅ Audio plays from S3 URL
