import type { Metadata } from "next";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CatalogBrowser } from "./CatalogBrowser";
import type { CatalogItem, Category } from "@/lib/types";
import type { Row } from "@/lib/queries";

export const metadata: Metadata = { title: "Request Tool" };

export default async function CatalogPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const profile = await getProfile();
  const supabase = await createClient();
  const [{ data: items }, { data: categories }, { data: memberships }, { data: allProjects }, { data: loan }, { data: myOpen }] = await Promise.all([
    supabase.from("v_catalog").select("*").eq("is_archived", false).order("name"),
    supabase.from("tool_categories").select("id, name, code, image_url").order("name"),
    supabase.from("project_members").select("project:projects(id, name, status)").eq("user_id", profile.id),
    supabase.from("projects").select("id, name, status").order("name"),
    supabase.from("app_settings").select("value").eq("key", "default_loan_days").maybeSingle(),
    supabase.from("tool_requests").select("parent_tool_id, status").eq("requester_id", profile.id).in("status", ["pending", "approved", "waitlisted"]),
  ]);
  const staff = profile.role === "admin" || profile.role === "inventory_manager";
  const myProjects = ((memberships ?? []) as Row[]).map((m) => m.project).filter((p) => p && ["active", "planning"].includes(p.status));
  const requestProjects = staff ? ((allProjects ?? []) as Row[]).filter((p) => ["active", "planning"].includes(p.status)) : myProjects;

  return (
    <CatalogBrowser
      items={(items ?? []) as CatalogItem[]}
      categories={(categories ?? []) as Category[]}
      projects={((allProjects ?? []) as Row[]).map((p) => ({ id: p.id, name: p.name }))}
      requestProjects={requestProjects.map((p: Row) => ({ id: p.id, name: p.name }))}
      loanDays={Number(loan?.value ?? 7)}
      openRequests={Object.fromEntries(((myOpen ?? []) as Row[]).map((r) => [r.parent_tool_id, r.status]))}
      initial={{ q: params.q ?? "", availability: params.availability ?? "all", category: params.category ?? "all" }}
    />
  );
}
