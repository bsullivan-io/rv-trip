import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { persistTrackerPoint, requireTrackerAdmin } from "@/lib/tracker";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requireTrackerAdmin();
    const body = (await request.json()) as {
      tripSlug?: string;
      latitude?: number;
      longitude?: number;
      source?: "auto" | "checkin";
      note?: string | null;
    };

    if (!body.tripSlug || typeof body.latitude !== "number" || typeof body.longitude !== "number") {
      return NextResponse.json({ error: "Invalid tracker payload." }, { status: 400 });
    }

    const result = await persistTrackerPoint({
      tripSlug: body.tripSlug,
      latitude: body.latitude,
      longitude: body.longitude,
      source: body.source === "checkin" ? "checkin" : "auto",
      note: body.note ?? null
    });

    if (result.stored) {
      revalidatePath(`/trips/${body.tripSlug}`);
      revalidatePath(`/trips/${body.tripSlug}/overview`);
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Tracker update failed." },
      { status: error instanceof Error && error.message === "Unauthorized." ? 401 : 500 }
    );
  }
}
