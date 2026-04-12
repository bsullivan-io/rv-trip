import { ensureDefaultAdmin } from "../lib/admin-user";
import { prefetchHotDogPlacesForTrip } from "../lib/hot-dogs";
import { importSeedTrip } from "../lib/markdown-import";
import { prisma } from "../lib/prisma";

async function main() {
  await prisma.trip.deleteMany();
  await prisma.place.deleteMany();
  await ensureDefaultAdmin();
  const trip = await importSeedTrip();
  if (process.env.GOOGLE_MAPS_API_KEY?.trim()) {
    await prefetchHotDogPlacesForTrip(trip.id);
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
