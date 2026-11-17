import type { Metadata } from "next";
import { getProfile, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/lists";
import { ProfileSettings, PasswordSettings, OrgSettings, CategorySettings } from "./SettingsForms";
import { ROLE_LABEL } from "@/lib/utils";
import type { Row } from "@/lib/queries";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const profile = await getProfile();
  const supabase = await createClient();
  const [{ data: settings }, { data: categories }] = await Promise.all([
    supabase.from("app_settings").select("key, value, description").order("key"),
    supabase.from("tool_categories").select("id, name, code, description").order("name"),
  ]);
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader title="Settings" subtitle={`${profile.full_name} · ${ROLE_LABEL[profile.role]}${profile.employee_code ? ` · ${profile.employee_code}` : ""}`} />
      <Section title="My profile"><ProfileSettings profile={profile} /></Section>
      <Section title="Change password"><PasswordSettings /></Section>
      {profile.role === "admin" && <Section title="Organization settings"><OrgSettings settings={(settings ?? []) as Row[]} /></Section>}
      {isStaff(profile.role) && <Section title="Tool categories"><CategorySettings categories={(categories ?? []) as Row[]} /></Section>}
    </div>
  );
}
