// Deterministic, kernel-free geometry stats for mesh files. We count vertices/triangles
// and compute an axis-aligned bounding box — cheap facts that help the AI reason about
// scale and complexity without a render. Rendering canonical views is the separate,
// kernel-dependent path (render.ts); this never needs a native dep.
//
//   .obj  — Wavefront OBJ, ASCII: `v x y z` vertices, `f …` faces (n-gons fan-triangulated).
//   .stl  — STL, ASCII (`solid…facet…`) or binary (84-byte header + 50 bytes/triangle).

import type { GeometryStats } from '@vitruvius/core';

type Box = { min: [number, number, number]; max: [number, number, number]; seen: boolean };

function emptyBox(): Box {
	return {
		min: [Infinity, Infinity, Infinity],
		max: [-Infinity, -Infinity, -Infinity],
		seen: false
	};
}

function extend(box: Box, x: number, y: number, z: number): void {
	if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
	box.seen = true;
	if (x < box.min[0]) box.min[0] = x;
	if (y < box.min[1]) box.min[1] = y;
	if (z < box.min[2]) box.min[2] = z;
	if (x > box.max[0]) box.max[0] = x;
	if (y > box.max[1]) box.max[1] = y;
	if (z > box.max[2]) box.max[2] = z;
}

function finishBox(box: Box): GeometryStats['boundingBox'] {
	if (!box.seen) return [0, 0, 0, 0, 0, 0];
	return [box.min[0], box.min[1], box.min[2], box.max[0], box.max[1], box.max[2]];
}

export function parseObj(text: string): GeometryStats {
	const box = emptyBox();
	let vertexCount = 0;
	let triangleCount = 0;

	for (const line of text.split(/\r?\n/)) {
		if (line.startsWith('v ')) {
			const [, x, y, z] = line.trim().split(/\s+/);
			extend(box, Number(x), Number(y), Number(z));
			vertexCount++;
		} else if (line.startsWith('f ')) {
			// An n-gon face fan-triangulates into (n - 2) triangles.
			const corners = line.trim().split(/\s+/).length - 1;
			if (corners >= 3) triangleCount += corners - 2;
		}
	}

	return { vertexCount, triangleCount, boundingBox: finishBox(box) };
}

// Binary STL when the body length matches the 84-byte header + 50*tri layout AND the file
// does not start with the ASCII "solid " keyword followed by parseable facet lines.
function isBinaryStl(buf: Buffer): boolean {
	if (buf.length < 84) return false;
	const triangles = buf.readUInt32LE(80);
	const expected = 84 + triangles * 50;
	if (buf.length === expected) {
		// Some ASCII files still start with "solid"; the length match is the reliable tell.
		return true;
	}
	return false;
}

function parseBinaryStl(buf: Buffer): GeometryStats {
	const triangles = buf.readUInt32LE(80);
	const box = emptyBox();
	let offset = 84;
	for (let t = 0; t < triangles; t++) {
		// 12 bytes normal, then 3 vertices * 12 bytes, then 2 bytes attribute = 50 bytes.
		const vstart = offset + 12;
		for (let v = 0; v < 3; v++) {
			const p = vstart + v * 12;
			extend(box, buf.readFloatLE(p), buf.readFloatLE(p + 4), buf.readFloatLE(p + 8));
		}
		offset += 50;
	}
	return { vertexCount: triangles * 3, triangleCount: triangles, boundingBox: finishBox(box) };
}

function parseAsciiStl(text: string): GeometryStats {
	const box = emptyBox();
	let triangleCount = 0;
	let vertexCount = 0;
	for (const line of text.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (trimmed.startsWith('vertex ')) {
			const [, x, y, z] = trimmed.split(/\s+/);
			extend(box, Number(x), Number(y), Number(z));
			vertexCount++;
		} else if (trimmed.startsWith('facet ')) {
			triangleCount++;
		}
	}
	return { vertexCount, triangleCount, boundingBox: finishBox(box) };
}

export function parseStl(buf: Buffer): GeometryStats {
	if (isBinaryStl(buf)) return parseBinaryStl(buf);
	return parseAsciiStl(buf.toString('utf8'));
}
