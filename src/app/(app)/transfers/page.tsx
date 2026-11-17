import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeftRight, Plus } from "lucide-react";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { TransferList } from "@/components/lists";
import { TRANSFER_SELECT, type Row } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Transfers" };

export default async function TransfersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const profile = await getProfile();
  const supabase = await createClient();
  const oversight = profile.role !== "labor";
  const tab = sp.tab ?? (oversight ? "review" : "incoming");
  let q = supabase.from("transfers").select(TRANSFER_SELECT).order("created_at", { ascending: false }).limit(200);
  if (tab === "incoming") q = q.eq("to_user_id", profile.id);
  else if (tab === "outgoing") q = q.eq("from_user_id", profile.id);
  else if (tab === "review") q = q.or("status.eq.pending_acknowledgment,and(status.eq.completed,lead_review.eq.pending),lead_review.eq.flagged");
  const { data } = await q;
  const tabs = [...(oversight ? [["review", "Needs attention"], ["all", "All transfers"]] : []), ["incoming", "To me"], ["outgoing", "From me"]];

  return (
    <div className="space-y-4">
      <PageHeader title="Tool Transfers" subtitle="Hand tools between crew members with a complete chain of custody." actions={<Link href="/transfers/new" className="btn btn-primary"><Plus className="h-5 w-5" aria-hidden /> New transfer</Link>} />
      <nav className="flex gap-2 overflow-x-auto" aria-label="Transfer views">
        {tabs.map(([k, l]) => (
          <Link key={k} href={`/transfers?tab=${k}`} aria-current={tab === k ? "page" : undefined} className={cn("chip shrink-0", tab === k ? "border-brand-charcoal bg-brand-charcoal text-white dark:border-brand-yellow dark:bg-brand-yellow dark:text-black" : "border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900")}>{l}</Link>
        ))}
      </nav>
      {(data ?? []).length === 0 ? (
        <EmptyState icon={ArrowLeftRight} title="No transfers here">Transfers you send or receive will show up in real time.</EmptyState>
      ) : (
        <div className="card card-pad"><TransferList rows={(data ?? []) as Row[]} /></div>
      )}
    </div>
  );
}
