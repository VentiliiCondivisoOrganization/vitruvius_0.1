#!/usr/bin/env node
// Configure (or inspect) the R2 video bucket's lifecycle so abandoned multipart uploads are
// reaped automatically. When a browser dies mid-upload (refresh, tab close, network drop) the
// inline best-effort abort may never run, leaving uploaded parts orphaned in R2 — uncompleted,
// pointed at by no manual, and still billed as storage. This rule is the durable backstop:
// R2 aborts any multipart upload that hasn't completed within N days of being initiated.
//
// Run it with the R2 SDK on the module path (it ships with @vitruvius/db):
//
//   # Apply the rule (default: abort after 1 day):
//   R2_ACCOUNT_ID=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… R2_BUCKET=… \
//     pnpm --filter @vitruvius/db exec node ../../scripts/set-r2-lifecycle.mjs
//
//   # Apply with a custom number of days:
//   … pnpm --filter @vitruvius/db exec node ../../scripts/set-r2-lifecycle.mjs 3
//
//   # Inspect the bucket's current lifecycle without changing anything:
//   … pnpm --filter @vitruvius/db exec node ../../scripts/set-r2-lifecycle.mjs --check

import {
	GetBucketLifecycleConfigurationCommand,
	PutBucketLifecycleConfigurationCommand,
	S3Client
} from '@aws-sdk/client-s3';

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
	console.error('Missing one of R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET');
	process.exit(1);
}

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
// Abort uploads still incomplete this many days after they were initiated. Presigned part URLs
// expire in minutes, so anything unfinished after a day is abandoned. Must be a positive integer.
const days = (() => {
	const raw = args.find((a) => a !== '--check');
	if (raw === undefined) return 1;
	const n = Number(raw);
	if (!Number.isInteger(n) || n < 1) {
		console.error(`Days must be a positive integer; got "${raw}"`);
		process.exit(1);
	}
	return n;
})();

const RULE_ID = 'abort-incomplete-multipart-uploads';

const client = new S3Client({
	region: 'auto',
	endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
	forcePathStyle: true,
	credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY }
});

async function readLifecycle() {
	try {
		const out = await client.send(
			new GetBucketLifecycleConfigurationCommand({ Bucket: R2_BUCKET })
		);
		return out.Rules ?? [];
	} catch (error) {
		// R2 surfaces "no rules yet" as NoSuchLifecycleConfiguration; treat that as an empty set.
		if (error?.name === 'NoSuchLifecycleConfiguration') return [];
		throw error;
	}
}

if (checkOnly) {
	const rules = await readLifecycle();
	if (rules.length === 0) {
		console.log(`No lifecycle rules set on ${R2_BUCKET}.`);
	} else {
		console.log(`Lifecycle rules on ${R2_BUCKET}:`);
		console.log(JSON.stringify(rules, null, 2));
	}
	process.exit(0);
}

// Preserve any rules already on the bucket (e.g. a future video-retention rule); only replace
// our own abort rule so re-running this script is idempotent and non-destructive.
const existing = (await readLifecycle()).filter((r) => r.ID !== RULE_ID);

await client.send(
	new PutBucketLifecycleConfigurationCommand({
		Bucket: R2_BUCKET,
		LifecycleConfiguration: {
			Rules: [
				...existing,
				{
					ID: RULE_ID,
					Status: 'Enabled',
					// Empty prefix → applies to every object/upload in the bucket.
					Filter: { Prefix: '' },
					AbortIncompleteMultipartUpload: { DaysAfterInitiation: days }
				}
			]
		}
	})
);

console.log(
	`R2 lifecycle set on ${R2_BUCKET}: abort incomplete multipart uploads after ${days} day(s).`
);
