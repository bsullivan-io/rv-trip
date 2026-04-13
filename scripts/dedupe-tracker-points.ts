import { prisma } from "@/lib/prisma";
import { shouldPersistAutoPoint } from "@/lib/tracker";

async function main() {
  const tripSlug = process.argv[2];

  const trips = await prisma.trip.findMany({
    where: tripSlug ? { slug: tripSlug } : undefined,
    select: {
      id: true,
      slug: true,
      trackPoints: {
        orderBy: { recordedAt: "asc" },
        select: {
          id: true,
          latitude: true,
          longitude: true,
          recordedAt: true,
          source: true
        }
      }
    }
  });

  for (const trip of trips) {
    const removeIds: string[] = [];
    let lastKeptAutoOrCheckin: {
      latitude: number;
      longitude: number;
      recordedAt: Date;
    } | null = null;

    for (const point of trip.trackPoints) {
      if (!lastKeptAutoOrCheckin) {
        lastKeptAutoOrCheckin = {
          latitude: point.latitude,
          longitude: point.longitude,
          recordedAt: point.recordedAt
        };
        continue;
      }

      if (point.source === "auto") {
        const shouldKeep = shouldPersistAutoPoint(lastKeptAutoOrCheckin, {
          latitude: point.latitude,
          longitude: point.longitude
        });

        if (!shouldKeep) {
          removeIds.push(point.id);
          continue;
        }
      }

      lastKeptAutoOrCheckin = {
        latitude: point.latitude,
        longitude: point.longitude,
        recordedAt: point.recordedAt
      };
    }

    if (removeIds.length) {
      await prisma.tripTrackPoint.deleteMany({
        where: {
          id: {
            in: removeIds
          }
        }
      });
    }

    console.log(`${trip.slug}: removed ${removeIds.length} duplicate tracker points`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
