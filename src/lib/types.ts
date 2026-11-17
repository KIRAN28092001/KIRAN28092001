export type Role = "admin" | "project_lead" | "labor" | "inventory_manager";

export type ToolStatus =
  | "available"
  | "reserved"
  | "pending_approval"
  | "checked_out"
  | "in_transfer"
  | "maintenance"
  | "damaged"
  | "missing"
  | "retired";

export type ToolCondition = "good" | "fair" | "damaged" | "needs_maintenance" | "missing";
export type RequestStatus = "pending" | "approved" | "waitlisted" | "rejected" | "cancelled" | "fulfilled" | "expired";
export type TransferStatus = "pending_acknowledgment" | "completed" | "declined" | "rejected" | "cancelled";
export type LeadReview = "pending" | "approved" | "rejected" | "flagged";
export type ReturnCondition = "good" | "damaged" | "needs_maintenance" | "missing";

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  employee_code: string | null;
  phone: string | null;
  job_title: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Project {
  id: string;
  code: string;
  name: string;
  description: string | null;
  location: string | null;
  status: "planning" | "active" | "on_hold" | "completed";
  start_date: string | null;
  end_date: string | null;
}

export interface Category {
  id: string;
  name: string;
  code: string;
  image_url: string | null;
}

export interface CatalogItem {
  id: string;
  parent_code: string;
  name: string;
  brand: string;
  model_number: string | null;
  description: string | null;
  image_url: string | null;
  category_id: string;
  category_name: string;
  category_code: string;
  category_image_url: string | null;
  home_project_id: string | null;
  home_project_name: string | null;
  storage_location: string | null;
  min_stock_threshold: number;
  maintenance_interval_days: number | null;
  purchase_value: number | null;
  purchase_date: string | null;
  supplier: string | null;
  notes: string | null;
  times_requested: number;
  is_archived: boolean;
  created_at: string;
  total_units: number;
  available_units: number;
  checked_out_units: number;
  reserved_units: number;
  attention_units: number;
  unit_search: string;
  overall_condition: "good" | "fair" | "attention";
  active_projects: string[];
}

export interface ToolUnit {
  id: string;
  parent_tool_id: string;
  unit_number: number;
  unit_code: string;
  serial_number: string | null;
  status: ToolStatus;
  condition: ToolCondition;
  current_holder_id: string | null;
  current_project_id: string | null;
  location: string | null;
  reserved_for_request_id: string | null;
  reserved_until: string | null;
  last_maintenance_at: string | null;
  next_maintenance_due: string | null;
  notes: string | null;
  created_at: string;
}

export interface CustodyUnit {
  id: string;
  unit_code: string;
  unit_number: number;
  serial_number: string | null;
  status: ToolStatus;
  condition: ToolCondition;
  location: string | null;
  project_name: string | null;
  project_id: string | null;
  holder_id: string | null;
  holder_name: string | null;
  is_mine: boolean;
  checked_out_at: string | null;
  expected_return_date: string | null;
  approved_by: string | null;
  reserved_until: string | null;
  next_maintenance_due: string | null;
}

export interface QueueEntry {
  position: number;
  request_id: string | null;
  request_number: string | null;
  status: RequestStatus;
  created_at: string;
  is_mine: boolean;
  requester_name: string;
  project_name: string;
}

export interface Custody {
  units: CustodyUnit[];
  queue: QueueEntry[];
  full_access: boolean;
}

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export interface AuditRow {
  id: number;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  unit_id: string | null;
  project_id: string | null;
  summary: string | null;
  details: Record<string, unknown>;
  created_at: string;
  actor?: { full_name: string } | null;
}

export interface DashboardStats {
  total_tools: number;
  available: number;
  checked_out: number;
  reserved: number;
  attention: number;
  pending_requests: number;
  overdue: number;
  my_active: number;
  pending_transfers: number;
  transfers_to_review: number;
  by_project: { id: string; name: string; code: string; checked_out: number; home_tools: number; open_requests: number }[];
}
