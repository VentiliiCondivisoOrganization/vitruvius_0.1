// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { User } from '@supabase/supabase-js';
import type { DbClient } from '@vitruvius/db';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			db: DbClient;
			// The access token is intentionally kept out of this shape: `locals.session`
			// is exposed to the browser via +layout.server.ts, and leaking the JWT there
			// would defeat the httpOnly auth cookies.
			session: {
				user: User;
			} | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
