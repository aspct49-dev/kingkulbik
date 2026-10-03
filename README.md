# King Kulbik

Community site for King Kulbik — home page and the monthly Stake leaderboard (code **KINGKULBIK**).
Built from the Figma design with Vite + React + TypeScript.

## Run locally

```bash
npm install
cp .env.example .env.local   # then paste the Stake token into STAKE_API_TOKEN
npm run dev                  # http://localhost:5173
```

`npm run dev` also serves `/api/leaderboard` (see `vite.config.ts`), so the leaderboard works locally
as long as `api.stake.com` is reachable from your network.

## Deploy on Vercel

1. Import this repo in Vercel. The framework preset is detected as **Vite**; keep the defaults
   (build `npm run build`, output `dist`).
2. In **Project → Settings → Environment Variables**, add `STAKE_API_TOKEN` (the Stake affiliate API
   token from Affiliate Program → API) for Production and Preview.
3. Deploy. `vercel.json` routes every page to the app and leaves `/api/*` to the serverless function.

## Leaderboard

- `api/leaderboard.ts` — Vercel Function. Calls Stake's
  [affiliate leaderboard API](https://docs.stake.com/#tag/Affiliate/operation/LeaderboardCsv) with the
  token, masks usernames and attaches prizes. The token never reaches the browser.
- `server/stakeLeaderboard.ts` — the Stake call, CSV parsing, masking and caching.
- `shared/leaderboard.ts` — race rules shared by server and page: the two boards (Weighted Wager Race
  $30,000, Stake Exclusive $10,000), prize per place, and the race window (29th → 28th, UTC).
  Change prizes or dates here.

If the page shows "Live standings are temporarily unavailable", check the function logs in Vercel:
they report Stake's status code (never the token).

## Project layout

```
src/            React app (pages, components, hooks, assets)
api/            Vercel Functions
server/         Server-only code used by the functions and the dev server
shared/         Code used by both server and browser
```
