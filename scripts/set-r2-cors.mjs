#!/usr/bin/env node
// Configure CORS on the R2 video bucket so the browser can PUT video parts directly to R2
// (spec 20). Without this, the browser's cross-origin PUT is blocked and/or the ETag response
// header is hidden, so multipart upload cannot complete.
//
// Run it with the R2 SDK on the module path (it ships with @vitruvius/db):
//
//   R2_ACCOUNT_ID=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… R2_BUCKET=… \
//     pnpm --filter @vitruvius/db exec node ../../scripts/set-r2-cors.mjs https://vitruvius.fly.dev
//
// Pass one or more allowed origins as arguments (defaults to https://vitruvius.fly.dev plus
// http://localhost:5173 for local dev).

import { PutBucketCorsCommand, S3Client } from '@aws-sdk/client-s3';

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
	console.error('Missing one of R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET');
	process.exit(1);
}

const origins =
	process.argv.slice(2).length > 0
		? process.argv.slice(2)
		: ['https://vitruvius.fly.dev', 'http://localhost:5173'];

const client = new S3Client({
	region: 'auto',
	endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
	forcePathStyle: true,
	credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY }
});

await client.send(
	new PutBucketCorsCommand({
		Bucket: R2_BUCKET,
		CORSConfiguration: {
			CORSRules: [
				{
					AllowedOrigins: origins,
					AllowedMethods: ['PUT'],
					AllowedHeaders: ['*'],
					// The browser reads each part's ETag from the PUT response to complete the upload.
					ExposeHeaders: ['ETag'],
					MaxAgeSeconds: 3600
				}
			]
		}
	})
);

console.log(`R2 CORS set on ${R2_BUCKET} for: ${origins.join(', ')}`);
