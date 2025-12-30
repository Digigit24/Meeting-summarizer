-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "s3_url" TEXT NOT NULL,
    "client_transcript" TEXT,
    "elevenlabs_transcript" TEXT,
    "raw_transcript" TEXT,
    "summary" TEXT,
    "action_items" TEXT,
    "sentiment" TEXT,
    "duration" INTEGER,
    "audio_file_size" INTEGER,
    "transcription_words" INTEGER,
    "status" TEXT DEFAULT 'processing',
    "processing_stage" TEXT,
    "error_log" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpeakerSegment" (
    "id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "speaker_name" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpeakerSegment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "SpeakerSegment" ADD CONSTRAINT "SpeakerSegment_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
