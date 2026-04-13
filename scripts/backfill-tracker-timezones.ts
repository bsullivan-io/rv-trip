import { prisma } from "@/lib/prisma";
import { reverseGeocodeLocation } from "@/lib/tracker";

async function main() {
  const tripSlug = process.argv[2];

  const points = await prisma.tripTrackPoint.findMany({
    where: {
      timezone: null,
      ...(tripSlug ? { trip: { slug: tripSlug } } : {})
    },
    select: {
      id: true,
      latitude: true,
      longitude: true,
      recordedAt: true
    },
    orderBy: { recordedAt: "asc" }
  });

  console.log(`backfilling timezone for ${points.length} tracker points...`);
  let updated = 0;

  for (const point of points) {
    const location = await reverseGeocodeLocation(point.latitude, point.longitude, point.recordedAt);

    if (location.timezone) {
      await prisma.tripTrackPoint.update({
        where: { id: point.id },
        data: { timezone: location.timezone }
      });
      updated += 1;
    }
  }

  console.log(`updated ${updated} / ${points.length} tracker points with timezone`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
