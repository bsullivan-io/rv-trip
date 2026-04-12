import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { batchAddActivitiesAction } from "@/app/trips/[slug]/actions";
import { BatchActivitiesEditor } from "@/components/public/batch-activities-editor";
import { getAdminSession } from "@/lib/auth";
import { getTripBySlug } from "@/lib/data";

export const dynamic = "force-dynamic";

type TripBatchActivitiesPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function TripBatchActivitiesPage({ params }: TripBatchActivitiesPageProps) {
  const { slug } = await params;
  const [trip, adminSession] = await Promise.all([getTripBySlug(slug), getAdminSession()]);

  if (!trip) {
    notFound();
  }

  if (!adminSession) {
    redirect(`/admin/login?next=${encodeURIComponent(`/trips/${trip.slug}/batch-activities`)}`);
  }

  return (
    <main className="locations-page">
      <section className="panel section-card stack">
        <div className="inline-actions">
          <Link href={`/trips/${trip.slug}`} className="button-secondary">
            Back to trip
          </Link>
        </div>

        <div>
          <p className="eyebrow">Batch Add Activities</p>
          <h1>{trip.title}</h1>
          <p className="trip-summary">Add one activity per line. The app will resolve each line and assign it to the nearest itinerary day.</p>
        </div>

        <BatchActivitiesEditor tripId={trip.id} slug={trip.slug} action={batchAddActivitiesAction} />
      </section>
    </main>
  );
}
