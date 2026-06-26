// Render Vitruvius brand raster assets (favicons, app icons, OG card) from the
// committed SVG/HTML sources, using a headless Chromium driven over the DevTools
// Protocol. No extra npm dependency is required — it talks CDP to the Chromium
// that Playwright installs, using Node's built-in fetch + WebSocket.
//
//   node scripts/brand/render-brand-assets.mjs
//
// Override the browser with CHROMIUM=/path/to/chrome if auto-detection fails.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const brandDir = resolve(repoRoot, 'apps/web/src/lib/assets/brand');
const staticDir = resolve(repoRoot, 'apps/web/static');

function findChromium() {
	if (process.env.CHROMIUM && existsSync(process.env.CHROMIUM)) return process.env.CHROMIUM;
	const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
	const direct = join(base, 'chromium');
	if (existsSync(direct)) return direct;
	if (existsSync(base)) {
		for (const dir of readdirSync(base)) {
			const candidate = join(base, dir, 'chrome-linux', 'chrome');
			if (existsSync(candidate)) return candidate;
		}
	}
	throw new Error('Chromium not found. Set CHROMIUM=/path/to/chrome.');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Minimal CDP client over a single browser WebSocket, with flattened sessions.
class CDP {
	constructor(ws) {
		this.ws = ws;
		this.id = 0;
		this.pending = new Map();
		this.listeners = [];
		ws.addEventListener('message', (e) => {
			const msg = JSON.parse(e.data);
			if (msg.id && this.pending.has(msg.id)) {
				const { resolve: res, reject } = this.pending.get(msg.id);
				this.pending.delete(msg.id);
				msg.error ? reject(new Error(msg.error.message)) : res(msg.result);
			} else {
				for (const fn of this.listeners) fn(msg);
			}
		});
	}
	send(method, params = {}, sessionId) {
		const id = ++this.id;
		const payload = { id, method, params };
		if (sessionId) payload.sessionId = sessionId;
		return new Promise((res, reject) => {
			this.pending.set(id, { resolve: res, reject });
			this.ws.send(JSON.stringify(payload));
		});
	}
	once(predicate) {
		return new Promise((res) => {
			const fn = (msg) => {
				if (predicate(msg)) {
					this.listeners = this.listeners.filter((l) => l !== fn);
					res(msg);
				}
			};
			this.listeners.push(fn);
		});
	}
}

async function launchBrowser(chromium) {
	const userDataDir = mkdtempSync(join(tmpdir(), 'vitruvius-cdp-'));
	const proc = spawn(
		chromium,
		[
			'--headless=new',
			'--no-sandbox',
			'--disable-gpu',
			'--hide-scrollbars',
			'--force-color-profile=srgb',
			'--no-first-run',
			'--no-default-browser-check',
			'--remote-debugging-port=0',
			`--user-data-dir=${userDataDir}`,
			'about:blank'
		],
		{ stdio: ['ignore', 'ignore', 'pipe'] }
	);
	// The chosen port is printed to stderr as: DevTools listening on ws://...
	const wsUrl = await new Promise((res, reject) => {
		let buf = '';
		const onData = (d) => {
			buf += d.toString();
			const m = buf.match(/ws:\/\/[^\s]+/);
			if (m) {
				proc.stderr.off('data', onData);
				res(m[0]);
			}
		};
		proc.stderr.on('data', onData);
		setTimeout(() => reject(new Error('Timed out waiting for DevTools endpoint')), 15000);
	});
	const ws = new WebSocket(wsUrl);
	await new Promise((res, reject) => {
		ws.addEventListener('open', res, { once: true });
		ws.addEventListener('error', reject, { once: true });
	});
	return { proc, ws, userDataDir, cdp: new CDP(ws) };
}

async function capture(cdp, { url, width, height, out }) {
	const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
	const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
	await cdp.send('Page.enable', {}, sessionId);
	await cdp.send(
		'Emulation.setDeviceMetricsOverride',
		{
			width,
			height,
			deviceScaleFactor: 1,
			mobile: false,
			screenWidth: width,
			screenHeight: height
		},
		sessionId
	);
	await cdp.send(
		'Emulation.setDefaultBackgroundColorOverride',
		{ color: { r: 0, g: 0, b: 0, a: 0 } },
		sessionId
	);
	const loaded = cdp.once((m) => m.method === 'Page.loadEventFired' && m.sessionId === sessionId);
	await cdp.send('Page.navigate', { url }, sessionId);
	await loaded;
	await sleep(120); // let fonts/gradients settle before the frame
	const { data } = await cdp.send(
		'Page.captureScreenshot',
		{ format: 'png', clip: { x: 0, y: 0, width, height, scale: 1 }, captureBeyondViewport: true },
		sessionId
	);
	writeFileSync(join(staticDir, out), Buffer.from(data, 'base64'));
	await cdp.send('Target.closeTarget', { targetId });
	console.log(`  ✓ static/${out}  (${width}×${height})`);
}

// Wrap an SVG file so it renders at an exact pixel box.
function svgPage(svgPath, width, height) {
	const svg = readFileSync(svgPath, 'utf8');
	return `<!doctype html><meta charset=utf8><style>html,body{margin:0;padding:0}
    .b{position:absolute;inset:0;width:${width}px;height:${height}px}
    .b svg{width:100%;height:100%;display:block}</style><div class="b">${svg}</div>`;
}

const work = mkdtempSync(join(tmpdir(), 'vitruvius-brand-'));
function pageUrl(html, name) {
	const p = join(work, `${name}.html`);
	writeFileSync(p, html);
	return `file://${p}`;
}

const targets = [
	// PNG favicons (fallback for browsers that ignore the SVG favicon).
	{ svg: 'logo-tile.svg', out: 'favicon-16.png', w: 16, h: 16 },
	{ svg: 'logo-tile.svg', out: 'favicon-32.png', w: 32, h: 32 },
	// Apple touch icon (iOS adds its own mask/shadow; keep a solid tile).
	{ svg: 'logo-tile.svg', out: 'apple-touch-icon.png', w: 180, h: 180 },
	// PWA icons.
	{ svg: 'logo-tile.svg', out: 'icon-192.png', w: 192, h: 192 },
	{ svg: 'logo-tile.svg', out: 'icon-512.png', w: 512, h: 512 }
];

const chromium = findChromium();
console.log(`Rendering brand assets with: ${chromium}\n`);
const browser = await launchBrowser(chromium);
try {
	for (const t of targets) {
		const url = pageUrl(svgPage(join(brandDir, t.svg), t.w, t.h), t.out);
		await capture(browser.cdp, { url, width: t.w, height: t.h, out: t.out });
	}
	// Maskable PWA icon (full-bleed safe zone) — its own square source.
	await capture(browser.cdp, {
		url: pageUrl(svgPage(join(here, 'icon-maskable.svg'), 512, 512), 'maskable'),
		width: 512,
		height: 512,
		out: 'icon-maskable-512.png'
	});
	// Open Graph / social share card.
	await capture(browser.cdp, {
		url: pageUrl(readFileSync(join(here, 'og-card.html'), 'utf8'), 'og'),
		width: 1200,
		height: 630,
		out: 'og-image.png'
	});
	console.log('\nDone.');
} catch (err) {
	console.error('Render failed:', err);
	process.exitCode = 1;
} finally {
	try {
		browser.ws.close();
	} catch {}
	browser.proc.kill();
	await sleep(300);
	for (const dir of [browser.userDataDir, work]) {
		try {
			rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
		} catch {}
	}
}
