import { redirect } from "next/navigation";
import { getTrips } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const trips = await getTrips();
  const firstTrip = trips[0];

  if (!firstTrip) {
    return (
      <main className="empty-state">
        <h1>No trips loaded</h1>
        <p>Run the Prisma migrations and seed script to import the itinerary.</p>
      </main>
    );
  }

  redirect(`/trips/${firstTrip.slug}`);
}
