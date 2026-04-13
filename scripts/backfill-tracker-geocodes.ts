import { prisma } from "@/lib/prisma";
import { reverseGeocodeLocation } from "@/lib/tracker";

async function main() {
  const tripSlug = process.argv[2];

  const points = await prisma.tripTrackPoint.findMany({
    where: tripSlug
      ? {
          trip: {
            slug: tripSlug
          }
        }
      : undefined,
    select: {
      id: true,
      latitude: true,
      longitude: true
    },
    orderBy: { recordedAt: "asc" }
  });

  let updated = 0;

  for (const point of points) {
    const location = await reverseGeocodeLocation(point.latitude, point.longitude);

    await prisma.tripTrackPoint.update({
      where: { id: point.id },
      data: {
        cityName: location.cityName,
        stateCode: location.stateCode,
        stateName: location.stateName
      }
    });

    updated += 1;
  }

  console.log(`backfilled ${updated} tracker points`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
