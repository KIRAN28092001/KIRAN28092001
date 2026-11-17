"use client";
import { useState } from "react";
import { RequestToolDialog, type RequestTarget } from "./RequestToolDialog";

export function RequestButton({ target, projects, loanDays, label, className = "btn btn-primary btn-lg" }: { target: RequestTarget; projects: { id: string; name: string }[]; loanDays: number; label: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>{label}</button>
      <RequestToolDialog target={open ? target : null} projects={projects} loanDays={loanDays} onClose={() => setOpen(false)} />
    </>
  );
}
