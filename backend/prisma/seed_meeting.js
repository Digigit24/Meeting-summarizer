import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function seedMeeting() {
  console.log("Seeding test meeting...");

  try {
    const m = await prisma.meeting.create({
      data: {
        name: "Test Strategy Meeting",
        s3_url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3", // Public test audio
        status: "completed",
        summary:
          "### Meeting Summary\nThis is a **test meeting** injected directly into the database to verify the Admin UI.\n## Key Points\n- Database connection is working.\n- Admin UI is successfully fetching data.\n- **Action Item**: Upload a real meeting via the extension.",
        elevenlabs_transcript:
          "Speaker A: Hello, is this working?\nSpeaker B: Yes, I can see this transcript in the dashboard now.",
        created_at: new Date(),
      },
    });
    console.log("✅ Test Meeting Created: " + m.id);
  } catch (e) {
    console.error("❌ Seeding failed:", e);
  } finally {
    await prisma.$disconnect();
  }
}

seedMeeting();
