# Testing Guide - Fixes for Speaker Recognition, Audio Playback, and Gemini Summarization

## 🎯 What Was Fixed

### 1. **Speaker Recognition** ✅
- Fixed "Speaker Unknown" issue
- Now shows "Speaker 0", "Speaker 1", etc.
- Added detailed logging to debug ElevenLabs speaker_id format

### 2. **Audio Playback** ✅
- Added `/api/audio/:meetingId` proxy endpoint
- Bypasses S3 CORS issues
- Works with both S3 and local files

### 3. **Gemini Summarization** ⚠️ (Needs Testing)
- Using correct model: `gemini-1.5-flash`
- Added retry logic with exponential backoff
- Enhanced tokenization logging

---

## 🚀 How to Test

### Step 1: Pull Latest Changes

```bash
cd /path/to/Meeting-summarizer
git pull origin claude/fix-recording-transcription-z91dz
```

### Step 2: Ensure .env File Exists

The `.env` file should be in `backend/` directory with:

```env
DATABASE_URL="your-database-url"
AWS_ACCESS_KEY_ID="your-aws-key"
AWS_SECRET_ACCESS_KEY="your-aws-secret"
AWS_REGION="ap-south-1"
AWS_BUCKET_NAME="your-bucket-name"
GEMINI_API_KEY="your-gemini-key"
ELEVENLABS_API_KEY="your-elevenlabs-key"
API_SECRET_KEY="my-secret-extension-key"
PORT=3001
```

### Step 3: Restart Backend Server

```bash
cd backend
npm install  # Install any new packages
npm start    # or node server.js
```

You should see:

```
========================================
✅ MeetSync Backend Running on http://localhost:3001
========================================
📊 Admin Dashboard: http://localhost:3001/admin/admin.html
🔧 API Endpoint: http://localhost:3001/api
========================================
```

### Step 4: Record a New Meeting

1. Open your Chrome extension
2. Start a Google Meet/Zoom call
3. Click "Start Recording"
4. **Talk during the meeting** (this is important!)
5. Click "Stop Recording"
6. Click "Upload"

### Step 5: Check Backend Logs

Watch for these logs:

#### **ElevenLabs Speaker Logs:**
```
[ElevenLabs] Processing 51 diarized words into segments
[ElevenLabs] Word 0: "Hello", speaker_id: 0 (type: number)
[ElevenLabs] Word 1: "Hi", speaker_id: 1 (type: number)
[ElevenLabs] Word 2: "this", speaker_id: 1 (type: number)
[ElevenLabs] Created 8 speaker segments from words
```

#### **Tokenization Logs:**
```
[Tokenization] Starting tokenization with max 4000 tokens per chunk
[Tokenization] Processing 15 lines
[Tokenization] Created chunk 1: 342 tokens, 15 lines
[Tokenization] Total chunks created: 1
```

#### **Summarization Logs:**
```
[Summarization] Processing chunk 1/1...
[Summarization] Summarization completed successfully
```

### Step 6: Check Admin Panel

1. Open `http://localhost:3001/admin/admin.html`
2. Find your latest meeting
3. Verify:

   ✅ **Speaker Labels Show Correctly:**
   ```
   Speaker 0: Hello. Hi, this is Prateek...
   Speaker 1: Hi, this is Divya...
   ```

   ✅ **Audio Player Works:**
   - Click play button
   - Should hear the recording
   - Progress bar should move

   ✅ **Summary Appears:**
   - Should see actual summary, not "[Unable to summarize...]"

---

## 🐛 Troubleshooting

### Issue 1: Still Seeing "Speaker Unknown"

**Check Backend Logs:**
Look for these lines:
```
[ElevenLabs] Word 0: "Hello", speaker_id: undefined (type: undefined)
```

If `speaker_id` is `undefined`, it means:
- ElevenLabs API didn't return speaker diarization
- Your audio file might be too short
- Diarization might have failed

**Solution:**
- Record a longer meeting (at least 30 seconds)
- Ensure multiple people are talking
- Check ElevenLabs API quota

### Issue 2: Audio Still Not Playing

**Check the Audio URL:**
In admin panel, right-click the audio player → Inspect → Console

