"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Ban } from "lucide-react";
import { Dialog, ConfirmDialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils";

export function DecisionButtons({ requestId, requestNumber, toolName, requester, compact = false }: { requestId: string; requestNumber: string; toolName: string; requester: string; compact?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<"approve" | "reject" | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function decide() {
    if (mode === "reject" && comment.trim().length < 3) return setErr("Add a short reason so the employee knows why.");
    setBusy(true);
    const { data, error } = await createClient().rpc("decide_tool_request", { p_request: requestId, p_approve: mode === "approve", p_comment: comment.trim() || null });
    setBusy(false);
    if (error) return toast("error", errorMessage(error));
    const res = data as { status: string; unit_code?: string };
    toast(
      "success",
      mode === "reject" ? `${requestNumber} rejected.` : res.status === "waitlisted" ? `${requestNumber} approved — waitlisted until a unit is free.` : `${requestNumber} approved. Pick ticket sent to the warehouse for ${res.unit_code}.`
    );
    setMode(null);
    setComment("");
    router.refresh();
  }

  return (
    <>
      <div className="flex gap-2">
        <button className={`btn btn-primary ${compact ? "btn-sm" : ""}`} onClick={() => { setMode("approve"); setErr(null); }}>
          <Check className="h-4 w-4" aria-hidden /> Approve
        </button>
        <button className={`btn btn-outline ${compact ? "btn-sm" : ""}`} onClick={() => { setMode("reject"); setErr(null); }}>
          <X className="h-4 w-4" aria-hidden /> Reject
        </button>
      </div>
      <Dialog
        open={!!mode}
        onClose={() => setMode(null)}
        title={mode === "approve" ? `Approve ${requestNumber}?` : `Reject ${requestNumber}?`}
        footer={
          <>
            <button className="btn btn-outline" onClick={() => setMode(null)} disabled={busy}>Cancel</button>
            <button className={`btn ${mode === "reject" ? "btn-danger" : "btn-primary"}`} onClick={decide} disabled={busy}>
              {busy ? "Saving…" : mode === "approve" ? "Approve & reserve" : "Reject request"}
            </button>
          </>
        }
      >
        <p className="mb-3 text-sm">
          <strong>{requester}</strong> requested <strong>{toolName}</strong>.{" "}
          {mode === "approve" ? "One available unit will be reserved for collection and the employee notified." : "The held unit returns to stock and the employee is notified."}
        </p>
        <label htmlFor={`c-${requestId}`} className="label">Comment {mode === "reject" ? <span className="text-red-700">*</span> : "(optional)"}</label>
        <textarea id={`c-${requestId}`} className="input min-h-[80px]" value={comment} onChange={(e) => setComment(e.target.value)} aria-invalid={!!err} />
        {err && <p className="field-error">{err}</p>}
      </Dialog>
    </>
  );
}

export function CancelRequestButton({ requestId, requestNumber }: { requestId: string; requestNumber: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  async function cancel() {
    setBusy(true);
    const { error } = await createClient().rpc("cancel_tool_request", { p_request: requestId });
    setBusy(false);
    if (error) return toast("error", errorMessage(error));
    toast("success", `${requestNumber} cancelled.`);
    setOpen(false);
    router.refresh();
  }
  return (
    <>
      <button className="btn btn-outline" onClick={() => setOpen(true)}><Ban className="h-4 w-4" aria-hidden /> Cancel request</button>
      <ConfirmDialog open={open} onClose={() => setOpen(false)} onConfirm={cancel} busy={busy} title={`Cancel ${requestNumber}?`} confirmLabel="Cancel request" tone="danger">
        Any reserved unit will go back to stock for the next person in the queue.
      </ConfirmDialog>
    </>
  );
}
