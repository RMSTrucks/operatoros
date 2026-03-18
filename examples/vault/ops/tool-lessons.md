---
title: Tool Lessons
description: Auto-captured failures from the capture-lessons hook
type: ops
updated: 2026-03-15
---

# Tool Lessons

*These entries are auto-captured by the capture-lessons.sh hook when Bash commands fail.*

## 2026-03-15: `bun test` exit code 1
**Command:** `bun test src/api/users.test.ts`
**Error:** `TypeError: Cannot read properties of undefined (reading 'id')`
**Lesson:** The test was using a mock user object without the `id` field. Bun's test runner doesn't give helpful stack traces for undefined property access — always check mock objects match the expected shape.

## 2026-03-14: `git push` exit code 128
**Command:** `git push origin feat/image-fix`
**Error:** `remote: Permission denied to alexchen-bot`
**Lesson:** GitHub CLI was authenticated as the bot account, not Alex's account. Run `gh auth status` to verify which account is active before pushing.

## 2026-03-12: `npx prisma migrate deploy` exit code 1
**Command:** `npx prisma migrate deploy`
**Error:** `Error: P3009 migrate found failed migrations`
**Lesson:** A previous migration had failed and left a dirty state. Fix: `npx prisma migrate resolve --rolled-back <migration_name>` then retry. Don't delete migration files — Prisma tracks them by name.

## 2026-03-10: `vercel deploy --prod` exit code 1
**Command:** `vercel deploy --prod`
**Error:** `Error: Missing required env var: STRIPE_WEBHOOK_SECRET`
**Lesson:** Vercel preview deploys don't inherit production env vars. Set env vars for both environments. Added to known-issues.md.
