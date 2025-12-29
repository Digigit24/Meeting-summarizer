# Database Migration Guide

## ⚠️ IMPORTANT: Run This First!

Before using the updated application, you **MUST** run the database migration to add the new fields.

## 🚀 How to Run Migration

### Step 1: Navigate to Backend Directory
```bash
cd backend
```

### Step 2: Run Migration
```bash
npx prisma migrate deploy
```

**OR** if you want to create a new migration:
```bash
npx prisma migrate dev --name add_processing_tracking_fields
```

### Step 3: Verify Migration
```bash
npx prisma studio
```

This will open Prisma Studio in your browser where you can verify the new fields exist in the `Meeting` table.

## 📋 New Fields Added

The migration adds these fields to the `Meeting` table:

| Field | Type | Description |
|-------|------|-------------|
| `client_transcript` | String? | Captions scraped from Google Meet/Zoom |
| `elevenlabs_transcript` | String? | Raw transcription from ElevenLabs |
| `audio_file_size` | Int? | Size of uploaded audio file in bytes |
| `transcription_words` | Int? | Word count from ElevenLabs |
| `processing_stage` | String? | Current stage: uploaded, transcribing, summarizing, completed |
| `error_log` | String? | Any errors encountered during processing |
| `updated_at` | DateTime | Auto-updated timestamp |

## 🔍 Troubleshooting

### "Can't reach database server"
- Check your DATABASE_URL in `.env` file
- Ensure your PostgreSQL database is running
- Verify network connectivity to database host

### "Migration already applied"
- This is normal if you've run it before
- The migration is idempotent (safe to run multiple times)

### "Column already exists"
- Run: `npx prisma db push` to sync schema without migrations
- Or drop the database and recreate (⚠️ **loses all data**)

## 🎯 What Changed in This Update

1. **Replaced Gemini with Groq (Llama 3.3 70B)** for summarization
   - Faster responses
   - Better free tier
   - More reliable

2. **Improved Google Meet speaker extraction**
   - Searches up to 5 parent levels for speaker
   - Checks siblings for speaker elements
   - Better logging for debugging

3. **Added comprehensive data tracking**
   - Stores transcript at every stage
   - Tracks processing progress
   - Logs errors for debugging

## ✅ Verify It Worked

After running the migration:

1. Start the backend: `npm start`
2. Check the startup logs for:
   ```
   ✅ MeetSync Backend Running on http://localhost:3001
   ```
3. Record a new meeting
4. Check admin panel: `http://localhost:3001/admin/admin.html`
5. Verify you see:
   - Speaker labels (not "Unknown")
   - ElevenLabs transcription
   - Groq-powered summary
   - Processing stage indicator

## 🆘 Need Help?

If migration fails:
1. Check `.env` file has correct DATABASE_URL
2. Try: `npx prisma generate` first
3. Then: `npx prisma migrate deploy`
4. Share error message for debugging
