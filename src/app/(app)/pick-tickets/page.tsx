import Link from "next/link";
import type { Metadata } from "next";
import { PackageCheck, Printer } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { ToolImage } from "@/components/ToolImage";
import { PickButton, PrintButton } from "./PickActions";
import { PICK_SELECT, type Row } from "@/lib/queries";
import { cn, fmtDate, fmtDateTime, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Pick Tickets" };

export default async function PickTicketsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const profile = await requireRole(["admin", "inventory_manager", "project_lead"]);
  const supabase = await createClient();
  const tab = sp.tab === "staged" ? "staged" : sp.tab === "done" ? "done" : "open";
  const status = tab === "open" ? ["open"] : tab === "staged" ? ["picked"] : ["completed", "cancelled"];
  const [{ data }, { data: counts }] = await Promise.all([
    supabase.from("pick_tickets").select(PICK_SELECT).in("status", status).order("created_at", { ascending: tab !== "done" }).limit(200),
    supabase.from("pick_tickets").select("status").in("status", ["open", "picked"]),
  ]);
  const rows = (data ?? []) as Row[];
  const nOpen = ((counts ?? []) as Row[]).filter((c) => c.status === "open").length;
  const nStaged = ((counts ?? []) as Row[]).filter((c) => c.status === "picked").length;
  const canPick = profile.role !== "labor";

  // group open tickets by pick location so the crib can walk one shelf at a time
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = tab === "open" ? r.pick_from ?? r.parent?.storage_location ?? "Tool crib" : r.project?.name ?? "—";
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }

  return (
    <div className="space-y-4">
      <div className="no-print">
        <PageHeader
          title="Pick Tickets"
          subtitle="Approved requests the warehouse needs to pull, stage and hand over. Requesters are notified the moment a tool is picked."
          actions={tab === "open" && rows.length > 0 ? <PrintButton /> : undefined}
        />
        <nav className="flex gap-2 overflow-x-auto" aria-label="Pick ticket views">
          {[
            ["open", `To pick (${nOpen})`],
            ["staged", `Staged — awaiting pickup (${nStaged})`],
            ["done", "Completed / cancelled"],
          ].map(([k, l]) => (
            <Link key={k} href={`/pick-tickets?tab=${k}`} aria-current={tab === k ? "page" : undefined} className={cn("chip shrink-0", tab === k ? "border-brand-charcoal bg-brand-charcoal text-white dark:border-brand-yellow dark:bg-brand-yellow dark:text-black" : "border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900")}>
              {l}
            </Link>
          ))}
        </nav>
      </div>

      <h1 className="hidden text-xl font-bold print:block">Pick list — {new Date().toLocaleString()}</h1>

      {rows.length === 0 ? (
        <EmptyState icon={PackageCheck} title={tab === "open" ? "Nothing to pick" : tab === "staged" ? "Nothing waiting for pickup" : "No closed tickets yet"}>
          {tab === "open" ? "New pick tickets appear here as soon as a Project Lead approves a request." : "Tickets move here as tools are picked and collected."}
        </EmptyState>
      ) : (
        [...groups.entries()].map(([group, list]) => (
          <section key={group} className="space-y-2" aria-label={group}>
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">{tab === "open" ? `Pick from: ${group}` : group}</h2>
            <ul className="space-y-2">
              {list.map((t) => (
                <li key={t.id} className="card card-pad flex flex-col gap-3 print:break-inside-avoid print:border print:shadow-none sm:flex-row sm:items-center">
                  <ToolImage src={t.parent?.image_url} alt="" className="h-16 w-16 shrink-0 print:hidden" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold">{t.ticket_number}</span>
                      <span className="font-extrabold">{t.parent?.name}</span>
                      {t.status === "picked" && <Badge tone="green">Staged</Badge>}
                      {t.status === "completed" && <Badge tone="blue">Collected</Badge>}
                      {t.status === "cancelled" && <Badge tone="gray">Cancelled</Badge>}
                    </div>
                    <p className="text-sm">
                      For <strong>{t.requester?.full_name}</strong> · {t.project?.name} · <Link className="link" href={`/requests/${t.request?.id}`}>{t.request?.request_number}</Link> · due back {fmtDate(t.request?.expected_return_date)}
                    </p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                      {t.status === "open" ? <>Suggested unit <span className="font-mono font-bold">{t.unit?.unit_code ?? "any available"}</span> · opened {timeAgo(t.created_at)}</> : <>Unit <span className="font-mono font-bold">{t.unit?.unit_code}</span> · picked {fmtDateTime(t.picked_at)}{t.picker ? ` by ${t.picker.full_name}` : ""}</>}
                      {t.notes ? ` · ${t.notes}` : ""}
                    </p>
                  </div>
                  {t.status === "open" && canPick && (
                    <div className="no-print"><PickButton ticket={{ id: t.id, ticket_number: t.ticket_number, tool: t.parent?.name, suggested: t.unit?.unit_code ?? null, requester: t.requester?.full_name }} /></div>
                  )}
                  {t.status === "open" && <div className="hidden h-6 w-6 border-2 border-black print:block" aria-hidden />}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      {tab === "open" && rows.length > 0 && (
        <p className="no-print flex items-center gap-1 text-xs text-zinc-500"><Printer className="h-3 w-3" aria-hidden /> Print the pick list to walk the crib, then scan each unit here to stage it.</p>
      )}
    </div>
  );
}
