// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { User } from '@supabase/supabase-js';
import type { DbClient } from '@vitruvius/db';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			db: DbClient;
			session: {
				user: User;
				accessToken: string;
			} | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
