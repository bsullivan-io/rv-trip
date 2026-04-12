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
    locationIds?: string[];
  };

  const { slug, locationIds } = body;

  if (!slug || !Array.isArray(locationIds) || !locationIds.length) {
    return NextResponse.json({ error: "Missing slug or locationIds" }, { status: 400 });
  }

  await prisma.$transaction(
    locationIds.map((id, index) =>
      prisma.dayLocation.update({
        where: { id },
        data: { sortOrder: index + 1 }
      })
    )
  );

  revalidatePath(`/trips/${slug}`);
  revalidatePath(`/trips/${slug}/locations`);
  revalidatePath("/");

  return NextResponse.json({ ok: true });
}
