import { env as publicEnv } from '$env/dynamic/public';
import { getSafeRedirect } from '$lib/server/redirect';
import { redirect } from '@sveltejs/kit';
import { createDbClient } from '@vitruvius/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const code = url.searchParams.get('code');
	const next = getSafeRedirect(url.searchParams.get('next'));

	if (code) {
		const supabaseUrl = publicEnv.PUBLIC_SUPABASE_URL || '';
		const anonKey = publicEnv.PUBLIC_SUPABASE_ANON_KEY || '';
		const db = createDbClient({
			url: supabaseUrl,
			key: anonKey,
			storage: {
				getItem: (key) => cookies.get(key) ?? null,
				setItem: (key, value) =>
					cookies.set(key, value, {
						path: '/',
						httpOnly: true,
						secure: process.env.NODE_ENV === 'production',
						sameSite: 'lax',
						maxAge: 60 * 10
					}),
				removeItem: (key) => cookies.delete(key, { path: '/' })
			}
		});
		const { data, error } = await db.auth.exchangeCodeForSession(code);
		if (error) {
			console.error('[auth callback] Failed to exchange code for session:', error);
		} else if (data?.session) {
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
