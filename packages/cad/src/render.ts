// OPTIONAL canonical-view rendering. A real render needs a CAD/mesh kernel — a heavy
// native dependency that ships in the engine container (see apps/engine/Dockerfile), not
// in plain CI. So this module is deliberately *capability-gated*: when no kernel is
// configured it returns an empty view list and the pipeline degrades gracefully (the model
// still primes the AI via BOM + assembly tree + geometry stats).
//
// CRITICAL boundary rule (spec 12): no concrete CAD-kernel type may leak past this
// package. The kernel is reached only through a `KernelRenderer` *interface* resolved at
// runtime; nothing in the public surface (index.ts) references it. `CanonicalView` from
// `@vitruvius/core` is the only thing that crosses out.

import type { CanonicalView } from '@vitruvius/core';

/**
 * The narrow capability this package needs from whatever kernel the engine container
 * provides. The engine wires a concrete implementation via `setKernelRenderer`; callers
 * and the rest of the pipeline never see the kernel's own types.
 */
export interface KernelRenderer {
	/**
	 * Render canonical views of a model file. `targets` lists what to render: "assembly"
	 * for the whole model plus part `sourceId`s for per-part views. Returns file refs
	 * (absolute local paths); the implementation owns where they are written.
	 */
	render(modelPath: string, targets: string[], outDir: string): Promise<CanonicalView[]>;
}

let activeKernel: KernelRenderer | null = null;

/** Install the engine's kernel-backed renderer. Called once at engine startup. */
export function setKernelRenderer(renderer: KernelRenderer | null): void {
	activeKernel = renderer;
}

/** Whether canonical-view rendering is available in this environment. */
export function isRenderAvailable(): boolean {
	return activeKernel !== null;
}

/**
 * Render canonical views when a kernel is available; otherwise return `[]`. Any failure
 * inside the kernel is swallowed to `[]` — views are auxiliary priming, never required, so
 * a render fault must not fail the ingest.
 */
export async function renderCanonicalViews(
	modelPath: string,
	targets: string[],
	outDir: string
): Promise<CanonicalView[]> {
	if (!activeKernel) return [];
	try {
		return await activeKernel.render(modelPath, targets, outDir);
	} catch {
		return [];
	}
}
