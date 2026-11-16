# GRE 333 Flashcards

Flashcards for Barron's 333 high-frequency GRE words. Each card has a simple English meaning,
a Bangla meaning (বাংলা অর্থ) and an example sentence.

- **Frontend:** React + Vite + Tailwind CSS v4 + shadcn-style components (`src/`)
- **Backend:** FastAPI + SQLAlchemy (`backend/`), saving to Postgres (or SQLite if Postgres isn't set up)
- **No accounts:** each browser automatically gets its own progress and a sync code (like `K7QM-4ZXP`).
  Enter that code on another device to continue there. If the server can't be reached, progress is kept
  in the browser and sent when it's back.

## Features

- **Today** tab: a daily plan (review → learn new words → test them) and a memory-strength bar (learning / getting stronger / long-term)
- **Your sentence** under each card: write your own sentence or trick; saved and synced
- **Flashcards** with simple English meaning, Bangla meaning, an example sentence and a memory tip (word root or trick)
- **Daily review (spaced repetition):** right answers come back after 3, 7, 16, 35, 90 days; wrong ones tomorrow
- **Quiz:** word → meaning, meaning → word, বাংলা → English, fill in the blank, type the word, GRE "pick 2"
- **Word groups:** 40 families of synonyms (with opposites) and GRE Sentence Equivalence practice
- **Daily goal** ring for new words, day streak, weak-words list
- Works offline and opens instantly (service worker); can be added to the phone home screen

## Run it (two terminals)

```bash
# 1) API on :8000
npm run api            # = cd backend && uv run uvicorn app.main:app --reload --port 8000

# 2) Web app on :5173
npm install            # first time only
npm run dev
```

Open http://localhost:5173

## Use Postgres

By default the API saves to `backend/gre.db` (SQLite). To switch to Postgres:

```bash
docker compose up -d                  # starts Postgres 17 on :5432 (user/pass/db: gre)
cp backend/.env.example backend/.env  # sets DATABASE_URL=postgresql+psycopg://gre:gre@localhost:5432/gre
npm run api
```

Tables are created on startup. `GET /api/health` shows which database is in use.

## One server instead of two

```bash
npm run build && npm run api   # FastAPI serves the built app at http://localhost:8000
```

## Host it online (Render + Neon, free)

1. **Database: Neon.** Sign up at https://neon.tech and create a project. Copy the connection string
   (Dashboard → Connect). It looks like `postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require`.
2. **Code: GitHub.** Create an empty repository on GitHub, then push this folder:
   ```bash
   git remote add origin https://github.com/<you>/gre333-flashcards.git
   git push -u origin main
   ```
3. **App: Render.** Sign up at https://render.com → **New → Blueprint** → choose the repository.
   Render reads `render.yaml`, asks for `DATABASE_URL`: paste the Neon string, then **Apply**.
4. After the build (about 3–5 minutes) the app is live at `https://gre333-flashcards.onrender.com`
   (or a similar name). Every `git push` redeploys automatically.

Free-plan note: Render puts the app to sleep after 15 minutes without visits; the next visit takes
~30–50 seconds to wake it. Progress is never lost: it's in Neon, and also in the browser.

The `Dockerfile` works on any host that runs containers (Railway, Fly.io, a VPS…): set `DATABASE_URL`
and optionally `PORT`.

## Keyboard

`Space` flip · `←` `→` move · `1` still learning · `2` I know it · `S` star · `P` pronounce

## API

| Method | Path | What it does |
|---|---|---|
| POST | `/api/learners` | Create a new sync code |
| GET | `/api/learners/{code}` | Check a sync code exists |
| GET | `/api/progress` | This learner's progress and review days |
| PUT | `/api/progress/{word_id}` | Set `status` (`new`/`learning`/`known`) and/or `starred` |
| POST | `/api/progress/sync` | Merge changes saved while offline (newer change wins) |
| DELETE | `/api/progress` | Reset this learner's progress |

Progress endpoints need the header `X-Sync-Code: XXXX-XXXX`.

Word data lives in `src/data/words-*.ts`. Edit a meaning there to change it.
