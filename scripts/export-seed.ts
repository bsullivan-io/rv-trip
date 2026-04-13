import { writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../lib/prisma";

async function main() {
  const trip = await prisma.trip.findFirst({
    include: {
      days: {
        include: {
          startPlace: true,
          endPlace: true,
          stops: { orderBy: { sortOrder: "asc" } },
          locations: {
            include: { place: true },
            orderBy: { sortOrder: "asc" },
          },
        },
        orderBy: { dayNumber: "asc" },
      },
    },
  });

  if (!trip) throw new Error("No trip found in database");

  const lines: string[] = [];

  lines.push(`# ${trip.title}`, "");
  lines.push(`Starting location: ${trip.startingLocation}`, "");
  lines.push(trip.summary ?? "", "");
  lines.push("## Route Overview", "", trip.routeOverview ?? "", "");

  for (const day of trip.days) {
    lines.push(`## Day ${day.dayNumber}`, "");

    const routeParts = day.locations.map((loc) => loc.place.name);
    lines.push(`- Route: ${routeParts.join(" -> ")}`);
    if (day.miles) lines.push(`- Miles: ${day.miles}`);
    if (day.title) lines.push(`- Title: ${day.title}`);
    if (day.summary) lines.push(`- Summary: ${day.summary}`);
    if (day.callout) lines.push(`- Callout: ${day.callout}`);

    if (day.accommodationName) {
      lines.push(`- Accommodation: ${day.accommodationName}`);
      lines.push(`  ${day.accommodationDescription ?? ""}`);
    }

    for (const stop of day.stops) {
      const kind = stop.kind === "dinner" ? "Dinner" : "Activity";
      lines.push(`- ${kind}: ${stop.name}`);
      lines.push(`  ${stop.note ?? ""}`);
    }

    lines.push("");
  }

  if (trip.notes) {
    lines.push("## Notes", "");
    for (const line of trip.notes.split("\n").filter(Boolean)) {
      lines.push(`- ${line}`);
    }
    lines.push("");
  }

  const md = lines.join("\n");
  const outputPath = path.join(process.cwd(), "data", "mark-brian-april-2026.md");
  await writeFile(outputPath, md, "utf8");
  console.log(`Wrote ${outputPath}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
