# Sachkunde Trainer — PWA (GitHub Pages)

This ZIP contains the PWA scaffolding files you need for GitHub Pages.

## What’s inside
- `src/App.tsx` — your updated app (includes SW registration for GitHub Pages base path)
- `public/sw.js` — service worker (offline cache)
- `public/manifest.webmanifest` — PWA manifest
- `public/logo.png` — your club logo placeholder (replace with your real logo if empty)
- `.github/workflows/deploy.yml` — GitHub Actions workflow to build+deploy to GitHub Pages
- `vite.config.github-pages.snippet.ts` — Vite base-path snippet
- `index.head.pwa.snippet.html` — head snippet for `index.html`

## How to use in your repo
1. Copy `src/App.tsx` into your project.
2. Copy `public/sw.js`, `public/manifest.webmanifest`, and `public/logo.png` into your project’s `public/`.
3. Update `vite.config.ts` to set `base: '/<REPO_NAME>/'` (see `vite.config.github-pages.snippet.ts`).
4. Update `index.html` `<head>` to include manifest + apple-touch-icon links (see `index.head.pwa.snippet.html`).
5. Add `.github/workflows/deploy.yml`.
6. In GitHub: Settings → Pages → Source: GitHub Actions.

## Updating later
- When you change assets/questions, bump the version inside `public/sw.js` (VERSION) to force clients to refresh the cache.
