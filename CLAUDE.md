# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A multi-page web storefront/app for "5 Star" that sells digital products and merch (ski mask, hoodies, and AI tools: sports picks, stock picks, video splicer) for $5.00 each (500 cents in Stripe). The site is a set of static HTML pages served alongside serverless API functions.

## Deploy / how changes go live

- **Primary host: Vercel.** Any push to the `main` branch of GitHub `MJsales/5-star-links` auto-deploys. There is no build step — HTML files are served as-is and files in `api/` become serverless functions.
- Publish an edit with: `git add -A && git commit -m "..." && git push`
- `render.yaml` defines a *secondary* Render.com Docker service (`5star-downloads`) for the heavier download/splicer backend (`server.js`), health-checked at `/health`. Most edits do not touch this.
- `vercel.json` sets function timeouts: `api/download.js` gets 300s (large video downloads); `api/youtube.js` and `api/transcript.js` get 15s.

## Architecture

Two backends serve the same frontend, split by workload:

1. **Vercel serverless functions (`api/*.js`)** — the everyday backend. Each file exports a single `module.exports = async (req, res) => {...}` handler, manually sets CORS headers, handles the `OPTIONS` preflight, and rejects non-POST. These power payments (`create-payment-intent.js`, `get-balance.js`, `wallets.js` — Stripe), AI content (`ai-picks.js`, `get-odds.js`, `schedule.js`), and YouTube tooling (`youtube.js`, `transcript.js`, `download.js`, `download-clip.js`).
2. **`server.js`** — a standalone Express app (port 4242) for the AI Video Splicer: it shells out via `execFile` to a local `clip-downloader.js`, writes to a temp dir that self-cleans every 30 min, and serves the static site. This is what the Render Docker service runs. It duplicates the Stripe `products` map found in `api/create-payment-intent.js` — **keep the two product lists in sync when prices/products change.**

- **Frontend**: standalone `*.html` pages at the repo root (`index.html`, `cart.html`, `stocks.html`, `jewelry.html`, `video.html`, `ai.html`, etc.). Each is self-contained; navigation is plain links. `auth.js` handles client-side auth. Data for some pages is served from committed JSON (`stocks-data.json`, `sports-data.json`).
- **`app/`** — desktop-app build tooling for the "5star-splicer" (icon generation, Inno Setup `setup.iss`, packaged binaries). Not part of the website deploy; the built `.exe`/binaries are gitignored.

## Secrets

`STRIPE_SECRET_KEY` is required by all Stripe endpoints and is read from `process.env` (never committed — `.env` is gitignored). It is configured in the Vercel and Render dashboards, not in code.

## Notes

- `package.json` has no real test/build scripts (`test` just errors). There is nothing to "build" — treat this as edit-and-push.
- The `.ps1` / `.bat` files at root and the `convert-ico` / `create-favicon` scripts are one-off Windows favicon/icon helpers, not part of runtime.
