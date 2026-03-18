---
title: Known Issues
description: Gotchas, traps, and things that will bite future sessions
type: ops
updated: 2026-03-15
---

# Known Issues

## Vercel Deploy Gotchas

### Image Optimization Loader
**Added:** 2026-03-15
Meridian project uses `next/image` with a custom loader for Cloudinary. The default Vercel image optimization conflicts. Must set `images.unoptimized: true` in next.config.js OR use the Cloudinary loader explicitly. We chose the Cloudinary loader.

### Environment Variables
**Added:** 2026-03-12
Vercel preview deploys don't inherit production env vars by default. Every new env var must be explicitly set for Preview AND Production environments. Got burned on this with the Stripe webhook secret.

## Database

### Bolt Client — Postgres Connection Pooling
**Added:** 2026-03-08
Bolt's Neon Postgres has a 100 connection limit on the free tier. The tRPC migration adds more concurrent queries. If we see "too many connections" errors, add connection pooling via Neon's pooler endpoint (port 5432 -> 6543).

## Testing

### Playwright — Toast Notification Race
**Added:** 2026-03-15
**Fixed:** 2026-03-15
Contact form test was flaky because we asserted the toast before the form submission response arrived. Always `waitForResponse()` before asserting UI state that depends on a network call.

## Git

### Force Push Protection
**Added:** 2026-03-10
Alex enabled force push protection on all client repos. Don't `git push --force` to main. Use `--force-with-lease` on feature branches if absolutely necessary.
