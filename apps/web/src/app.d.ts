// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { DbClient } from '@vitruvius/db';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			db: DbClient;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
