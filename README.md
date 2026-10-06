# ATMO UI

This React/Vite project is independent from the `atmoMatchups` backend.

1. Copy `.env.example` to `.env`.
2. Set `VITE_API_URL` to the backend URL.
3. Run `npm install` and `npm run dev`.

The backend must allow this UI's origin through its `CLIENT_ORIGIN` setting.

## Current UI behavior

- Attendance is selected by team and supports editing each rep's team lead.
- Team Gaps / Member Stats is grouped and color-coded by team.
- Auto Generate uses the backend's team-first matchup method.
- Create Matchups can organize the available pool by team or by primary gap. Gap mode can be sub-sorted by last-day, current-week, or last-week gap, and each rep card displays all three values plus last worked.

## v3 changes
- Click a member in Team Gaps / Member Stats to expand Talks, Stops, Zips, Presentations, Info, Closes, and all conversion percentages.
- Gap chips use the sheet-style background and dark text colors.
- Create Matchups > By gaps now groups by the actual selected period: Last worked day, Current week, or Last week.


## Rep folding

In Create Matchups, each rep card can be folded or unfolded independently. The toolbar also includes Fold all reps and Unfold all reps controls. Fold state follows the rep when it is dragged between the available pool and a matchup group.


## Google Sheets matchup saving

The **Save matchups to sheet** button sends the current groups to:

```text
POST {VITE_API_URL}/api/matchups
```

The backend writes them to the tab configured by `MATCHUPS_SHEET_NAME` (default: `Daily Matchups`). Saving again on the same date replaces that date's previous rows.

## Deploying to Vercel

This frontend is configured for Vercel with `vercel.json`.

Before deployment, configure this Vercel project environment variable:

```text
VITE_API_URL=https://your-public-backend.example.com
```

The URL must be the public HTTPS address of the ATMO backend. Do not use
`http://localhost:3001` in a Vercel deployment.

CLI deployment:

```powershell
npm install
npm run build
npm install -g vercel
vercel
vercel --prod
```

When prompted, use the current directory as the project root and allow Vercel
to detect Vite. After adding or changing `VITE_API_URL`, redeploy so Vite can
include the value in the production build.

## Store matchups

- Store Matchups uses a spreadsheet-style view matching the backend `Store Matchups` sheet.
- Assigned trainers and their trainees are grouped first when stores are generated.
- Admins can change a rep's trainer directly from the sheet. The rep is automatically moved to that trainer's store when space is available.
- Admins can also move a rep to another store, rename a store, or add an empty store as a manual override.
- Stores are limited to three people in the editor and are saved with the displayed priority order.
