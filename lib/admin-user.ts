import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { prisma } from "./prisma";

export function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [salt, expected] = storedHash.split(":");
  if (!salt || !expected) {
    return false;
  }
  const actual = scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, "hex");
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}

export async function ensureDefaultAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    return null;
  }

  const existing = await prisma.adminUser.findUnique({
    where: { email }
  });

  if (existing) {
    return existing;
  }

  return prisma.adminUser.create({
    data: {
      email,
      passwordHash: hashPassword(password)
    }
  });
}
