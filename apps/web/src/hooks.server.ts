import { env } from '$env/dynamic/private';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { createDbClient, dbClientFromEnv } from '@vitruvius/db';

const PROTECTED_ROUTES = ['/', '/manuals'];

// i18n: resolve the request locale (cookie → Accept-Language → base locale) and
// expose it via AsyncLocalStorage so `m.*()` works during SSR in both load
// functions and form actions. `%lang%` in app.html is set to the resolved locale.
const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		event.request = request;
		return resolve(event, {
			transformPageChunk: ({ html }) => html.replace('%lang%', locale)
		});
	});

const handleAuth: Handle = async ({ event, resolve }) => {
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
					secure: process.env.NODE_ENV === 'production',
					maxAge: refreshData.session.expires_in
				});
				if (refreshData.session.refresh_token) {
					event.cookies.set('sb-refresh-token', refreshData.session.refresh_token, {
						path: '/',
						httpOnly: true,
						sameSite: 'lax',
						secure: process.env.NODE_ENV === 'production',
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
				secure: process.env.NODE_ENV === 'production',
				maxAge: refreshData.session.expires_in
			});
			if (refreshData.session.refresh_token) {
				event.cookies.set('sb-refresh-token', refreshData.session.refresh_token, {
					path: '/',
					httpOnly: true,
					sameSite: 'lax',
					secure: process.env.NODE_ENV === 'production',
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

// Paraglide runs first so the locale is in scope before auth load/actions execute.
export const handle = sequence(handleParaglide, handleAuth);
