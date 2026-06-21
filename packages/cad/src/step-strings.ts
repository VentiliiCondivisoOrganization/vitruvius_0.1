// Decode ISO 10303-21 (STEP Part 21) string literals into plain Unicode before the names
// reach the AI. STEP files are ASCII; non-ASCII characters are carried as control
// directives inside the quoted string. We handle the ones real exporters emit:
//
//   \X2\....\X0\   one-or-more UTF-16BE code units (4 hex digits each), \X0\ ends the run
//   \X4\....\X0\   one-or-more UTF-32 code points  (8 hex digits each), \X0\ ends the run
//   \X\HH          a single byte HH in the current 8-bit code page (treated as latin-1)
//   \S\c           c + 0x80 in the current 8-bit page (treated as latin-1)
//   ''             an escaped single quote (Part 21 doubles quotes inside strings)
//   \\             an escaped backslash
//
// Page-switch directives (\P{A-G}\) only select an ISO-8859 page; we map the high-bit
// forms above through latin-1, which covers the overwhelmingly common Western exports and
// degrades to a reasonable glyph otherwise. Anything we don't recognize is passed through
// verbatim rather than dropped, so a name is never silently emptied.

export function decodeStepString(raw: string): string {
	let out = '';
	let i = 0;
	const n = raw.length;

	while (i < n) {
		const ch = raw[i]!;

		// Doubled single-quote -> literal quote.
		if (ch === "'" && raw[i + 1] === "'") {
			out += "'";
			i += 2;
			continue;
		}

		if (ch !== '\\') {
			out += ch;
			i += 1;
			continue;
		}

		// Escaped backslash.
		if (raw[i + 1] === '\\') {
			out += '\\';
			i += 2;
			continue;
		}

		// \X2\ … \X0\  (UTF-16BE) and \X4\ … \X0\ (UTF-32).
		const wide = /^\\X([24])\\/.exec(raw.slice(i));
		if (wide) {
			const width = wide[1] === '2' ? 4 : 8;
			let j = i + wide[0].length;
			let decoded = '';
			while (j < n) {
				// End marker \X0\.
				if (raw.startsWith('\\X0\\', j)) {
					j += 4;
					break;
				}
				const hex = raw.slice(j, j + width);
				if (hex.length < width || !/^[0-9A-Fa-f]+$/.test(hex)) break;
				const code = Number.parseInt(hex, 16);
				// \X2\ chunks are UTF-16 code units: a non-BMP char arrives as a surrogate
				// pair across two chunks, so use fromCharCode (fromCodePoint throws on a lone
				// surrogate). \X4\ chunks are full UTF-32 code points.
				decoded += width === 4 ? String.fromCharCode(code) : String.fromCodePoint(code);
				j += width;
			}
			out += decoded;
			i = j;
			continue;
		}

		// \X\HH  single 8-bit char (latin-1).
		const x8 = /^\\X\\([0-9A-Fa-f]{2})/.exec(raw.slice(i));
		if (x8) {
			out += String.fromCodePoint(Number.parseInt(x8[1]!, 16));
			i += x8[0].length;
			continue;
		}

		// \S\c  -> (c + 0x80) in latin-1.
		const s = /^\\S\\(.)/.exec(raw.slice(i));
		if (s) {
			out += String.fromCodePoint(s[1]!.charCodeAt(0) + 0x80);
			i += s[0].length;
			continue;
		}

		// Page-switch / locale directives we can safely drop: \P{A-G}\, \X0\.
		const directive = /^\\(?:P[A-G]|X0)\\/.exec(raw.slice(i));
		if (directive) {
			i += directive[0].length;
			continue;
		}

		// Unrecognized — emit the backslash verbatim and move on.
		out += ch;
		i += 1;
	}

	return out;
}
