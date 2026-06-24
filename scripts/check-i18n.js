#!/usr/bin/env node

/**
 * i18n Localization Linter
 * Scans Svelte files for:
 * 1. Hardcoded user-facing text nodes in templates.
 * 2. Unlocalized attributes like placeholder="..." or title="...".
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(REPO_ROOT, 'apps/web/src');

let hasLintErrors = false;

function stripSvelteExpressions(text) {
	let result = '';
	let depth = 0;
	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		if (char === '{') {
			depth++;
		} else if (char === '}') {
			depth--;
			if (depth < 0) depth = 0;
		} else if (depth === 0) {
			result += char;
		} else if (char === '\n') {
			result += '\n';
		}
	}
	return result;
}

function stripBlock(text, openTag, closeTag) {
	let result = '';
	let currentIndex = 0;
	while (true) {
		const openIndex = text.toLowerCase().indexOf(openTag.toLowerCase(), currentIndex);
		if (openIndex === -1) {
			result += text.slice(currentIndex);
			break;
		}
		result += text.slice(currentIndex, openIndex);
		const closeIndex = text
			.toLowerCase()
			.indexOf(closeTag.toLowerCase(), openIndex + openTag.length);
		if (closeIndex === -1) {
			break;
		}
		const block = text.slice(openIndex, closeIndex + closeTag.length);
		const newlines = (block.match(/\n/g) || []).length;
		result += '\n'.repeat(newlines);
		currentIndex = closeIndex + closeTag.length;
	}
	return result;
}

function checkFile(filePath) {
	const content = fs.readFileSync(filePath, 'utf8');

	// Strip script, style, and comment blocks while preserving line numbers
	let template = content;
	template = stripBlock(template, '<script', '</script>');
	template = stripBlock(template, '<style', '</style>');
	template = stripBlock(template, '<!--', '-->');

	// A. Check for unlocalized user-facing attributes: placeholder, title, alt
	const attrRegex = /\b(placeholder|title|alt)\s*=\s*(["'])([^"'{]+)\2/gi;
	let attrMatch;
	while ((attrMatch = attrRegex.exec(template)) !== null) {
		const attr = attrMatch[1];
		const val = attrMatch[3].trim();
		// Ignore if it's purely numbers/symbols or empty
		if (val && /[a-zA-Z]/.test(val)) {
			const offset = attrMatch.index;
			const lineNum = template.slice(0, offset).split('\n').length;
			console.error(
				`[i18n] Error: ${filePath}:${lineNum} - Attribute "${attr}" has hardcoded string: "${val}"`
			);
			hasLintErrors = true;
		}
	}

	// B. Strip Svelte expressions to avoid matching dynamic text/code
	const textOnly = stripSvelteExpressions(template);

	// C. Strip HTML tags (replacing them with corresponding newlines to keep line numbers aligned)
	const plainText = textOnly.replace(/<[^>]*>/g, (m) => '\n'.repeat((m.match(/\n/g) || []).length));

	// D. Check for remaining hardcoded text
	const lines = plainText.split('\n');
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		if (!line) continue;

		// We want to detect words with alphabetical characters
		// Ignore common non-user-facing words/symbols
		// e.g. &nbsp;, &times;, &rarr;, &bull;
		let cleanLine = line
			.replace(/&[a-z]+;/g, '') // remove HTML entities
			.replace(/[^a-zA-Z\s]/g, '') // keep only letters and spaces
			.trim();

		if (cleanLine && cleanLine.length > 1 && /[a-zA-Z]/.test(cleanLine)) {
			console.error(`[i18n] Error: ${filePath}:${i + 1} - Hardcoded user-facing string: "${line}"`);
			hasLintErrors = true;
		}
	}
}

function scanDirectory(dir) {
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			scanDirectory(fullPath);
		} else if (entry.isFile() && entry.name.endsWith('.svelte')) {
			checkFile(fullPath);
		}
	}
}

console.log(`[i18n] Scanning Svelte files in ${SRC_DIR}...`);
scanDirectory(SRC_DIR);

if (hasLintErrors) {
	console.error('[i18n] Validation failed.');
	process.exit(1);
} else {
	console.log('[i18n] All Svelte files are fully localized.');
	process.exit(0);
}
