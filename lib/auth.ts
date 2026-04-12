import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHmac } from "node:crypto";
import { ensureDefaultAdmin, verifyPassword } from "@/lib/admin-user";
import { prisma } from "@/lib/prisma";

const SESSION_COOKIE = "rv-trip-admin-session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

function getAuthSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is required.");
  }
  return secret;
}

function sign(payload: string) {
  return createHmac("sha256", getAuthSecret()).update(payload).digest("hex");
}

function encodeSession(userId: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `${userId}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

function decodeSession(raw: string | undefined) {
  if (!raw) {
    return null;
  }

  const [userId, expiresAt, signature] = raw.split(".");
  if (!userId || !expiresAt || !signature) {
    return null;
  }

  const payload = `${userId}.${expiresAt}`;
  if (sign(payload) !== signature) {
    return null;
  }

  if (Number(expiresAt) < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return { userId };
}

export async function loginAdmin(email: string, password: string) {
  await ensureDefaultAdmin();

  const user = await prisma.adminUser.findUnique({
    where: { email }
  });

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return false;
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, encodeSession(user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS
  });

  return true;
}

export async function logoutAdmin() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getAdminSession() {
  const cookieStore = await cookies();
  const parsed = decodeSession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!parsed) {
    return null;
  }

  return prisma.adminUser.findUnique({
    where: { id: parsed.userId }
  });
}

export async function requireAdmin() {
  const user = await getAdminSession();
  if (!user) {
    redirect("/admin/login");
  }
  return user;
}
