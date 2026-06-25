import { env as publicEnv } from '$env/dynamic/public';
import { m } from '$lib/paraglide/messages';
import { fail, redirect } from '@sveltejs/kit';
import { createDbClient } from '@vitruvius/db';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.session) {
		redirect(303, '/login?redirectTo=/settings');
	}

	const { data, error } = await locals.db.auth.getUser();
	if (error || !data.user) {
		redirect(303, '/login?redirectTo=/settings');
	}

	return {
		user: {
			email: data.user.email,
			identities: data.user.identities ?? []
		}
	};
};

export const actions: Actions = {
	connectGoogle: async ({ locals, url, cookies }) => {
		if (!locals.session) {
			redirect(303, '/login?redirectTo=/settings');
		}

		// Use the user's authenticated DB client with custom storage adapter
		const callbackUrl = `${url.origin}/auth/callback?next=/settings`;
		const accessToken = cookies.get('sb-access-token');

		const supabaseUrl = publicEnv.PUBLIC_SUPABASE_URL || '';
		const anonKey = publicEnv.PUBLIC_SUPABASE_ANON_KEY || '';
		const db = createDbClient({
			url: supabaseUrl,
			key: anonKey,
			accessToken,
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

		const { data, error } = await db.auth.linkIdentity({
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

		return fail(500, { error: m.error_google_oauth_failed() });
	},

	disconnectGoogle: async ({ locals }) => {
		if (!locals.session) {
			redirect(303, '/login?redirectTo=/settings');
		}

		const { data: userData, error: userError } = await locals.db.auth.getUser();
		if (userError || !userData.user) {
			redirect(303, '/login?redirectTo=/settings');
		}

		const identities = userData.user.identities ?? [];
		const googleIdentity = identities.find((id) => id.provider === 'google');

		if (!googleIdentity) {
			return fail(400, { error: m.settings_google_not_connected() });
		}

		// Prevent lockout: must have at least one other identity (e.g. email)
		if (identities.length <= 1) {
			return fail(400, { error: m.settings_must_have_one_method() });
		}

		const { error } = await locals.db.auth.unlinkIdentity(googleIdentity);
		if (error) {
			return fail(400, { error: error.message });
		}

		return { success: true, message: m.settings_success_disconnected() };
	}
};
