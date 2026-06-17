// Root flat ESLint config shared by all @vitruvius/* packages and apps/engine.
// apps/web ships its own eslint config (created by the SvelteKit scaffolder).
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	{
		ignores: [
			'**/dist/**',
			'**/build/**',
			'**/.svelte-kit/**',
			'**/.turbo/**',
			'**/node_modules/**',
			'apps/web/**'
		]
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		languageOptions: {
			globals: { ...globals.node }
		},
		rules: {
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
			]
		}
	}
);
