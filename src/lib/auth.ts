import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "./supabase/server";
import type { Profile, Role } from "./types";

/** Current user's profile (cached per request). Redirects to /login when signed out. */
export const getProfile = cache(async (): Promise<Profile> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!data) redirect("/auth/signout?error=profile");
  if (!data.is_active) redirect("/auth/signout?error=inactive");
  return data as Profile;
});

/** Guard a page to specific roles. */
export async function requireRole(roles: Role[]): Promise<Profile> {
  const profile = await getProfile();
  if (!roles.includes(profile.role)) redirect("/dashboard?denied=1");
  return profile;
}

export const isStaff = (r: Role) => r === "admin" || r === "inventory_manager";
export const canManageTools = (r: Role) => r === "admin" || r === "inventory_manager" || r === "project_lead";
