"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PackageCheck, Printer } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { ScanInput } from "@/components/scanner/ScanInput";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils";

export function PickButton({ ticket }: { ticket: { id: string; ticket_number: string; tool: string; suggested: string | null; requester: string } }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function pick(code: string) {
    setBusy(true);
    const { data, error } = await createClient().rpc("pick_ticket_pick", { p_ticket: ticket.id, p_code: code, p_notes: notes.trim() || null });
    setBusy(false);
    if (error) return toast("error", errorMessage(error));
    const r = data as { unit_code: string; ticket_number: string };
    toast("success", `${r.ticket_number}: ${r.unit_code} staged. ${ticket.requester} has been notified.`);
    setOpen(false);
    setNotes("");
    router.refresh();
  }

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}><PackageCheck className="h-5 w-5" aria-hidden /> Pick</button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Pick ${ticket.ticket_number}`}>
        <div className="space-y-3">
          <p className="text-sm">
            Scan the <strong>{ticket.tool}</strong> you pulled from the shelf{ticket.suggested ? <> (suggested <span className="font-mono font-bold">{ticket.suggested}</span> — any available unit of this tool works)</> : null}.
          </p>
          <div>
            <label htmlFor={`pick-notes-${ticket.id}`} className="label">Staging note (optional)</label>
            <input id={`pick-notes-${ticket.id}`} className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. On pickup shelf 3 / loaded on truck 12" />
          </div>
          <ScanInput onSubmit={pick} busy={busy} submitLabel="Stage" placeholder={ticket.suggested ?? "Scan unit barcode"} />
        </div>
      </Dialog>
    </>
  );
}

export function PrintButton() {
  return (
    <button className="btn btn-outline" onClick={() => window.print()}><Printer className="h-5 w-5" aria-hidden /> Print pick list</button>
  );
}
