# 🚀 MeetSync AI - Complete Setup Guide

## ✅ SECURITY STATUS

**YOUR CREDENTIALS ARE SAFE:**
- ✅ All API keys are in `.env` files (git-ignored)
- ✅ No credentials committed to git
- ✅ `.env.example` contains only placeholders
- ✅ Database files are git-ignored

---

## 🎯 CURRENT STATUS

### ✅ **What's Working:**
- Backend server with all API keys configured
- Local SQLite database (no internet required for DB)
- Enhanced admin panel with Notion formatting
- Upload flow: local → S3 → delete local file
- 3 distinct sections (Captions, Summary, Transcription)
- Topic extraction from summaries
- Table support in Notion formatting

### ⚠️ **What Needs Your Attention:**
1. **Chrome Extension needs reload** (see Step 2 below)
2. **Your computer's backend** needs to be running (see Step 1 below)

---

## 📋 QUICK START (3 Steps)

### **Step 1: Start Backend Server**

**On YOUR Windows machine:**

```bash
cd D:\meeting_summarizer\backend
npm run dev
```

**Wait for:**
```
✅ MeetSync Backend Running on http://localhost:3001
```

---

### **Step 2: Reload Chrome Extension**

1. Open Chrome: `chrome://extensions/`
2. Find **"MeetSync AI Extension"**
3. Click the **🔄 RELOAD** button
4. Verify extension is enabled (toggle should be blue/on)

---

### **Step 3: Test Recording**

1. Go to: `https://meet.google.com/new`
2. Join a meeting
3. Look for **purple floating widget** (bottom-right corner)
4. Click **●** button → Widget turns red (recording)
5. Speak some test words
6. Click **■** button → Name modal appears
7. Enter meeting name → Click "Save & Upload"
8. Open: `http://localhost:3001/admin/admin.html`
9. Hard refresh: `Ctrl+Shift+R`
10. Your meeting should appear!

---

## 🗄️ Database Configuration

### **Currently Using: SQLite (Local)**

**Location:** `backend/prisma/dev.db`

**Pros:**
- ✅ No internet required
- ✅ Fast and simple
- ✅ Perfect for development

**Cons:**
- ❌ Data only on your computer
- ❌ Can't share between devices

### **To Switch Back to PostgreSQL (Cloud):**

1. Edit `backend/.env`:
   ```env
   DATABASE_URL="postgresql://summarizer:...@dpg-d57lv0ali9vc739ipqt0-a.singapore-postgres.render.com/summarizer_1wx6"
   ```

2. Edit `backend/prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider = "postgresql"  // change from "sqlite"
     url      = env("DATABASE_URL")
   }
   ```

3. Regenerate Prisma client:
   ```bash
   cd backend
   npx prisma generate
   npx prisma db push
   npm run dev
   ```

---

## 🔧 Environment Variables

### **Your `.env` file contains:**

```env
DATABASE_URL="file:./prisma/dev.db"           # SQLite local database
AWS_ACCESS_KEY_ID="AKIA..."                   # For S3 uploads
AWS_SECRET_ACCESS_KEY="nW4..."                # For S3 uploads
AWS_REGION="ap-south-1"                       # Mumbai region
AWS_BUCKET_NAME="app-centric-digitech"        # Your S3 bucket
GEMINI_API_KEY="AIza..."                      # For AI summarization
ELEVENLABS_API_KEY="sk_93..."                 # For transcription
API_SECRET_KEY="my-secret-extension-key"      # Extension auth
PORT=3001                                     # Backend port
GROQ_API_KEY="gsk_..."                        # For Groq AI
```

**⚠️ NEVER commit the `.env` file!** It's already in `.gitignore`.

---

## 📊 Admin Panel Features

### **URL:** `http://localhost:3001/admin/admin.html`

### **Features:**
1. **Intelligence Center** dark theme
2. **3 Sections per meeting:**
   - 🎤 Meeting Captions (from Google Meet)
   - ✨ AI Summary (Notion formatted)
   - 🎵 ElevenLabs Transcription

3. **Notion Formatting:**
   - Headers (# ## ###)
   - **Bold** and *italic*
   - Checkboxes [x] and [ ]
   - Code blocks
   - Tables (Markdown)
   - Blockquotes
   - Lists

4. **Topic Extraction:**
   - Auto-generated from first line of summary
   - Displayed as badge at top of meeting

5. **Audio Playback:**
   - Streams from S3 bucket
   - Falls back to local if S3 fails

---

## 🐛 Troubleshooting

### **Problem: Widget not appearing**
**Solution:**
1. Go to `chrome://extensions/`
2. Click **RELOAD** on MeetSync AI Extension
3. Hard refresh webpage: `Ctrl+Shift+R`

### **Problem: Recording not starting**
**Solution:**
1. Check backend is running: `http://localhost:3001`
2. Open Chrome DevTools (F12) → Console tab
3. Look for errors starting with `[FloatingWidget]` or `[Background]`
4. Verify you're on Google Meet, Zoom, or Teams

### **Problem: Upload failing**
**Solution:**
1. Check backend logs for errors
2. Verify API_SECRET_KEY matches in extension and backend
3. Check Network tab in DevTools for failed API calls
4. Ensure AWS credentials are correct

### **Problem: Admin panel blank**
**Solution:**
1. Hard refresh: `Ctrl+Shift+R`
2. Check backend is running
3. Open browser console (F12) for JavaScript errors
4. Test API: `curl http://localhost:3001/api/meetings -H "x-api-key: my-secret-extension-key"`

### **Problem: Database connection failed**
**Solution:**
You're now using local SQLite! No internet needed.

If you want cloud database:
1. Log into Render.com
2. Wake up your PostgreSQL database
3. Follow "Switch to PostgreSQL" instructions above

---

## 📁 Project Structure

```
Meeting-summarizer/
├── backend/
│   ├── .env                    ← YOUR CREDENTIALS (git-ignored)
│   ├── .env.example            ← Safe template (can commit)
│   ├── prisma/
│   │   ├── schema.prisma       ← Database schema
│   │   └── dev.db              ← SQLite database (git-ignored)
│   ├── public/
│   │   └── admin.html          ← Admin panel
│   ├── services/               ← AI services (ElevenLabs, Groq, Gemini)
│   ├── controllers/            ← Upload, processing logic
│   └── server.js               ← Express server
├── src/
│   ├── background/
│   │   └── background.js       ← Extension service worker
│   ├── content/
│   │   ├── floatingWidget.js   ← Purple recording widget
│   │   └── scraper.js          ← Capture Google Meet captions
│   └── lib/
│       └── uploader.js         ← Upload audio to backend
└── public/
    └── manifest.json           ← Extension config
```

---

## 🎉 You're All Set!

**Next Steps:**
1. Start backend: `npm run dev` (in D:\meeting_summarizer\backend)
2. Reload Chrome extension
3. Test on Google Meet
4. Check admin panel: `http://localhost:3001/admin/admin.html`

**Questions?** Check `QUICK_FIX_CHECKLIST.md` for detailed diagnostics.

---

## 🔐 Security Reminders

- ✅ `.env` files are git-ignored
- ✅ No credentials in source code
- ✅ All API keys use `process.env`
- ✅ `.env.example` contains only placeholders
- ✅ Database files are git-ignored

**Always verify before pushing:**
```bash
git status  # Should NOT show .env files
```
