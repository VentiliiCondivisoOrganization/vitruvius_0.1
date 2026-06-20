// Content-hash cache for parsed artifacts. Parsing is deterministic in the file bytes, so
// the same model never needs re-parsing within a process. A simple in-process Map is
// enough for the engine worker's lifetime; a durable cache (Storage/DB) is out of scope.

import type { DigitalModel } from '@vitruvius/core';

const store = new Map<string, DigitalModel>();

export function getCached(contentHash: string): DigitalModel | undefined {
	return store.get(contentHash);
}

export function setCached(contentHash: string, model: DigitalModel): void {
	store.set(contentHash, model);
}

/** Test/maintenance hook: drop all cached artifacts. */
export function clearCache(): void {
	store.clear();
}
