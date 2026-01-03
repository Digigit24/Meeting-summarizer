import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function seed() {
  const email = "admin@celiyo.com";
  // Check if admin exists
  const exists = await prisma.admin.findUnique({ where: { email } });
  if (exists) {
    console.log("Admin already exists.");
    return;
  }

  const password = await bcrypt.hash("Letmegoin@0007", 10);
  await prisma.admin.create({
    data: {
      email,
      password,
    },
  });
  console.log("Admin seeded successfully.");
}

seed()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
