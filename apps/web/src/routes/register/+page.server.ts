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
	default: async ({ request, cookies }) => {
		const form = await request.formData();
		const email = form.get('email');
		const password = form.get('password');
		const confirmPassword = form.get('confirmPassword');

		if (
			typeof email !== 'string' ||
			typeof password !== 'string' ||
			typeof confirmPassword !== 'string' ||
			!email ||
			!password
		) {
			return fail(400, { error: m.error_fill_all_fields() });
		}

		if (password !== confirmPassword) {
			return fail(400, { error: m.error_passwords_no_match() });
		}

		const supabaseUrl = publicEnv.PUBLIC_SUPABASE_URL || '';
		const anonKey = publicEnv.PUBLIC_SUPABASE_ANON_KEY || '';
		const db = createDbClient({ url: supabaseUrl, key: anonKey });

		const { data, error } = await db.auth.signUp({ email, password });
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
			redirect(303, '/');
		}

		return { success: true };
	}
};
