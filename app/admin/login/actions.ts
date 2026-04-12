"use server";

import { redirect } from "next/navigation";
import { loginAdmin } from "@/lib/auth";

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const success = await loginAdmin(email, password);
  if (!success) {
    redirect("/admin/login?error=1");
  }

  redirect("/admin");
}
