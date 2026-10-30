---
name: ship
description: Verify, merge, push and deploy TIB to GitHub Pages, then check the live site. Use only after the user explicitly says "pousse", "déploie", "fusionne et déploie", "ship" or "mets en ligne".
---

# Ship

Outward actions happen only on the user's explicit word. Batch pending adjustments into one ship rather than one deploy per tweak.

## Steps

1. **Verify on the branch:** `npm run check`, `npm run build` (it also checks that no lab code is in `dist/`), `npm run test:e2e`. Stop and report the first failure with its output.
2. **Merge:** `git checkout main && git merge --ff-only <branch>`. If it is not a fast-forward, stop and ask.
3. **Push:** `git push origin main`.
4. **Deploy:** the `pages.yml` workflow should start on the push. Check with `gh run list --workflow pages.yml -L1`; if no run started within a minute, start it with `gh workflow run pages.yml --ref main`. Then `gh run watch <id> --exit-status`.
5. **Check the live site:** the `main-*.js` name in `dist/index.html` must equal the one served by https://guilbill.github.io/incredible-blueprint/ (`curl -s ... | grep -o 'main-[A-Za-z0-9_-]*\.js'`). If they differ, wait for the CDN and check again once.
6. **Clean up:** delete the merged local branch.
7. **Report** in two lines: what is live, and what was verified (tests count, e2e browsers, bundle match).
