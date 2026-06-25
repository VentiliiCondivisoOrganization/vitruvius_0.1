import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// The package is imported by both apps/web (anon key, RLS enforced) and apps/engine
// (service-role key, RLS bypassed). The client is always injected, so callers pick
// the credential that fits their context. We don't bind a generated Database type —
// rows are validated against the @vitruvius/core zod schemas at the boundary instead.
export type DbClient = SupabaseClient;

export interface SupportedStorage {
	getItem(key: string): string | null | Promise<string | null>;
	setItem(key: string, value: string): void | Promise<void>;
	removeItem(key: string): void | Promise<void>;
}

export type DbClientConfig = {
	url: string;
	key: string;
	accessToken?: string;
	storage?: SupportedStorage;
};

export function createDbClient({ url, key, accessToken, storage }: DbClientConfig): DbClient {
	const globalHeaders: Record<string, string> = {};
	if (accessToken) {
		globalHeaders['Authorization'] = `Bearer ${accessToken}`;
	}
	return createClient(url, key, {
		auth: {
			autoRefreshToken: false,
			persistSession: false,
			flowType: 'pkce',
			...(storage ? { storage } : {})
		},
		global: { headers: globalHeaders }
	});
}

// Convenience for server-side consumers (engine, web server routes). Prefers the
// service-role key when present, falling back to the public anon key.
export function dbClientFromEnv(
	env: Record<string, string | undefined> = process.env,
	accessToken?: string,
	storage?: SupportedStorage
): DbClient {
	const url = env.PUBLIC_SUPABASE_URL;
	// When an accessToken is present we are acting on behalf of a user and MUST use the
	// anon key so RLS is enforced. Never fall back to the service-role key here: that
	// would silently bypass RLS regardless of the Authorization header and expose other
	// tenants' data. Fail loudly instead.
	const key = accessToken
		? env.PUBLIC_SUPABASE_ANON_KEY
		: (env.SUPABASE_SERVICE_ROLE_KEY ?? env.PUBLIC_SUPABASE_ANON_KEY);

	if (!url) throw new Error('Missing PUBLIC_SUPABASE_URL');
	if (!key)
		throw new Error(
			accessToken
				? 'Missing PUBLIC_SUPABASE_ANON_KEY (required to enforce RLS when an access token is provided)'
				: 'Missing SUPABASE_SERVICE_ROLE_KEY or PUBLIC_SUPABASE_ANON_KEY'
		);

	return createDbClient({ url, key, accessToken, storage });
}
