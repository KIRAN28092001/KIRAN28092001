import Link from "next/link";
import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { RequestStatusBadge } from "@/components/ui/StatusBadge";
import { ToolImage } from "@/components/ToolImage";
import { DecisionButtons } from "@/components/tools/RequestActions";
import { REQUEST_SELECT, type Row } from "@/lib/queries";
import { cn, fmtDate, timeAgo, REQUEST_META } from "@/lib/utils";
import type { RequestStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Requests & Approvals" };

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ tab?: string; status?: string }> }) {
  const sp = await searchParams;
  const profile = await getProfile();
  const supabase = await createClient();
  const canApprove = profile.role === "admin" || profile.role === "project_lead";
  const canSeeAll = profile.role !== "labor";
  const tab = sp.tab ?? (canApprove ? "approvals" : "mine");
  const status = sp.status ?? "all";

  let leadProjects: string[] = [];
  if (profile.role === "project_lead") {
    const { data } = await supabase.from("project_members").select("project_id").eq("user_id", profile.id).eq("member_role", "lead");
    leadProjects = ((data ?? []) as Row[]).map((d) => d.project_id);
  }

  let query = supabase.from("tool_requests").select(REQUEST_SELECT).order("created_at", { ascending: false }).limit(200);
  if (tab === "mine") query = query.eq("requester_id", profile.id);
  if (tab === "approvals") {
    query = query.eq("status", "pending").order("created_at", { ascending: true });
    if (profile.role === "project_lead") query = query.in("project_id", leadProjects.length ? leadProjects : ["00000000-0000-0000-0000-000000000000"]);
  }
  if (status !== "all" && tab !== "approvals") query = query.eq("status", status);
  const { data } = await query;
  const rows = (data ?? []) as Row[];

  const tabs = [
    ...(canApprove ? [["approvals", "Awaiting my approval"]] : []),
    ["mine", "My requests"],
    ...(canSeeAll ? [["all", profile.role === "project_lead" ? "My projects" : "All requests"]] : []),
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Requests & Approvals" subtitle="Track tool requests from submission to collection." actions={<Link href="/catalog" className="btn btn-primary">New request</Link>} />
      <nav className="flex gap-2 overflow-x-auto" aria-label="Request views">
        {tabs.map(([k, l]) => (
          <Link key={k} href={`/requests?tab=${k}`} aria-current={tab === k ? "page" : undefined} className={cn("chip shrink-0", tab === k ? "border-brand-charcoal bg-brand-charcoal text-white dark:border-brand-yellow dark:bg-brand-yellow dark:text-black" : "border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900")}>
            {l}
          </Link>
        ))}
      </nav>
      {tab !== "approvals" && (
        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter by status">
          {(["all", ...Object.keys(REQUEST_META)] as (RequestStatus | "all")[]).map((s) => (
            <Link key={s} href={`/requests?tab=${tab}&status=${s}`} aria-current={status === s ? "true" : undefined} className={cn("chip shrink-0 text-xs", status === s ? "border-brand-yellow bg-brand-yellow text-black" : "border-zinc-300 dark:border-zinc-700")}>
              {s === "all" ? "All statuses" : REQUEST_META[s].label}
            </Link>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState icon={ClipboardList} title={tab === "approvals" ? "No requests waiting for approval" : "No requests found"}>
          {tab === "mine" ? "Find a tool in the catalog and tap Request." : "New requests will appear here in real time."}
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="card card-pad">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link href={`/requests/${r.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <ToolImage src={r.parent?.image_url} alt="" className="h-16 w-16 shrink-0" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-extrabold">{r.parent?.name}</span>
                      <RequestStatusBadge status={r.status} />
                    </div>
                    <p className="text-sm text-zinc-700 dark:text-zinc-300">
                      <span className="font-semibold">{r.requester?.full_name}</span> · {r.project?.name} · due back {fmtDate(r.expected_return_date)}
                    </p>
                    <p className="truncate text-xs text-zinc-500">
                      {r.request_number} · {timeAgo(r.created_at)} · “{r.reason}”{r.unit?.unit_code ? ` · unit ${r.unit.unit_code}` : " · queued (no unit free)"}
                    </p>
                  </div>
                </Link>
                {tab === "approvals" && r.requester_id !== profile.id && (
                  <DecisionButtons requestId={r.id} requestNumber={r.request_number} toolName={r.parent?.name} requester={r.requester?.full_name} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
