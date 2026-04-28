import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { extractPhotoMetadata, matchPhotoToDay, saveUploadedPhoto } from "@/lib/photo-import";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requireAdmin();

    const formData = await request.formData();
    const tripId = String(formData.get("tripId") ?? "");
    const slug = String(formData.get("slug") ?? "");
    const file = formData.get("photo");

    if (!tripId || !slug) {
      return NextResponse.json({ error: "Missing tripId or slug." }, { status: 400 });
    }
    if (!(file instanceof File) || !file.size) {
      return NextResponse.json({ error: "No photo provided." }, { status: 400 });
    }

    const allDays = await prisma.tripDay.findMany({
      where: { tripId },
      orderBy: { dayNumber: "asc" },
      include: {
        endPlace: true,
        locations: { include: { place: true } }
      }
    });

    if (!allDays.length) {
      return NextResponse.json({ error: "No days found for this trip." }, { status: 400 });
    }

    const dayMatches = allDays.map((d) => ({
      id: d.id,
      dayNumber: d.dayNumber,
      date: d.date ? d.date.toISOString().slice(0, 10) : null,
      locations: d.locations.map((loc) => ({ place: { latitude: loc.place.latitude, longitude: loc.place.longitude } })),
      endPlace: { name: d.endPlace.name, latitude: d.endPlace.latitude, longitude: d.endPlace.longitude }
    }));

    const { buffer, relativePath } = await saveUploadedPhoto(file);
    const metadata = await extractPhotoMetadata(buffer);
    const matched = matchPhotoToDay(dayMatches, metadata, 0);
    const day = allDays.find((d) => d.id === matched.id)!;

    await prisma.tripPhoto.create({
      data: {
        tripDayId: day.id,
        filePath: relativePath,
        originalFilename: file.name,
        title: `Day ${day.dayNumber}`,
        caption: null,
        mimeType: file.type || null,
        capturedAt: metadata.capturedAt ?? new Date(),
        latitude: metadata.latitude,
        longitude: metadata.longitude
      }
    });

    revalidatePath(`/trips/${slug}`);
    revalidatePath(`/trips/${slug}/details`);

    return NextResponse.json({ filename: file.name, dayNumber: day.dayNumber });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed." },
      { status: 500 }
    );
  }
}
