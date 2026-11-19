import { Badge } from "./Badge";
import { STATUS_META, REQUEST_META, TRANSFER_META, REVIEW_META, CONDITION_META } from "@/lib/utils";
import type { ToolStatus, RequestStatus, TransferStatus, LeadReview, ToolCondition } from "@/lib/types";

export function ToolStatusBadge({ status }: { status: ToolStatus }) {
  const m = STATUS_META[status];
  return <Badge tone={m.tone}><span className="sr-only">Status: </span>{m.label}</Badge>;
}
export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  const m = REQUEST_META[status];
  return <Badge tone={m.tone}><span className="sr-only">Request status: </span>{m.label}</Badge>;
}
export function TransferStatusBadge({ status }: { status: TransferStatus }) {
  const m = TRANSFER_META[status];
  return <Badge tone={m.tone}><span className="sr-only">Transfer status: </span>{m.label}</Badge>;
}
export function ReviewBadge({ status }: { status: LeadReview }) {
  const m = REVIEW_META[status];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}
export function ConditionBadge({ condition }: { condition: ToolCondition }) {
  const m = CONDITION_META[condition];
  return <Badge tone={m.tone} dot={false}><span className="sr-only">Condition: </span>{m.label}</Badge>;
}

type PickRef = { status: string; ticket_number?: string } | null | undefined;

/** Where a request is in the fulfillment pipeline (status + warehouse pick ticket). */
export function requestStage(status: RequestStatus, pick?: PickRef[] | PickRef) {
  const tickets = Array.isArray(pick) ? pick : pick ? [pick] : [];
  const active = tickets.find((t) => t && (t.status === "open" || t.status === "picked"));
  if (status === "approved") {
    if (active?.status === "open") return { label: "Approved — Awaiting Pick", tone: "purple" as const, stage: "awaiting_pick" as const, ticket: active.ticket_number };
    return { label: "Ready for Pickup", tone: "green" as const, stage: "ready" as const, ticket: active?.ticket_number };
  }
  const m = REQUEST_META[status];
  return { label: m.label, tone: m.tone, stage: status, ticket: undefined };
}

export function RequestStageBadge({ status, pick }: { status: RequestStatus; pick?: PickRef[] | PickRef }) {
  const s = requestStage(status, pick);
  return <Badge tone={s.tone}><span className="sr-only">Request status: </span>{s.label}</Badge>;
}
