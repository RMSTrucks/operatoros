# Examples

Real-world examples showing what an OperatorOS vault looks like after active use.

## vault/

A complete vault for "Alex Chen," a fictional freelance web developer running a small agency. This example shows:

- **self/** -- Identity files that tell Claude who it is, what it can do, and who it works for
- **ops/** -- Operational state with a real session handoff, active work threads, known issues, and auto-captured tool failures
- **notes/mocs/** -- Maps of Content organizing knowledge by topic

### What to notice

1. **The session handoff is specific.** It names branches, version numbers, and remaining work. A vague "we worked on some stuff" handoff is useless.

2. **Known issues capture the _why_, not just the _what_.** "Vercel preview deploys don't inherit production env vars" is useful forever. "Set STRIPE_WEBHOOK_SECRET" is useful once.

3. **Tool lessons are auto-captured.** The capture-lessons.sh hook writes these automatically when Bash commands fail. No discipline required.

4. **The principal file has opinions.** "Don't mock the database" and "Fridays are client demo prep" change how Claude behaves. Generic principal files don't help.

5. **MOCs are navigation, not storage.** They point to where knowledge lives, they don't contain the knowledge itself.

### How this vault evolved

- **Day 1:** Setup script created the templates. Alex filled in identity.md and principal.md.
- **Week 1:** Session handoffs started accumulating. Known issues grew from real mistakes.
- **Week 2:** Tool lessons auto-captured. MOCs organized as project count grew.
- **Month 1:** The vault became genuinely useful -- Claude stopped making the same mistakes and started sessions with real context.

The key insight: **you don't build a vault all at once. You build it by working.** The hooks automate the boring parts. You just correct Claude when it's wrong, and those corrections compound.
