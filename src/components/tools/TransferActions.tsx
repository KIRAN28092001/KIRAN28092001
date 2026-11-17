"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Flag, X, ScanLine, Ban } from "lucide-react";
import { Dialog, ConfirmDialog } from "@/components/ui/Dialog";
import { ScanInput } from "@/components/scanner/ScanInput";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils";

export function TransferActions({ transferId, unitCode, canAcknowledge, canReview, canFlag, canCancel }: { transferId: string; unitCode: string; canAcknowledge: boolean; canReview: boolean; canFlag: boolean; canCancel: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [scan, setScan] = useState(false);
  const [confirmAccept, setConfirmAccept] = useState(false);
  const [decline, setDecline] = useState(false);
  const [review, setReview] = useState<"approved" | "rejected" | "flagged" | null>(null);
  const [cancel, setCancel] = useState(false);
  const [comment, setComment] = useState("");

  async function call(fn: string, args: Record<string, unknown>, ok: string) {
    setBusy(true);
    const { error } = await createClient().rpc(fn, args);
    setBusy(false);
    if (error) return toast("error", errorMessage(error));
    toast("success", ok);
    setScan(false); setConfirmAccept(false); setDecline(false); setReview(null); setCancel(false); setComment("");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {canAcknowledge && (
        <div className="space-y-3 rounded-2xl border-4 border-orange-400 bg-orange-50 p-4 dark:bg-orange-950/30">
          <p className="font-bold">This tool is being transferred to you. Inspect it, then scan its barcode or confirm.</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary btn-lg" onClick={() => setScan((s) => !s)}><ScanLine className="h-5 w-5" aria-hidden /> Scan to accept</button>
            <button className="btn btn-dark btn-lg" onClick={() => setConfirmAccept(true)}><Check className="h-5 w-5" aria-hidden /> Confirm in app</button>
            <button className="btn btn-outline btn-lg" onClick={() => setDecline(true)}><X className="h-5 w-5" aria-hidden /> Decline</button>
          </div>
          {scan && (
            <ScanInput
              defaultCamera
              submitLabel="Accept"
              onSubmit={(c) => {
                if (c.toUpperCase() !== unitCode.toUpperCase()) return toast("error", `Scanned ${c} — this transfer is for ${unitCode}.`);
                call("acknowledge_transfer", { p_transfer: transferId, p_accept: true, p_scanned_code: c, p_comment: null }, "Transfer accepted — the tool is now in your custody.");
              }}
            />
          )}
        </div>
      )}

      {(canReview || canFlag || canCancel) && (
        <div className="flex flex-wrap gap-2">
          {canReview && <button className="btn btn-primary" onClick={() => setReview("approved")}><Check className="h-4 w-4" aria-hidden /> Approve</button>}
          {canReview && <button className="btn btn-outline" onClick={() => setReview("rejected")}><X className="h-4 w-4" aria-hidden /> Reject</button>}
          {canFlag && <button className="btn btn-outline" onClick={() => setReview("flagged")}><Flag className="h-4 w-4" aria-hidden /> Flag</button>}
          {canCancel && <button className="btn btn-outline" onClick={() => setCancel(true)}><Ban className="h-4 w-4" aria-hidden /> Cancel transfer</button>}
        </div>
      )}

      <ConfirmDialog open={confirmAccept} onClose={() => setConfirmAccept(false)} busy={busy} title="Accept this tool?" confirmLabel="Accept custody"
        onConfirm={() => call("acknowledge_transfer", { p_transfer: transferId, p_accept: true, p_scanned_code: null, p_comment: null }, "Transfer accepted — the tool is now in your custody.")}>
        You confirm you physically received <span className="font-mono font-bold">{unitCode}</span> and are now responsible for it.
      </ConfirmDialog>

      <Dialog open={decline} onClose={() => setDecline(false)} title="Decline transfer"
        footer={<><button className="btn btn-outline" onClick={() => setDecline(false)}>Back</button><button className="btn btn-danger" disabled={busy} onClick={() => call("acknowledge_transfer", { p_transfer: transferId, p_accept: false, p_scanned_code: null, p_comment: comment }, "Transfer declined.")}>Decline</button></>}>
        <label htmlFor="dc" className="label">Reason</label>
        <textarea id="dc" className="input min-h-[72px]" value={comment} onChange={(e) => setComment(e.target.value)} />
      </Dialog>

      <Dialog open={!!review} onClose={() => setReview(null)} title={review === "approved" ? "Approve transfer" : review === "rejected" ? "Reject transfer" : "Flag transfer"}
        footer={<><button className="btn btn-outline" onClick={() => setReview(null)}>Back</button>
          <button className={`btn ${review === "approved" ? "btn-primary" : "btn-danger"}`} disabled={busy || (review !== "approved" && comment.trim().length < 3)}
            onClick={() => call("review_transfer", { p_transfer: transferId, p_decision: review, p_comment: comment || null }, review === "approved" ? "Transfer approved." : review === "rejected" ? "Transfer rejected — custody restored to the original holder." : "Transfer flagged for Admin & Inventory.")}>
            {review === "approved" ? "Approve" : review === "rejected" ? "Reject" : "Flag"}
          </button></>}>
        <p className="mb-3 text-sm">{review === "rejected" ? "Rejecting returns custody to the original holder." : review === "flagged" ? "Flagging alerts Admins and Inventory Managers for follow-up without changing custody." : "Confirms the handoff is acceptable."}</p>
        <label htmlFor="rc" className="label">Comment {review !== "approved" && <span className="text-red-700">*</span>}</label>
        <textarea id="rc" className="input min-h-[72px]" value={comment} onChange={(e) => setComment(e.target.value)} />
      </Dialog>

      <ConfirmDialog open={cancel} onClose={() => setCancel(false)} busy={busy} tone="danger" title="Cancel transfer?" confirmLabel="Cancel transfer"
        onConfirm={() => call("cancel_transfer", { p_transfer: transferId }, "Transfer cancelled.")}>
        The tool stays with the current holder.
      </ConfirmDialog>
    </div>
  );
}
