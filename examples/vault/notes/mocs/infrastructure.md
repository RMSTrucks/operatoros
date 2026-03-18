---
title: Infrastructure MOC
description: Map of Content for services, deployments, databases, and dev environment
type: moc
created: 2026-03-10
updated: 2026-03-15
---

# Infrastructure

## Hosting & Deployment
- All client sites deploy to **Vercel** (alexchen-dev team)
- Databases on **Neon Postgres** (free tier, 100 connection limit)
- Media assets on **Cloudinary** (Meridian) or **S3** (Bolt)
- DNS managed through **Cloudflare** for all client domains

## Local Development
- Node.js 22 via nvm
- Bun 1.3 for scripts and testing
- Docker Desktop for Postgres local dev
- pnpm for package management (not npm, not yarn)

## CI/CD
- GitHub Actions on all repos
- Playwright for E2E tests (runs in Actions, not locally)
- Lint + typecheck on every PR
- Auto-deploy to Vercel on merge to main

## Key Notes
- [[known-issues]] has Vercel-specific gotchas
- [[tool-lessons]] captures CI failures automatically
- Bolt client connection pooling issue documented in known-issues