Look for errors like:
- `Failed to load resource: net::ERR_BLOCKED_BY_CLIENT` (Ad blocker issue)
- `CORS error` (Should be fixed with proxy)
- `404 Not Found` (File doesn't exist)

**Solution:**

1. **Test the proxy endpoint directly:**
   ```
   http://localhost:3001/api/audio/YOUR-MEETING-ID
   ```
   Replace `YOUR-MEETING-ID` with the actual meeting ID from admin panel

2. **Check S3 permissions:**
   - S3 bucket might not allow your AWS credentials
   - Try uploading a test file to S3 manually

3. **Try local fallback:**
   - If S3 fails, file is saved to `backend/uploads/`
   - Check if file exists there
   - URL should be `http://127.0.0.1:3001/uploads/filename`

### Issue 3: Gemini Summary Not Working

**Check the Error Message:**
```
[Unable to summarize this segment due to API limitations]
```

This means Gemini API failed. Check logs for:

#### **Quota Exceeded:**
```
[Summarization] Error: quota exceeded
[Summarization] Quota exceeded, waiting 5s before retry...
```

**Solutions:**
- Wait 24 hours for quota reset
- Use a different Gemini API key
- Upgrade to paid tier

#### **Invalid API Key:**
```
[Summarization] Error: API key not valid
```

**Solution:**
- Get a new API key from https://makersuite.google.com/app/apikey
- Update `.env` file with new key
- Restart backend

#### **Model Not Found:**
```
[Summarization] Error: models/gemini-1.5-flash not found
```

**Solution:**
- The model name changed or is unavailable
- Try `gemini-pro` or `gemini-1.5-pro` instead
- Edit `backend/services/summarizationService.js` line 6

---

## 🧪 Test API Credentials

Run these commands to verify your API keys work:

### Test Gemini:
```bash
cd backend
node test_gemini_simple.js
```

**Expected Output:**
```
✓ SUCCESS!
--- Summary ---
Prateek and Divya introduce themselves and greet each other in a brief call.
---------------
```

**If it fails:**
- Check GEMINI_API_KEY in `.env`
- Visit https://makersuite.google.com/app/apikey to get a new key
- Ensure you're not hitting quota limits

### Test ElevenLabs:
```bash
cd backend
node test_apis.js
```

**Expected Output:**
```
[ElevenLabs Test] ✓ Success!
First 5 words with speakers:
  1. "Hello" - Speaker: 0 (type: number)
  2. "Hi" - Speaker: 1 (type: number)
```

---

## 📋 Checklist

After fixing, verify:

- [ ] Backend server starts without errors
- [ ] New recording uploads successfully
- [ ] Backend logs show speaker IDs (not undefined)
- [ ] Transcript in admin panel shows "Speaker 0:", "Speaker 1:", etc.
- [ ] Audio player loads and plays recording
- [ ] Gemini summary appears (not error message)
- [ ] Tokenization logs show chunks being created

---

## 🔧 Quick Fixes

### Force Re-process a Meeting

If you want to re-process an existing meeting:

1. Get the meeting ID from admin panel
2. Get the audio file path from database
3. Run:
   ```bash
   cd backend
   node -e "
   import('./controllers/processController.js').then(m => {
     m.startProcessing('MEETING_ID', 'FILE_PATH', []);
   });
   "
   ```

### Clear All Meetings and Start Fresh

```bash
cd backend
npx prisma studio
```
- Delete all records from `Meeting` table
- Delete all files from `uploads/` folder
- Record a new meeting

---

## 📊 Expected Flow

Here's what should happen for each recording:

```
1. Extension captures audio → IndexedDB
2. User clicks upload → POST /api/upload
3. Backend saves to S3 → Creates DB record
4. ElevenLabs transcribes → Saves to elevenlabs_transcript
5. Speaker segments formatted → Saves to raw_transcript
6. Gemini tokenizes → Creates chunks
7. Gemini summarizes each chunk → Merges summaries
8. Final summary saved → Status: completed
9. Admin panel displays all data
```

Each stage is logged, so check backend console to see where it might be failing.

---

## 🆘 Still Having Issues?

If problems persist:

1. **Share Backend Logs:**
   - Copy the entire log output from backend terminal
   - Include from "Starting pipeline" to "Pipeline completed"

2. **Share Admin Panel Screenshot:**
   - Show the meeting card with all sections

3. **Check Database:**
   ```bash
   cd backend
   npx prisma studio
   ```
   - Open `Meeting` table
   - Check if `elevenlabs_transcript`, `raw_transcript`, and `summary` have data
   - Share the values

4. **Test APIs Individually:**
   - Run `node test_gemini_simple.js`
   - Run `node test_apis.js`
   - Share the output

---

## 🎉 Success Indicators

You'll know everything works when you see:

✅ Backend logs show:
```
[ElevenLabs] Word 0: "Hello", speaker_id: 0 (type: number)
[ElevenLabs] Created 8 speaker segments from words
[Tokenization] Created chunk 1: 342 tokens, 15 lines
[Summarization] Summarization completed successfully
```

✅ Admin panel shows:
- Numbered speakers (Speaker 0, Speaker 1)
- Working audio player with progress bar
- Actual AI summary with bullet points
- Action items listed

✅ No errors in browser console

---

**Remember:** The .env file with credentials is already created in `backend/` and is gitignored. It won't be committed to GitHub!
