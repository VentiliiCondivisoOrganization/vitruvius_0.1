import { env } from '$env/dynamic/private';
import { redirect } from '@sveltejs/kit';
import { createDbClient } from '@vitruvius/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const code = url.searchParams.get('code');
	const next = url.searchParams.get('next') ?? '/';

	if (code) {
		const supabaseUrl = env.PUBLIC_SUPABASE_URL || '';
		const anonKey = env.PUBLIC_SUPABASE_ANON_KEY || '';
		const db = createDbClient({ url: supabaseUrl, key: anonKey });
		const { data, error } = await db.auth.exchangeCodeForSession(code);
		if (!error && data?.session) {
			cookies.set('sb-access-token', data.session.access_token, {
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				secure: process.env.NODE_ENV === 'production',
				maxAge: data.session.expires_in
			});
			cookies.set('sb-refresh-token', data.session.refresh_token, {
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				secure: process.env.NODE_ENV === 'production',
				maxAge: 60 * 60 * 24 * 30
			});
		}
	}

	redirect(303, next);
};
