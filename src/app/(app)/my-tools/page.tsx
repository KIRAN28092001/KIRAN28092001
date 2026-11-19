import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeftRight, CalendarClock, PackageOpen, RotateCcw, Search } from "lucide-react";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { ToolImage } from "@/components/ToolImage";
import { RequestList, TransferList, Section } from "@/components/lists";
import { CHECKOUT_SELECT, REQUEST_SELECT, TRANSFER_SELECT, type Row } from "@/lib/queries";
import { requestStage } from "@/components/ui/StatusBadge";
import { fmtDate, isOverdue } from "@/lib/utils";

export const metadata: Metadata = { title: "My Tools" };

export default async function MyToolsPage() {
  const profile = await getProfile();
  const supabase = await createClient();
  const [{ data: active }, { data: history }, { data: ready }, { data: incoming }, { data: outgoing }] = await Promise.all([
    supabase.from("checkouts").select(CHECKOUT_SELECT).eq("holder_id", profile.id).eq("status", "active").order("expected_return_date"),
    supabase.from("checkouts").select(CHECKOUT_SELECT).eq("holder_id", profile.id).neq("status", "active").order("checked_out_at", { ascending: false }).limit(30),
    supabase.from("tool_requests").select(REQUEST_SELECT).eq("requester_id", profile.id).eq("status", "approved"),
    supabase.from("transfers").select(TRANSFER_SELECT).eq("to_user_id", profile.id).eq("status", "pending_acknowledgment"),
    supabase.from("transfers").select(TRANSFER_SELECT).eq("from_user_id", profile.id).eq("status", "pending_acknowledgment"),
  ]);
  const rows = (active ?? []) as Row[];
  const readyRows = ((ready ?? []) as Row[]).filter((r) => requestStage(r.status, r.pick).stage === "ready");
  const pickingRows = ((ready ?? []) as Row[]).filter((r) => requestStage(r.status, r.pick).stage !== "ready");

  return (
    <div className="space-y-5">
      <PageHeader title="My Tools" subtitle="Everything you are responsible for right now, plus your history." actions={<Link href="/catalog" className="btn btn-primary"><Search className="h-5 w-5" aria-hidden /> Request tool</Link>} />

      {readyRows.length > 0 && (
        <Section title="Ready for pickup" action={<Link href="/scanner?mode=collect" className="btn btn-primary btn-sm">Scan to collect</Link>}>
          <RequestList rows={readyRows} showRequester={false} />
        </Section>
      )}
      {pickingRows.length > 0 && (
        <Section title="Approved — warehouse is picking">
          <RequestList rows={pickingRows} showRequester={false} />
        </Section>
      )}
      {(incoming?.length ?? 0) > 0 && (
        <Section title="Incoming transfers — acknowledge receipt">
          <TransferList rows={incoming as Row[]} />
        </Section>
      )}

      <section aria-labelledby="active-h">
        <h2 id="active-h" className="mb-3 text-lg font-extrabold">Active tools ({rows.length})</h2>
        {rows.length === 0 ? (
          <EmptyState icon={PackageOpen} title="You aren't holding any tools" action={<Link href="/catalog" className="btn btn-primary">Browse tools</Link>}>
            Approved tools appear here once you scan them at collection.
          </EmptyState>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {rows.map((c) => {
              const overdue = isOverdue(c.expected_return_date);
              const inTransfer = c.unit?.status === "in_transfer";
              return (
                <li key={c.id} className={`card overflow-hidden ${overdue ? "border-2 border-red-500" : ""}`}>
                  <Link href={`/units/${c.unit?.id}`} className="flex gap-3 p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                    <ToolImage src={c.unit?.parent?.image_url} alt="" className="h-20 w-20 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-extrabold">{c.unit?.parent?.name}</div>
                      <div className="font-mono text-sm font-bold">{c.unit?.unit_code}</div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <Badge tone="gray" dot={false}>{c.project?.name}</Badge>
                        {overdue && <Badge tone="red">Overdue</Badge>}
                        {inTransfer && <Badge tone="orange">Transfer pending</Badge>}
                      </div>
                      <p className={`mt-1 text-sm ${overdue ? "font-bold text-red-700 dark:text-red-400" : "text-zinc-600 dark:text-zinc-400"}`}>
                        <CalendarClock className="inline h-4 w-4" aria-hidden /> Due {fmtDate(c.expected_return_date)} · out since {fmtDate(c.checked_out_at)}
                      </p>
                    </div>
                  </Link>
                  {!inTransfer && (
                    <div className="grid grid-cols-2 border-t border-zinc-100 dark:border-zinc-800">
                      <Link href={`/scanner?mode=return&code=${encodeURIComponent(c.unit?.unit_code)}`} className="flex min-h-[52px] items-center justify-center gap-2 font-bold hover:bg-zinc-50 dark:hover:bg-zinc-800">
                        <RotateCcw className="h-5 w-5" aria-hidden /> Return
                      </Link>
                      <Link href={`/transfers/new?code=${encodeURIComponent(c.unit?.unit_code)}`} className="flex min-h-[52px] items-center justify-center gap-2 border-l border-zinc-100 font-bold hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800">
                        <ArrowLeftRight className="h-5 w-5" aria-hidden /> Transfer
                      </Link>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {(outgoing?.length ?? 0) > 0 && (
        <Section title="Outgoing transfers awaiting receipt">
          <TransferList rows={outgoing as Row[]} />
        </Section>
      )}

      <Section title="History">
        {(history ?? []).length === 0 ? (
          <p className="py-4 text-center text-sm text-zinc-500">No past checkouts yet.</p>
        ) : (
          <div className="-mx-4 overflow-x-auto sm:-mx-5">
            <table className="table">
              <thead><tr><th scope="col">Tool</th><th scope="col">Unit</th><th scope="col">Project</th><th scope="col">Out</th><th scope="col">Closed</th><th scope="col">How</th></tr></thead>
              <tbody>
                {((history ?? []) as Row[]).map((c) => (
                  <tr key={c.id}>
                    <td className="font-semibold">{c.unit?.parent?.name}</td>
                    <td><Link className="font-mono hover:underline" href={`/units/${c.unit?.id}`}>{c.unit?.unit_code}</Link></td>
                    <td>{c.project?.name}</td>
                    <td className="whitespace-nowrap">{fmtDate(c.checked_out_at)}</td>
                    <td className="whitespace-nowrap">{fmtDate(c.returned_at)}</td>
                    <td><Badge tone={c.status === "returned" ? "green" : "orange"} dot={false}>{c.status === "returned" ? "Returned" : "Transferred"}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
