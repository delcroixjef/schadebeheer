// Maps Supabase / fetch errors to a Dutch user-facing banner message.
export function formatSupabaseError(err: unknown): string {
  if (!err) return "";
  const e = err as { message?: string; code?: string; name?: string };
  const msg = (e?.message ?? String(err)).toLowerCase();

  // RLS / auth failures
  if (
    e?.code === "42501" ||
    msg.includes("row-level security") ||
    msg.includes("row level security") ||
    msg.includes("permission denied") ||
    msg.includes("violates row-level")
  ) {
    return "Geen schrijfrechten. Controleer Supabase policies.";
  }

  // Network / fetch failures
  if (
    e?.name === "TypeError" ||
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed") ||
    msg.includes("load failed")
  ) {
    return "Verbinding mislukt. Probeer opnieuw.";
  }

  // Unknown: surface the exact message for debugging
  return e?.message ?? String(err);
}
