// Shared PostgREST select strings (explicit FK names where tables have several relations)
export const REQUEST_SELECT =
  "id, request_number, status, reason, note, expected_return_date, created_at, decided_at, decision_comment, reservation_expires_at, fulfilled_at, project_id, parent_tool_id, requester_id, reserved_unit_id," +
  " parent:parent_tools(id, name, brand, parent_code, image_url)," +
  " requester:profiles!tool_requests_requester_id_fkey(id, full_name, job_title)," +
  " decider:profiles!tool_requests_decided_by_fkey(full_name)," +
  " project:projects(id, name, code)," +
  " unit:tool_units!tool_requests_reserved_unit_id_fkey(id, unit_code, status)";

export const CHECKOUT_SELECT =
  "id, checked_out_at, expected_return_date, returned_at, status, project_id, holder_id, notes," +
  " unit:tool_units!checkouts_unit_id_fkey(id, unit_code, status, condition, parent:parent_tools(id, name, brand, parent_code, image_url))," +
  " holder:profiles!checkouts_holder_id_fkey(id, full_name)," +
  " approver:profiles!checkouts_approved_by_fkey(full_name)," +
  " project:projects(id, name, code)";

export const TRANSFER_SELECT =
  "id, transfer_number, status, lead_review, reason, notes, condition_at_transfer, photo_urls, created_at, completed_at, reviewed_at, review_comment, project_id, from_user_id, to_user_id, created_by," +
  " unit:tool_units!transfers_unit_id_fkey(id, unit_code, parent:parent_tools(id, name, brand, image_url))," +
  " from_user:profiles!transfers_from_user_id_fkey(id, full_name)," +
  " to_user:profiles!transfers_to_user_id_fkey(id, full_name)," +
  " reviewer:profiles!transfers_reviewed_by_fkey(full_name)," +
  " project:projects(id, name, code)";

export const AUDIT_SELECT = "id, actor_id, action, entity_type, entity_id, unit_id, project_id, summary, details, created_at, actor:profiles(full_name)";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Row = any;
