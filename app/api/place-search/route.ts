import { NextResponse } from "next/server";
import { autocompletePlaces } from "@/lib/google-places";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";

  if (!query) {
    return NextResponse.json({ suggestions: [] });
  }

  try {
    const suggestions = await autocompletePlaces(query);
    return NextResponse.json({ suggestions });
  } catch (error) {
    return NextResponse.json(
      {
        suggestions: [],
        error: error instanceof Error ? error.message : "Place search failed."
      },
      { status: 200 }
    );
  }
}
