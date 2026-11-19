import type { Role } from "./types";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  roles: Role[];
  mobile?: boolean;
}

const ALL: Role[] = ["admin", "project_lead", "labor", "inventory_manager"];

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard", roles: ALL, mobile: true },
  { href: "/catalog", label: "Request Tool", icon: "Search", roles: ALL, mobile: true },
  { href: "/scanner", label: "Scanner", icon: "ScanLine", roles: ALL, mobile: true },
  { href: "/my-tools", label: "My Tools", icon: "Wrench", roles: ALL, mobile: true },
  { href: "/requests", label: "Requests & Approvals", icon: "ClipboardCheck", roles: ALL },
  { href: "/pick-tickets", label: "Pick Tickets", icon: "PackageCheck", roles: ["admin", "inventory_manager", "project_lead"] },
  { href: "/transfers", label: "Transfers", icon: "ArrowLeftRight", roles: ALL },
  { href: "/projects", label: "Projects", icon: "Building2", roles: ALL },
  { href: "/inventory", label: "Inventory", icon: "Boxes", roles: ["admin", "inventory_manager", "project_lead"] },
  { href: "/labels", label: "Barcode Labels", icon: "Barcode", roles: ["admin", "inventory_manager", "project_lead"] },
  { href: "/reports", label: "Reports", icon: "BarChart3", roles: ["admin", "inventory_manager", "project_lead"] },
  { href: "/audit", label: "Audit Log", icon: "History", roles: ["admin", "inventory_manager", "project_lead"] },
  { href: "/notifications", label: "Notifications", icon: "Bell", roles: ALL },
  { href: "/users", label: "Users & Roles", icon: "Users", roles: ["admin"] },
  { href: "/settings", label: "Settings", icon: "Settings", roles: ALL },
];

export function navFor(role: Role) {
  return NAV.filter((n) => n.roles.includes(role));
}
