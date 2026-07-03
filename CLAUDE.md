# LifeFlow — repo conventions

- **Bump the version on every commit.** Increment the patch version in
  `package.json` (`npm pkg set version=x.y.z`) as part of each commit. The
  header displays `v{version} · {commit sha}` (injected in `vite.config.ts`),
  so the user can verify which build their installed PWA is running.
- The default branch is `master` (there is no `main`). Feature work happens on
  `claude/*` branches and is merged to `master` when the user asks.
- Supabase migrations are append-only numbered files in `supabase/`; never
  edit an existing migration — add the next number. Remind the user to run
  new migrations in the Supabase SQL editor.
- `src/components/debug-console.tsx` is a TEMPORARY mobile debugging aid —
  remove it (and its mount in App.tsx) when the testing phase ends.
- Test UI changes with the Playwright scripts in the session scratchpad
  pattern: dev/preview server on :5199 + route-mocked Supabase fixtures;
  check horizontal overflow at 375px and console errors on every tab.
