import { notFound, redirect } from "next/navigation";
import { uploadTripPhotosBatchAction } from "@/app/trips/[slug]/actions";
import { getAdminSession } from "@/lib/auth";
import { getTripBySlug } from "@/lib/data";
import { PhotoUploadPageClient } from "@/components/public/photo-upload-page";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function PhotoUploadPage({ params }: Props) {
  const { slug } = await params;
  const [trip, adminSession] = await Promise.all([getTripBySlug(slug), getAdminSession()]);

  if (!trip) notFound();
  if (!adminSession) redirect(`/admin/login?next=/trips/${slug}/upload`);

  return (
    <PhotoUploadPageClient
      tripId={trip.id}
      slug={trip.slug}
      tripTitle={trip.title}
      uploadAction={uploadTripPhotosBatchAction}
    />
  );
}
