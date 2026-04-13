import { redirect } from "next/navigation";

type TripRootPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function TripRootPage({ params }: TripRootPageProps) {
  const { slug } = await params;
  redirect(`/trips/${slug}/overview`);
}
