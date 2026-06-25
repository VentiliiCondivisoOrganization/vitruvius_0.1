import { env as publicEnv } from '$env/dynamic/public';
import { m } from '$lib/paraglide/messages';
import { fail, redirect } from '@sveltejs/kit';
import { createDbClient } from '@vitruvius/db';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.session) {
		redirect(303, '/');
	}
	return {};
};

export const actions: Actions = {
	password: async ({ request, cookies, url }) => {
		const form = await request.formData();
		const email = form.get('email');
		const password = form.get('password');

		if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
			return fail(400, { error: m.error_email_password_required() });
		}

		const supabaseUrl = publicEnv.PUBLIC_SUPABASE_URL || '';
		const anonKey = publicEnv.PUBLIC_SUPABASE_ANON_KEY || '';
		const db = createDbClient({ url: supabaseUrl, key: anonKey });

		const { data, error } = await db.auth.signInWithPassword({ email, password });
		if (error) {
			return fail(400, { error: error.message });
		}

		if (data.session) {
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

		const redirectTo = url.searchParams.get('redirectTo') ?? '/';
		redirect(303, redirectTo);
	},

	google: async ({ url }) => {
		const supabaseUrl = env.PUBLIC_SUPABASE_URL || '';
		const anonKey = env.PUBLIC_SUPABASE_ANON_KEY || '';
		const db = createDbClient({ url: supabaseUrl, key: anonKey });

		const redirectTo = url.searchParams.get('redirectTo') ?? '/';
		const callbackUrl = `${url.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`;

		const { data, error } = await db.auth.signInWithOAuth({
			provider: 'google',
			options: {
				redirectTo: callbackUrl
			}
		});

		if (error) {
			return fail(400, { error: error.message });
		}

		if (data.url) {
			redirect(303, data.url);
		}

		return fail(500, { error: 'Failed to generate Google OAuth URL' });
	},

	magiclink: async ({ request, url }) => {
		const form = await request.formData();
		const email = form.get('email');

		if (typeof email !== 'string' || !email) {
			return fail(400, { error: m.error_email_required() });
		}

		const supabaseUrl = env.PUBLIC_SUPABASE_URL || '';
		const anonKey = env.PUBLIC_SUPABASE_ANON_KEY || '';
		const db = createDbClient({ url: supabaseUrl, key: anonKey });

		const redirectTo = url.searchParams.get('redirectTo') ?? '/';
		const callbackUrl = `${url.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`;

		const { error } = await db.auth.signInWithOtp({
			email,
			options: {
				emailRedirectTo: callbackUrl
			}
		});

		if (error) {
			return fail(400, { error: error.message });
		}

		return { success: true };
	}
};
