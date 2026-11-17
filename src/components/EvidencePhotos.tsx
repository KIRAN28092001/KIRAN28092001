"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** Displays private evidence photos via short-lived signed URLs. */
export function EvidencePhotos({ paths }: { paths: string[] }) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    if (!paths?.length) return;
    createClient()
      .storage.from("evidence")
      .createSignedUrls(paths, 3600)
      .then(({ data }) => setUrls((data ?? []).map((d) => d.signedUrl).filter((u): u is string => !!u)));
  }, [paths]);
  if (!paths?.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {urls.map((u, i) => (
        <a key={u} href={u} target="_blank" rel="noreferrer" className="block h-24 w-24 overflow-hidden rounded-xl border-2 border-zinc-200 dark:border-zinc-700">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={u} alt={`Evidence photo ${i + 1}`} className="h-full w-full object-cover" />
        </a>
      ))}
    </div>
  );
}
