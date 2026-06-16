import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// The package is imported by both apps/web (anon key, RLS enforced) and apps/engine
// (service-role key, RLS bypassed). The client is always injected, so callers pick
// the credential that fits their context. We don't bind a generated Database type —
// rows are validated against the @vitruvius/core zod schemas at the boundary instead.
export type DbClient = SupabaseClient;

export type DbClientConfig = {
  url: string;
  key: string;
};

export function createDbClient({ url, key }: DbClientConfig): DbClient {
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Convenience for server-side consumers (engine, web server routes). Prefers the
// service-role key when present, falling back to the public anon key.
export function dbClientFromEnv(env: Record<string, string | undefined> = process.env): DbClient {
  const url = env.PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? env.PUBLIC_SUPABASE_ANON_KEY;

  if (!url) throw new Error("Missing PUBLIC_SUPABASE_URL");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY or PUBLIC_SUPABASE_ANON_KEY");

  return createDbClient({ url, key });
}
