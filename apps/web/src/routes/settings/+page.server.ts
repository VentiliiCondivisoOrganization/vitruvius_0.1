import { m } from '$lib/paraglide/messages';
import { fail, redirect } from '@sveltejs/kit';
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
	connectGoogle: async ({ locals, url }) => {
		if (!locals.session) {
			redirect(303, '/login?redirectTo=/settings');
		}

		// Use the user's authenticated DB client
		const callbackUrl = `${url.origin}/auth/callback?next=/settings`;

		const { data, error } = await locals.db.auth.signInWithOAuth({
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
