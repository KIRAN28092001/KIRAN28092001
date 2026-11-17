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
