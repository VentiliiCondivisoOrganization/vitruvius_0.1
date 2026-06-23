import { env } from '$env/dynamic/private';
import { fail } from '@sveltejs/kit';
import { createDbClient } from '@vitruvius/db';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const authenticated = !!locals.session;
	return { authenticated };
};

export const actions: Actions = {
	request: async ({ request, url }) => {
		const form = await request.formData();
		const email = form.get('email');

		if (typeof email !== 'string' || !email) {
			return fail(400, { error: 'Please enter your email address.' });
		}

		const supabaseUrl = env.PUBLIC_SUPABASE_URL || '';
		const anonKey = env.PUBLIC_SUPABASE_ANON_KEY || '';
		const db = createDbClient({ url: supabaseUrl, key: anonKey });

		const { error } = await db.auth.resetPasswordForEmail(email, {
			redirectTo: `${url.origin}/auth/callback?next=/reset-password`
		});

		if (error) {
			return fail(400, { error: error.message });
		}

		return { success: true };
	},

	update: async ({ request, locals }) => {
		if (!locals.session) {
			return fail(401, { error: 'You must be logged in to update your password.' });
		}

		const form = await request.formData();
		const password = form.get('password');
		const confirmPassword = form.get('confirmPassword');

		if (typeof password !== 'string' || typeof confirmPassword !== 'string' || !password) {
			return fail(400, { error: 'Please enter your new password.' });
		}

		if (password !== confirmPassword) {
			return fail(400, { error: 'Passwords do not match.' });
		}

		const { error } = await locals.db.auth.updateUser({ password });
		if (error) {
			return fail(400, { error: error.message });
		}

		return { updated: true };
	}
};
