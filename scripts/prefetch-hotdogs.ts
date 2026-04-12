import { prefetchHotDogPlacesForTrip } from "../lib/hot-dogs";
import { prisma } from "../lib/prisma";

async function main() {
  const slug = process.argv[2]?.trim();
  const trips = await prisma.trip.findMany({
    where: slug ? { slug } : undefined,
    select: {
      id: true,
      slug: true
    }
  });

  if (!trips.length) {
    throw new Error(slug ? `No trip found for slug "${slug}".` : "No trips found.");
  }

  for (const trip of trips) {
    await prefetchHotDogPlacesForTrip(trip.id);
    console.log(`Prefetched hot dog places for ${trip.slug}`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
