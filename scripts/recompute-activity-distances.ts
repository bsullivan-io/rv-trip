import { recomputeTripActivityDistances } from "../lib/google-routes";
import { prisma } from "../lib/prisma";

async function main() {
  const target = process.argv[2]?.trim() || null;

  const trips = await prisma.trip.findMany({
    where: target
      ? {
          OR: [{ id: target }, { slug: target }]
        }
      : undefined,
    select: {
      id: true,
      slug: true
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  if (!trips.length) {
    throw new Error(target ? `No trip found for "${target}".` : "No trips found.");
  }

  for (const trip of trips) {
    await recomputeTripActivityDistances(trip.id);
    console.log(`Recomputed activity distances for ${trip.slug}`);
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
