# Changelog

## [0.2.2](https://github.com/VentiliiCondivisoOrganization/vitruvius/compare/v0.2.1...v0.2.2) (2026-06-27)


### Features

* **web:** cap upload sizes and rate-limit uploads per user ([#77](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/77)) ([08ecb1d](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/08ecb1d03a18072a957a929392592dfd8b326255))
* **web:** upload videos directly to R2 via multipart ([#80](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/80)) ([5fefe7f](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/5fefe7f87d153cf2c48d074ea9f4c3bd173b78ea))

## [0.2.1](https://github.com/VentiliiCondivisoOrganization/vitruvius/compare/v0.2.0...v0.2.1) (2026-06-27)


### Features

* **engine:** report live pipeline stage for analysis progress ([#78](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/78)) ([08e0ede](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/08e0edeaf74986cb4ba2bcc14087019c7ccec975))
* **web:** surface real upload progress and phases on the home upload ([#74](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/74)) ([547bd53](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/547bd53a78b62109de71673b6cdf3a3813d96a6b))


### Bug Fixes

* **web:** stop the mobile home header from overflowing ([#75](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/75)) ([96248e3](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/96248e367a2f382ee0909be0c671901c65187561))


### Styles

* **web:** default the whole app to a pointer cursor ([#73](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/73)) ([efa7dd5](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/efa7dd5327d85987956489d4d003c7c8e34e020a))

## [0.2.0](https://github.com/VentiliiCondivisoOrganization/vitruvius/compare/v0.1.0...v0.2.0) (2026-06-27)


### ⚠ BREAKING CHANGES

* **core,db,engine:** `@vitruvius/core` `InstructionManual` gains required `version` (number) and `parentVersionId` (string | null), and `JOB_TYPE` gains `enrich`. The `manuals` table gains `version` + `parent_version_id`, and the `jobs.type` CHECK widens to include `enrich` (migration 0009). Existing manuals parse as `version: 1, parentVersionId: null`.
* **core,engine,web:** `@vitruvius/core` `JOB_TYPE` gains `regenerate` and `Job` gains a required `payload` field (`RegenerateRequest | null`); the `jobs` table gains a `payload` column and a widened `type` CHECK (migration 0008). Existing process/export jobs set `payload: null`.
* **core:** extend contract with PartRef and ManualBomItem (spec 01) ([#33](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/33))

### Features

* add typed stub packages db, media, ai, export ([a9d281a](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/a9d281a4242393f8e2777f512e98914a62ca6af1))
* **ai:** add Illustrator agent for step schematics (spec 14 tier 1) ([#40](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/40)) ([412a8e6](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/412a8e60ade4fe7f922e11e5fd705fe3fe3b48e6))
* **ai:** implement Critic agent (spec 10-ai-critic) ([#25](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/25)) ([b20f992](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/b20f992e2c726d9d46f0521d057a6016af21fd4e))
* **ai:** implement Instruction Writer agent (spec 06-ai-instructions) ([#24](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/24)) ([5de3811](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/5de3811fea139e8c90509e32f918f78f8767af32))
* **ai:** implement learnings meta-learning loop (spec 11-learnings) ([#26](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/26)) ([29bee97](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/29bee97dc631a31933ef9e4c255503af93565a23))
* **ai:** implement Segmenter agent (spec 05-ai-segment) ([#21](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/21)) ([ee4f6fb](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/ee4f6fb7b8e64274335f15579ba89a40bbb2aeb8))
* **auth:** add google oauth and magic link login ([#58](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/58)) ([a3ed821](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/a3ed8217144ee45979ff09a38b0815096a6acb7d))
* **brand:** design and apply the Vitruvius visual identity ([#63](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/63)) ([5376bc9](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/5376bc9fd571c7526220946f08450f1da57e11f2))
* **cad:** implement BOM map layer (spec 13-bom-map) ([#34](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/34)) ([6f0c5a9](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/6f0c5a96fb6ab81d0e8280a1baaf601620a08c65))
* **cad:** implement digital-model ingestion (spec 12-cad-ingest) ([#29](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/29)) ([8e24dcf](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/8e24dcfeec0096a44669ff0868b863f99a5a071f))
* **core,db,engine:** manual versioning + enrich job (spec 17) ([#44](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/44)) ([3582bf1](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/3582bf102f70847912d3343ff7e1477e208c54b2))
* **core,engine,web:** add AI regenerate job (spec 16) ([#41](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/41)) ([917170d](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/917170d4c4210f66349ccd7ed32104683e3f4f24))
* **core:** add frozen @vitruvius/core contract (types, zod schemas, enums) ([e26850c](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/e26850ca4b263057c53ae3ea457a7a1d20e55519))
* **core:** extend contract with PartRef and ManualBomItem (spec 01) ([#33](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/33)) ([2e16586](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/2e1658626ca6045e85e787b00a644246f0304edf))
* **db:** Supabase schema + typed data access and job queue (spec 02-db) ([#10](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/10)) ([8fe4b93](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/8fe4b9364470ffcb38cd59b0eb930aeca8ec807f))
* **engine,web:** regenerate structure scope (split/merge) + status-doc alignment ([#50](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/50)) ([cd60439](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/cd604396d41f26907397faa37b372ddb371929d6))
* **engine:** add standalone worker poll loop, stub handlers, and Dockerfile ([4f746b0](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/4f746b0cb5c60c0d924728b48e46a8c8e4e7b500))
* **engine:** run the full process pipeline (spec 07-engine-worker) ([#27](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/27)) ([057428a](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/057428a71ce2f9c18a01eaa498437083587d053a))
* **export:** render manuals to HTML and PDF (spec 09-export) ([#30](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/30)) ([9fa9810](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/9fa981042c4f1210054a2dd5f59ffd6084ce3ac4))
* **infra:** address Copilot feedback on deployment config ([#57](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/57)) ([a134edf](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/a134edf9b4f797da6aa66cfefebf806897b5bc4b))
* **infra:** configure conditional exports and add Fly.io deployment config ([#55](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/55)) ([2af4949](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/2af4949fc76c6660be8ffc7a8e88024d8301f7dc))
* **infra:** swap to Node-based SvelteKit adapter & add Chromium to engine Dockerfile ([#54](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/54)) ([520504e](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/520504e7f4b05f30538210312c2dd8d41a1381be))
* **media:** implement ffmpeg extraction wrappers (spec 04-media) ([#22](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/22)) ([0d13317](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/0d13317596f904e37fb301b53e58c6b9032279c9))
* **storage:** store source video in Cloudflare R2 with Supabase fallback (spec 19) ([#66](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/66)) ([bd98056](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/bd9805688c9af3bb0efdc595eaa06637ba8efdf4))
* **web,core:** BOM disambiguation picker in editor (spec 08) ([#35](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/35)) ([e2e6a3c](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/e2e6a3c0fadf184dc5fee573e84b82ae3d17973b))
* **web,db:** implement user auth and multi-tenancy (spec 15) ([#45](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/45)) ([812ced9](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/812ced99e7064b806180c17f33951818468d813f))
* **web:** complete spec 17 manual versioning (trigger, switcher, freeze) ([#46](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/46)) ([4029415](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/4029415380653d01de64b77c1139ea10c747a49c))
* **web:** implement guided revision editor (spec 08-web-editor) ([#28](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/28)) ([349b4b0](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/349b4b08ce5fd5adc31a5df6875b9e49af28861c))
* **web:** localize remaining auth email placeholders and add i18n lint guard ([#49](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/49)) ([7bd5b7b](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/7bd5b7bf13622a3ba83c81da901ba2769c795699))
* **web:** localize UI in en/it/es/fr with Paraglide ([#48](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/48)) ([4044cbb](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/4044cbba44b9f3db8b1141d181a52b37d04052c1))
* **web:** polish landing, editor, and export pages to premium dark theme ([#39](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/39)) ([48aa56f](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/48aa56f040246fb7c134342cdba120ebe58965c4))
* **web:** scaffold SvelteKit app with Tailwind and contract-driven landing page ([69f09f6](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/69f09f6899d356292a16a6aa7642eaf6ebda4349))
* **web:** upload video and enqueue processing (spec 03-web-upload) ([#19](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/19)) ([4ecd422](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/4ecd422dbe8818c2b1b9cc462ac57254f4b07888))


### Bug Fixes

* **auth:** explicitly set flowType to pkce in database client ([#60](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/60)) ([bfd6b42](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/bfd6b422edfa1122743a6ff4d751a5fad25fa647))
* **auth:** fix google oauth pkce flow and remove use:enhance from logout ([#59](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/59)) ([b4469e0](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/b4469e051709caf0e60df0df7bf427144a46fe83))
* **auth:** fix PKCE session persistence for Google OAuth and Magic Link ([#61](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/61)) ([fe94079](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/fe940795c72510a6fd44804edd3f17ae02e705c8))
* **brand:** stop the stacked lockup tagline from clipping ([#65](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/65)) ([6e6e9c9](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/6e6e9c9e919a35fb351c82e57bd2d5ca142b2ec8))
* **export:** demote keyframe to a marked reference in schematic PDF (spec 09) ([#51](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/51)) ([485e794](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/485e79452555aa1adf9416408ddec7317202a5fa))
* **infra:** raise web upload body limit and VM memory for video uploads ([#64](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/64)) ([da887d7](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/da887d7a2966279f6281e1e53bcbcac069db4d08))


### Documentation

* add AGENTS.md and CLAUDE.md working rules ([58cea75](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/58cea754f55521aab9803e483f72eab2f5df942b))
* add ARCHITECTURE, INFRA, and DECISIONS ([e4a65b2](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/e4a65b2914d0457e695d5b63bd8d8d2b45b8c34c))
* **ai:** add client alignment assessment from grill-me review ([#18](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/18)) ([9ba65c4](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/9ba65c4f261a04f81229483f98e0cee3deaad1b9))
* **ai:** add go-live checklist for an operational web app ([#53](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/53)) ([0a7c373](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/0a7c373516ac7e729900fa0436c7d75bbf119a1e))
* **ai:** add team organization and PR approval rules ([#32](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/32)) ([33592fd](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/33592fdd5ccc5e750e1eaffc2d439ceee76ba95e))
* **ai:** align docs and specs with client assessment roadmap ([#31](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/31)) ([a9ff668](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/a9ff66893ba81867fcade27b9f052dad95cbf66e))
* **ai:** consolidate agent docs under docs/ai with a PR & CI guide ([#14](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/14)) ([3a0c1b5](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/3a0c1b59e8d52b8e841e8f8485791b6e7ae1c18f))
* **ai:** credit budget, decoupled Critic, and meta-learning loop ([1e04050](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/1e04050550132d04e2b2348ec3984c2c345a5bab))
* **ai:** fix relative links broken by the docs/ai move ([#15](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/15)) ([f91e384](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/f91e384ec7ed89a2968ba807ef27c60b4b64cdf8))
* **ai:** make quality-over-credits precedence explicit ([#11](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/11)) ([4d55128](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/4d551287bfb98a08e6c895566e9488d41cb5ea2b))
* **ai:** record verified go-live gaps from readiness review ([#62](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/62)) ([2774135](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/27741351488777b6931c0d92ca44424a484ecb3c))
* **cad:** add digital-model (CAD) ingestion lane (spec 12) ([#17](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/17)) ([ba2e815](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/ba2e8156bc1cacd1c0ac6c668eea72f495ee0c76))
* **i18n:** retro-document UI localization spec & Decision 13 ([#52](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/52)) ([ac03455](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/ac03455c458fb99820aa5b55442e8510295f5f4f))
* **repo:** flow-first README with pipeline diagram ([#23](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/23)) ([3de2d08](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/3de2d08cc112d2d5d88e22c1f85e013a747ea482))
* **specs:** add spec template and specs 01-09 ([1d67b6f](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/1d67b6faa9aac1016638d3cc34c8969ce6ce75a4))
* **specs:** add user auth and multi-tenant specification ([#36](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/36)) ([65a674c](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/65a674cb2e1933d10214cde4e36999b8bc235fa0))
* write project README ([04fe2d7](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/04fe2d793bcc352603758506f47cf975f395862d))


### Miscellaneous Chores

* **ci:** run database tests against live Supabase and harden Dockerfile ([#37](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/37)) ([faf81a6](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/faf81a6604d1a5e8568081d99dcc983377370c0e))
* **repo:** ignore .idea and scratch ([#69](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/69)) ([c8f6495](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/c8f64953580deb520b3fafa428c3c09725866b1c))
* scaffold pnpm + turborepo monorepo root config ([19cc5cb](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/19cc5cbab62fad8fb8f396db1c1e3f630bd994c6))
* **web:** configure node adapter for hosting ([#56](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/56)) ([5c6940c](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/5c6940c75da051e972f3e2f48511e5dd6055e177))


### Code Refactoring

* **web:** extract BOM part picker component and derive candidates reactive map ([#43](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/43)) ([91d1181](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/91d1181bc38b66e426a8fd3273a121adf0633eda))


### Tests

* **db:** add end-to-end integration testing flow ([#38](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/38)) ([1f48f7e](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/1f48f7e5f8d62d906cf88166a537750dae7e9858))
* **db:** spec 17 enrich integration test + progress doc refresh ([#47](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/47)) ([d6d1aee](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/d6d1aeeaca24e9f9eb4b0fdeacc4b0940db9bef0))


### Continuous Integration

* add typecheck/lint/build workflow ([e7c86ab](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/e7c86ab52048153c1c2b06901679661af37459b4))
* **checks:** bootstrap checks workflow, merge queue, formatting, and PR conventions ([#12](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/12)) ([e470998](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/e47099850f995da46bc80da4ddd01662b5f2ff64))
* **checks:** exclude release-please CHANGELOG.md from Prettier ([#72](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/72)) ([79bab0a](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/79bab0a5906968e49ec442a2dd26c7c9f9f95d19))
* **release:** add release-please and deploy-on-tag workflows ([#68](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/68)) ([14a7477](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/14a7477231987d42a99fbe94ed54234f1ccbd365))
* **release:** authenticate release-please as the org GitHub App ([#70](https://github.com/VentiliiCondivisoOrganization/vitruvius/issues/70)) ([f0bc2e5](https://github.com/VentiliiCondivisoOrganization/vitruvius/commit/f0bc2e57d73af7b1207440b1c71ebdc4b02db2af))
