# MeetSync AI - Meeting Recorder & Summarizer Extension

A comprehensive Chrome extension that records Google Meet (and other meeting platforms), transcribes audio with speaker diarization, and generates AI-powered summaries with action items.

## 🚀 Features

- **Multi-Platform Recording**: Records Google Meet, Zoom, and Microsoft Teams
- **Audio Capture**: Captures both system audio (meeting) and microphone input
- **Speaker Diarization**: Identifies "who said what" using AssemblyAI
- **Caption Scraping**: Extracts real speaker names from Google Meet captions
- **Smart Chunking**: Handles long meetings with token-aware text chunking
- **AI Summarization**: Generates comprehensive summaries using OpenAI GPT
- **Action Items**: Automatically extracts action items and assigns owners
- **Database Storage**: Stores meetings, transcripts, and summaries in SQLite/PostgreSQL
- **S3 Integration**: Uploads recordings to AWS S3 (with local fallback)

## 📋 Architecture

```
Extension (Chrome) → Backend (Node.js) → External APIs
    ↓                     ↓                    ↓
Recording          Upload & Process      Transcribe & Summarize
Captions           Save to DB            AssemblyAI + OpenAI
IndexedDB          SQLite/PostgreSQL     S3 Storage
```

### Pipeline Flow

1. **Recording Phase** (Extension):
   - Extension captures tab audio + microphone
   - Scrapes Google Meet captions for speaker names
   - Stores audio chunks in IndexedDB

2. **Upload Phase** (Extension → Backend):
   - Merges audio chunks into single file
   - Uploads audio + caption data to backend

3. **Processing Phase** (Backend):
   - **Step 1**: Upload audio to S3 (or local fallback)
   - **Step 2**: Transcribe with AssemblyAI (speaker diarization)
   - **Step 3**: Map AI speakers to real names from captions
   - **Step 4**: Chunk transcript using tiktoken
   - **Step 5**: Summarize each chunk with GPT-3.5-turbo-16k
   - **Step 6**: Create final summary with GPT-4o-mini
   - **Step 7**: Extract action items and key points
   - **Step 8**: Save everything to database

## 🛠️ Tech Stack

### Extension (Frontend)
- **React** + **Vite** (UI & build tool)
- **TailwindCSS** (styling)
- **MediaRecorder API** (audio recording)
- **IndexedDB** (local storage)
- **Chrome Extensions API** (Manifest V3)

### Backend
- **Node.js** + **Express** (server)
- **SQLite/PostgreSQL** + **Prisma ORM** (database)
- **AWS S3** (audio storage)
- **AssemblyAI** (transcription + speaker diarization)
- **OpenAI GPT** (summarization)
- **tiktoken** (token counting)

## 📦 Installation

### 1. Clone Repository

```bash
git clone <repository-url>
cd Meeting-summarizer
```

### 2. Backend Setup

```bash
cd backend
npm install

# Copy and configure environment variables
cp .env.example .env
# Edit .env with your API keys (see Configuration section)

# Initialize database
npx prisma generate
npx prisma db push

# Start backend server
npm run dev
```

The backend will start on `http://localhost:3001`

### 3. Extension Setup

```bash
cd ..  # Back to root directory
npm install
npm run build
```

This creates a `dist/` folder with the built extension.

### 4. Load Extension in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `dist/` folder from this project
5. The MeetSync extension should now appear in your toolbar

## ⚙️ Configuration

### Backend Environment Variables

Edit `backend/.env`:

```env
# Server Configuration
PORT=3001
API_SECRET_KEY=my-secret-extension-key

# Database (SQLite for dev)
DATABASE_URL="file:./dev.db"

# AWS S3 (Optional - uses local fallback if not configured)
AWS_REGION=us-east-1
AWS_BUCKET_NAME=your-bucket-name
AWS_ACCESS_KEY_ID=your-access-key-here
AWS_SECRET_ACCESS_KEY=your-secret-key-here

# AssemblyAI (Required for transcription with speaker diarization)
ASSEMBLYAI_API_KEY=your-assemblyai-api-key-here

# OpenAI (Required for summarization)
OPENAI_API_KEY=your-openai-api-key-here
```

### Getting API Keys

1. **AssemblyAI**: Sign up at https://www.assemblyai.com/ (Free tier: 3 hours/month)
2. **OpenAI**: Get API key from https://platform.openai.com/
3. **AWS S3** (Optional): Create bucket and IAM user at https://aws.amazon.com/

## 🎯 Usage

### Recording a Meeting

1. Join a Google Meet call
2. Click the MeetSync extension icon
3. Enter a meeting name
4. Click **Start Recording**
5. The extension will:
   - Capture audio (system + microphone)
   - Scrape captions for speaker names
   - Store chunks in IndexedDB
6. When done, click **Stop Recording**
7. Extension uploads to backend automatically
8. Processing happens asynchronously

### Viewing Summaries

Backend stores:
- **Full transcript** (with speaker labels)
- **Summary** (comprehensive overview)
- **Action items** (extracted tasks)
- **Speaker segments** (who said what, with timestamps)

Query via API:

```bash
# List all meetings
curl http://localhost:3001/api/meetings

# Get specific meeting
curl http://localhost:3001/api/meetings/{meeting-id}
```

## 🔧 Development

### Backend Endpoints

- `POST /api/upload` - Upload meeting audio + transcript
- `GET /api/meetings` - List all meetings
- `DELETE /api/meetings/:id` - Delete meeting

### Scripts

**Frontend:**
- `npm run dev` - Development mode
- `npm run build` - Production build

**Backend:**
- `npm run dev` - Development mode (nodemon)
- `npm start` - Production mode

## 🐛 Troubleshooting

### Recording Not Working

1. Check microphone permissions in Chrome
2. Verify extension has `tabCapture` permission
3. Check browser console for errors
4. Ensure offscreen document is created

### Backend Not Connecting

1. Verify backend is running on port 3001
2. Check API key matches in extension and `.env`
3. Review backend console logs
4. Verify CORS settings

### Transcription/Summarization Issues

1. Verify API keys are valid
2. Check API quota/credits
3. Review backend logs for detailed errors
4. Test with shorter audio files first

## 📝 Notes

### Speaker Identification

Uses **hybrid approach** for best accuracy:
1. AssemblyAI provides speaker diarization (A, B, C)
2. Extension scrapes Google Meet captions (real names)
3. Backend maps AI labels to real names via timestamps

### Token Management

Long meetings handled via **map-reduce chunking**:
1. Count tokens with `tiktoken` (free)
2. Split into ~3000 token chunks
3. Summarize each chunk
4. Combine into final summary

## ⚠️ Important

1. **API Costs**: Monitor AssemblyAI and OpenAI usage
2. **Privacy**: Audio uploaded to external services
3. **Accuracy**: AI transcription ~95% accurate
4. **Storage**: Configure S3 or use local storage

## 📄 License

MIT License
