import type { Role, ToolStatus, RequestStatus, TransferStatus, LeadReview, ToolCondition } from "./types";

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  project_lead: "Project Lead",
  inventory_manager: "Inventory Manager",
  labor: "Labor / Employee",
};

/** Where each role lands after sign-in */
export function homeForRole(role: Role | null | undefined): string {
  switch (role) {
    case "admin":
      return "/dashboard";
    case "project_lead":
      return "/dashboard";
    case "inventory_manager":
      return "/dashboard";
    default:
      return "/dashboard";
  }
}

export function fmtDate(value: string | null | undefined, opts: Intl.DateTimeFormatOptions = {}) {
  if (!value) return "—";
  const d = value.length === 10 ? new Date(value + "T00:00:00") : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", ...opts });
}

export function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function timeAgo(value: string) {
  const diff = (Date.now() - new Date(value).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return fmtDate(value);
}

export function isOverdue(date: string | null | undefined) {
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(date + "T00:00:00") < today;
}

export function todayPlus(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function money(v: number | null | undefined) {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function titleCase(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

type Tone = "green" | "yellow" | "blue" | "orange" | "red" | "gray" | "purple";

export const STATUS_META: Record<ToolStatus, { label: string; tone: Tone }> = {
  available: { label: "Available", tone: "green" },
  reserved: { label: "Reserved", tone: "purple" },
  pending_approval: { label: "Pending Approval", tone: "yellow" },
  checked_out: { label: "Checked Out", tone: "blue" },
  in_transfer: { label: "In Transfer", tone: "orange" },
  maintenance: { label: "Maintenance", tone: "orange" },
  damaged: { label: "Damaged", tone: "red" },
  missing: { label: "Missing", tone: "red" },
  retired: { label: "Retired", tone: "gray" },
};

export const REQUEST_META: Record<RequestStatus, { label: string; tone: Tone }> = {
  pending: { label: "Pending Approval", tone: "yellow" },
  approved: { label: "Ready for Collection", tone: "green" },
  waitlisted: { label: "Approved — Waitlisted", tone: "purple" },
  rejected: { label: "Rejected", tone: "red" },
  cancelled: { label: "Cancelled", tone: "gray" },
  fulfilled: { label: "Collected", tone: "blue" },
  expired: { label: "Expired", tone: "gray" },
};

export const TRANSFER_META: Record<TransferStatus, { label: string; tone: Tone }> = {
  pending_acknowledgment: { label: "Awaiting Receipt", tone: "orange" },
  completed: { label: "Completed", tone: "green" },
  declined: { label: "Declined", tone: "red" },
  rejected: { label: "Rejected by Lead", tone: "red" },
  cancelled: { label: "Cancelled", tone: "gray" },
};

export const REVIEW_META: Record<LeadReview, { label: string; tone: Tone }> = {
  pending: { label: "Review Pending", tone: "yellow" },
  approved: { label: "Lead Approved", tone: "green" },
  rejected: { label: "Lead Rejected", tone: "red" },
  flagged: { label: "Flagged", tone: "red" },
};

export const CONDITION_META: Record<ToolCondition, { label: string; tone: Tone }> = {
  good: { label: "Good", tone: "green" },
  fair: { label: "Fair", tone: "yellow" },
  damaged: { label: "Damaged", tone: "red" },
  needs_maintenance: { label: "Needs Maintenance", tone: "orange" },
  missing: { label: "Missing", tone: "red" },
};

export function errorMessage(e: unknown): string {
  if (!e) return "Something went wrong";
  if (typeof e === "string") return e;
  const anyE = e as { message?: string; details?: string; hint?: string };
  return anyE.message || anyE.details || "Something went wrong";
}

export function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : Array.isArray(v) ? v.join("; ") : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}
