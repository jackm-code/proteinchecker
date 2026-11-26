# Lift Log

Jack's training, food and body tracker in one phone app. Replaces Hevy and the old Protein Tracker.

- **Train:** routines A/B/C, warm-up and cool-down checklists, automatic ramp-up sets, rest timer (survives the phone locking), "Previous" column, suggested starting weights (double progression), cardio logging.
- **Food:** protein target across four eating windows, quick add, recent foods, 14-day chart and streak (ported from the Protein Tracker).
- **Body:** weight, waist, body fat and InBody scans, with trends.
- **Progress:** what improved, weakest muscle groups, weekly sets per muscle, estimated 1RM charts, strength relative to bodyweight.
- **More:** sign in and sync, CSV/JSON export, weekly snapshot for Claude's review, Hevy CSV import.

## How data is stored

Offline-first. Everything saves on the phone straight away and uploads to Supabase when signed in and online, so bad gym signal never loses a set. Barbell lifts store plates (`kg`) and the bar (`bar_kg`) separately.

Schema: `supabase/migrations/0001_fitness_init.sql`. Every table has row-level security, so each account only sees its own rows.

## Develop

```bash
npm install
npm run dev      # local dev server
npm test         # training maths tests
npm run build    # production build in dist/
```

Supabase settings are in `.env.production` (URL and publishable key, which are safe to ship). Pushing to `main` deploys to GitHub Pages.

## Weekly review

Download the week's snapshot from **More → Export**, or have Claude read the Supabase tables directly. Claude writes a review into `weekly_reviews` (shown on the Progress tab) and updates next week's `routines`.
