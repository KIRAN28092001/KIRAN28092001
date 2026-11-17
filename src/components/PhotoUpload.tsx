"use client";
import { useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";

/** Uploads evidence photos to the private `evidence` bucket under the user's folder. Returns storage paths. */
export function PhotoUpload({ userId, value, onChange, max = 4, label = "Photo evidence (optional)" }: { userId: string; value: string[]; onChange: (paths: string[]) => void; max?: number; label?: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    const supabase = createClient();
    const added: string[] = [];
    for (const file of Array.from(files).slice(0, max - value.length)) {
      if (!file.type.startsWith("image/")) continue;
      if (file.size > 8 * 1024 * 1024) {
        toast("error", `${file.name} is larger than 8 MB`);
        continue;
      }
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("evidence").upload(path, file, { contentType: file.type });
      if (error) {
        toast("error", `Upload failed: ${error.message}`);
        continue;
      }
      added.push(path);
      setPreviews((p) => ({ ...p, [path]: URL.createObjectURL(file) }));
    }
    setBusy(false);
    onChange([...value, ...added]);
  }

  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex flex-wrap gap-2">
        {value.map((p) => (
          <div key={p} className="relative h-20 w-20 overflow-hidden rounded-xl border-2 border-zinc-200 dark:border-zinc-700">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {previews[p] ? <img src={previews[p]} alt="Uploaded evidence" className="h-full w-full object-cover" /> : <span className="text-xs">Photo</span>}
            <button type="button" className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white" onClick={() => onChange(value.filter((x) => x !== p))} aria-label="Remove photo">
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {value.length < max && (
          <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-zinc-400 text-xs font-semibold text-zinc-600 hover:border-brand-yellow focus-within:ring-4 focus-within:ring-brand-yellow dark:text-zinc-300">
            {busy ? <Loader2 className="h-6 w-6 animate-spin" aria-hidden /> : <Camera className="h-6 w-6" aria-hidden />}
            {busy ? "Uploading" : "Add photo"}
            <input type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={(e) => onFiles(e.target.files)} disabled={busy} />
          </label>
        )}
      </div>
    </div>
  );
}
