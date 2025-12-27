import { openDB } from "idb";

const DB_NAME = "MeetSyncDB";
const STORE_CHUNKS = "meeting_chunks";
const STORE_TRANSCRIPTS = "transcripts";
const STORE_METADATA = "metadata";
const DB_VERSION = 2; // Upgrading to 2 for new stores

export async function initDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
      // 1. Audio Chunks Store
      if (!db.objectStoreNames.contains(STORE_CHUNKS)) {
        const store = db.createObjectStore(STORE_CHUNKS, {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("meetingId", "meetingId", { unique: false });
      }

      // 2. Transcripts Store (New)
      if (!db.objectStoreNames.contains(STORE_TRANSCRIPTS)) {
        const tStore = db.createObjectStore(STORE_TRANSCRIPTS, {
          keyPath: "id",
          autoIncrement: true,
        });
        tStore.createIndex("meetingId", "meetingId", { unique: false });
      }

      // 3. Metadata Store (New)
      if (!db.objectStoreNames.contains(STORE_METADATA)) {
        db.createObjectStore(STORE_METADATA, { keyPath: "meetingId" });
      }
    },
  });
}

// --- Audio Chunk Operations ---

export async function saveChunk(meetingId, blob) {
  const db = await initDB();
  await db.add(STORE_CHUNKS, {
    meetingId,
    blob,
    timestamp: Date.now(),
  });
}

export async function getMeetingAudio(meetingId) {
  const db = await initDB();
  const index = db.transaction(STORE_CHUNKS).store.index("meetingId");
  const chunks = await index.getAll(meetingId);
  chunks.sort((a, b) => a.timestamp - b.timestamp);
  return new Blob(
    chunks.map((c) => c.blob),
    { type: "audio/webm" }
  );
}

// --- Transcript Operations ---

export async function saveTranscriptSegment(meetingId, segment) {
  const db = await initDB();
  await db.add(STORE_TRANSCRIPTS, {
    meetingId,
    ...segment, // { speaker, text, timestamp }
    savedAt: Date.now(),
  });
}

export async function getFullTranscript(meetingId) {
  const db = await initDB();
  const index = db.transaction(STORE_TRANSCRIPTS).store.index("meetingId");
  const segments = await index.getAll(meetingId);
  return segments.sort((a, b) => a.timestamp - b.timestamp);
}

// --- Metadata & Lifecycle Operations ---

export async function createMeetingMetadata(meetingId, name) {
  const db = await initDB();
  await db.put(STORE_METADATA, {
    meetingId,
    name,
    startTime: Date.now(),
    status: "recording",
  });
}

export async function updateMeetingStatus(meetingId, status) {
  const db = await initDB();
  const tx = db.transaction(STORE_METADATA, "readwrite");
  const store = tx.objectStore(STORE_METADATA);
  const meta = await store.get(meetingId);
  if (meta) {
    meta.status = status;
    meta.lastUpdated = Date.now();
    await store.put(meta);
  }
  await tx.done;
}

export async function getPendingMeetings() {
  const db = await initDB();
  const allMeta = await db.getAll(STORE_METADATA);
  return allMeta.filter(
    (m) => m.status === "pending_upload" || m.status === "recording"
  );
  // 'recording' acts as pending if browser crashed
}

export async function clearMeetingData(meetingId) {
  const db = await initDB();

  // 1. Clear Chunks
  const tx1 = db.transaction(STORE_CHUNKS, "readwrite");
  const index1 = tx1.store.index("meetingId");
  let cursor1 = await index1.openCursor(IDBKeyRange.only(meetingId));
  while (cursor1) {
    await cursor1.delete();
    cursor1 = await cursor1.continue();
  }
  await tx1.done;

  // 2. Clear Transcript
  const tx2 = db.transaction(STORE_TRANSCRIPTS, "readwrite");
  const index2 = tx2.store.index("meetingId");
  let cursor2 = await index2.openCursor(IDBKeyRange.only(meetingId));
  while (cursor2) {
    await cursor2.delete();
    cursor2 = await cursor2.continue();
  }
  await tx2.done;

  // 3. Update/Remove Metadata (Keep metadata but mark uploaded?)
  // User asked to "delete old recordings... to save user disk space".
  // So we remove the heavy blobs, maybe keep metadata for a bit or remove all.
  await db.delete(STORE_METADATA, meetingId);
}
