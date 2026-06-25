/**
 * Sanitizes a redirect URL to prevent open redirect vulnerabilities.
 * Ensures the target starts with a single '/' and does not start with '//'.
 */
export function getSafeRedirect(url: string | null | undefined, fallback = '/'): string {
	if (!url) return fallback;
	if (url.startsWith('/') && !url.startsWith('//')) {
		return url;
	}
	return fallback;
}
