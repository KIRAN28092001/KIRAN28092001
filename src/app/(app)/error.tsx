"use client";
import { AlertTriangle } from "lucide-react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card card-pad mx-auto mt-10 max-w-lg space-y-3 text-center" role="alert">
      <AlertTriangle className="mx-auto h-10 w-10 text-red-600" aria-hidden />
      <h1 className="text-xl font-extrabold">Something went wrong</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{error.message || "An unexpected error occurred."} If you are offline, reconnect and try again.</p>
      <button className="btn btn-primary" onClick={reset}>Try again</button>
    </div>
  );
}
