"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { logoutAdmin, requireAdmin } from "@/lib/auth";
import { parseDateInput } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { slugify, toRequiredString } from "@/lib/utils";

export async function logoutAction() {
  await logoutAdmin();
  redirect("/admin/login");
}

export async function createTripAction(formData: FormData) {
  await requireAdmin();

  const title = toRequiredString(formData.get("title"), "Title");
  const slugBase = slugify(title);

  const trip = await prisma.trip.create({
    data: {
      title,
      slug: `${slugBase || "trip"}-${Date.now().toString().slice(-6)}`,
      summary: toRequiredString(formData.get("summary"), "Summary"),
      startingLocation: toRequiredString(formData.get("startingLocation"), "Starting location"),
      endingLocation: toRequiredString(formData.get("endingLocation"), "Ending location"),
      startDate: parseDateInput(formData.get("startDate"), "Start date"),
      endDate: parseDateInput(formData.get("endDate"), "End date"),
      routeOverview: toRequiredString(formData.get("routeOverview"), "Route overview"),
      notes: String(formData.get("notes") ?? "").trim(),
      bookingPhone: String(formData.get("bookingPhone") ?? "").trim() || null,
      totalMiles: Number(formData.get("totalMiles") ?? 0) || null
    }
  });

  revalidatePath("/");
  redirect(`/admin/trips/${trip.id}`);
}
