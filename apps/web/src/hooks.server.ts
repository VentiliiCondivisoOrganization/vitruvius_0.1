import { env } from '$env/dynamic/private';
import type { Handle } from '@sveltejs/kit';
import { dbClientFromEnv, type DbClient } from '@vitruvius/db';

// One server-side client for the whole app. The web server uses the service-role
// key (RLS bypassed) for now; user-scoped anon access lands with the web/auth spec.
// Built lazily so importing this module doesn't require the env at build time.
let client: DbClient | undefined;

function db(): DbClient {
	if (!client) client = dbClientFromEnv(env);
	return client;
}

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.db = db();
	return resolve(event);
};
