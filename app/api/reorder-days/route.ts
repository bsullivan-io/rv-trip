import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    slug?: string;
    dayIds?: string[];
  };

  const { slug, dayIds } = body;

  if (!slug || !Array.isArray(dayIds) || !dayIds.length) {
    return NextResponse.json({ error: "Missing slug or dayIds" }, { status: 400 });
  }

  // Use a raw transaction to avoid unique constraint conflicts on [tripId, dayNumber].
  // First set all to negative temporaries, then to their final values.
  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < dayIds.length; i++) {
      await tx.tripDay.update({
        where: { id: dayIds[i] },
        data: { dayNumber: -(i + 1) }
      });
    }
    for (let i = 0; i < dayIds.length; i++) {
      await tx.tripDay.update({
        where: { id: dayIds[i] },
        data: { dayNumber: i + 1 }
      });
    }
  });

  revalidatePath(`/trips/${slug}`);
  revalidatePath(`/trips/${slug}/locations`);
  revalidatePath("/");

  return NextResponse.json({ ok: true });
}
