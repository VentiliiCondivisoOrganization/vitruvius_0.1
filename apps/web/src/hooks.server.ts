import { env } from '$env/dynamic/private';
import { redirect, type Handle } from '@sveltejs/kit';
import { createDbClient, dbClientFromEnv } from '@vitruvius/db';

const PROTECTED_ROUTES = ['/', '/manuals'];

export const handle: Handle = async ({ event, resolve }) => {
	const accessToken = event.cookies.get('sb-access-token');
	const refreshToken = event.cookies.get('sb-refresh-token');

	let sessionUser = null;
	let activeToken = accessToken;

	const supabaseUrl = env.PUBLIC_SUPABASE_URL || '';
	const anonKey = env.PUBLIC_SUPABASE_ANON_KEY || '';

	if (activeToken) {
		const db = createDbClient({ url: supabaseUrl, key: anonKey, accessToken: activeToken });
		const { data, error } = await db.auth.getUser();
		if (!error && data?.user) {
			sessionUser = data.user;
			event.locals.db = db;
		} else if (refreshToken) {
			const refreshDb = createDbClient({ url: supabaseUrl, key: anonKey });
			const { data: refreshData, error: refreshError } = await refreshDb.auth.refreshSession({
				refresh_token: refreshToken
			});
			if (!refreshError && refreshData?.session && refreshData?.user) {
				sessionUser = refreshData.user;
				activeToken = refreshData.session.access_token;
				event.cookies.set('sb-access-token', activeToken, {
					path: '/',
					httpOnly: true,
					sameSite: 'lax',
					secure: true,
					maxAge: refreshData.session.expires_in
				});
				if (refreshData.session.refresh_token) {
					event.cookies.set('sb-refresh-token', refreshData.session.refresh_token, {
						path: '/',
						httpOnly: true,
						sameSite: 'lax',
						secure: true,
						maxAge: 60 * 60 * 24 * 30
					});
				}
				event.locals.db = createDbClient({
					url: supabaseUrl,
					key: anonKey,
					accessToken: activeToken
				});
			}
		}
	} else if (refreshToken) {
		const refreshDb = createDbClient({ url: supabaseUrl, key: anonKey });
		const { data: refreshData, error: refreshError } = await refreshDb.auth.refreshSession({
			refresh_token: refreshToken
		});
		if (!refreshError && refreshData?.session && refreshData?.user) {
			sessionUser = refreshData.user;
			activeToken = refreshData.session.access_token;
			event.cookies.set('sb-access-token', activeToken, {
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				secure: true,
				maxAge: refreshData.session.expires_in
			});
			if (refreshData.session.refresh_token) {
				event.cookies.set('sb-refresh-token', refreshData.session.refresh_token, {
					path: '/',
					httpOnly: true,
					sameSite: 'lax',
					secure: true,
					maxAge: 60 * 60 * 24 * 30
				});
			}
			event.locals.db = createDbClient({
				url: supabaseUrl,
				key: anonKey,
				accessToken: activeToken
			});
		}
	}

	if (!sessionUser) {
		if (accessToken) event.cookies.delete('sb-access-token', { path: '/' });
		if (refreshToken) event.cookies.delete('sb-refresh-token', { path: '/' });
		event.locals.db = dbClientFromEnv(env);
	}

	event.locals.session = sessionUser ? { user: sessionUser } : null;

	const path = event.url.pathname;
	const isProtected = PROTECTED_ROUTES.some((r) => path === r || path.startsWith(r + '/'));

	if (isProtected && !sessionUser) {
		throw redirect(
			303,
			`/login?redirectTo=${encodeURIComponent(event.url.pathname + event.url.search)}`
		);
	}

	if (sessionUser && (path === '/login' || path === '/register')) {
		throw redirect(303, '/');
	}

	return resolve(event);
};
