"use client";
import { createClient } from "./client";

/**
 * Supabase e-mail links (invite / recovery) using the default templates land
 * with tokens in the URL hash. The SSR browser client uses PKCE and ignores
 * them, so establish the session explicitly. Returns true when a session exists.
 */
export async function ensureSessionFromUrl(): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  if (typeof window !== "undefined" && window.location.hash.includes("access_token")) {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    history.replaceState(null, "", window.location.pathname + window.location.search);
    if (access_token && refresh_token) {
      const { error } = await supabase.auth.setSession({ access_token, refresh_token });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    }
  }
  if (typeof window !== "undefined" && window.location.hash.includes("error_description")) {
    const params = new URLSearchParams(window.location.hash.slice(1));
    return { ok: false, error: params.get("error_description") ?? "This link is invalid or has expired." };
  }
  const { data } = await supabase.auth.getUser();
  return { ok: !!data.user };
}
