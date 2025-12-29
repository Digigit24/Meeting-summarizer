# Admin Dashboard Guide

## 🎯 Quick Start

The admin dashboard lets you view all your meeting recordings, transcriptions, and summaries in one place.

### Access the Dashboard

1. Make sure your backend server is running:
   ```bash
   cd backend
   npm start
   ```

2. Open your browser and go to:
   ```
   http://localhost:3001/admin/admin.html
   ```

## 📊 Dashboard Features

### Overview Statistics
At the top of the dashboard, you'll see:
- **Total Meetings**: Number of recordings
- **Completed**: Successfully processed meetings
- **Processing**: Currently being transcribed/summarized
- **Total Words**: Combined word count from all transcriptions

### Meeting Cards
Each meeting shows:

#### Header Section
- **Meeting Name**: Name you gave the recording
- **Timestamp**: When it was recorded
- **File Size**: Size of the audio file
- **Word Count**: Number of words transcribed
- **Status Badge**: Current processing status
- **Processing Stage**: Where in the pipeline it is

#### Audio Player
- Listen to the original recording directly in the browser
- Works with both S3-hosted and locally-stored files

#### Transcription Sections

1. **Client Captions (Scraped)**
   - Live captions captured from Google Meet/Zoom
   - Shows speaker names as they appeared in the meeting

2. **ElevenLabs Transcription**
   - Raw transcription output from ElevenLabs API
   - This is the pure audio-to-text conversion

3. **Final Transcript (with Speakers)**
   - Combined transcript with speaker identification
   - Merges ElevenLabs audio transcription with caption speaker names

4. **AI Summary**
   - Gemini-generated summary with key points
   - Structured overview of the meeting

5. **Action Items**
   - Extracted tasks and to-dos from the meeting
   - Includes owner assignments if mentioned

## 🔍 What You Can See

### Processing Stages
The dashboard shows the current stage of each meeting:
- `uploaded` - File received and stored
- `transcribing` - Being sent to ElevenLabs
- `transcribed` - ElevenLabs completed
- `summarizing` - Gemini is processing
- `summarized` - Summary created
- `completed` - Fully processed
- `failed` - Error occurred (check error log)

### Error Tracking
If something goes wrong, you'll see:
- Red error box with the error message
- Which stage it failed at
- Helpful information for debugging

## 🔄 Auto-Refresh

The dashboard automatically refreshes every 30 seconds to show new recordings and updated processing status.

You can also manually refresh by clicking the "🔄 Refresh Data" button.

## 📝 Data Fields Explained

| Field | Description |
|-------|-------------|
| `client_transcript` | Captions scraped during the meeting |
| `elevenlabs_transcript` | Raw transcription from ElevenLabs |
| `raw_transcript` | Final combined transcript with speakers |
| `summary` | AI-generated meeting summary |
| `action_items` | Tasks extracted from the meeting |
| `transcription_words` | Word count from ElevenLabs |
| `audio_file_size` | Size of uploaded audio file |
| `processing_stage` | Current pipeline stage |
| `error_log` | Any errors encountered |

## 🎨 Visual Indicators

- **Green Badge**: Successfully completed
- **Yellow Badge**: Currently processing
- **Red Badge**: Failed (check error log)
- **Blue Badge**: Transcribed (waiting for summarization)

## 🔊 Audio Playback

The audio player supports:
- Play/Pause
- Volume control
- Seek to any position
- Download original file (right-click → Save)

## 💡 Tips

1. **Check Word Count**: If it shows only 1-2 words but you talked a lot, there might be an audio capture issue
2. **Review Error Logs**: Red error boxes tell you exactly what went wrong
3. **Processing Time**: Large files take longer - watch the `processing_stage` to see progress
4. **Gemini Quota**: If you see quota errors, you've hit the free tier limit (wait 24 hours or upgrade)

## 🐛 Troubleshooting

### No meetings showing?
- Check backend is running on port 3001
- Look at browser console (F12) for errors
- Verify API endpoint in admin.html matches your backend URL

### Audio won't play?
- Check if S3 upload succeeded (or using local fallback)
- Try right-clicking and "Save As" to download directly
- Check browser console for CORS errors

### Transcription shows 1 word?
- Look at `audio_file_size` - is it too small?
- Check ElevenLabs logs in backend terminal
- Verify microphone was captured during recording

## 📞 Support

Check the backend terminal logs for detailed pipeline information:
- `[Backend Upload]` - File upload info
- `[Orchestrator]` - Pipeline stages
- `[ElevenLabs]` - Transcription details
- `[Summarization]` - Gemini processing
