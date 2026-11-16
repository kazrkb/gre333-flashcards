"""GRE 333 flashcards API.

No user accounts. Each browser gets a learner record identified by a short
sync code (e.g. "K7QM-4ZXP"). Entering the same code on another device shows
the same progress.

Uses Postgres when DATABASE_URL is set, otherwise a local SQLite file.
"""

import json
import os
import secrets
import time
from collections import defaultdict, deque
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import Boolean, Date, DateTime, Integer, String, Text, create_engine, delete, inspect, select, text
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def database_url() -> str:
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        return f"sqlite:///{BASE_DIR / 'gre.db'}"
    # Hosts like Neon/Render hand out postgres:// or postgresql:// URLs; use the psycopg 3 driver.
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


DB_URL = database_url()
# prepare_threshold=None keeps psycopg compatible with pooled (PgBouncer) connections like Neon's.
engine = create_engine(
    DB_URL,
    pool_pre_ping=True,
    pool_recycle=300,
    connect_args={"prepare_threshold": None} if DB_URL.startswith("postgresql+psycopg") else {},
)

Status = Literal["new", "learning", "known"]

# No 0/O/1/I/L so codes are easy to read and type.
CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def as_aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def new_code() -> str:
    raw = "".join(secrets.choice(CODE_ALPHABET) for _ in range(8))
    return f"{raw[:4]}-{raw[4:]}"


def normalize_code(code: str) -> str:
    raw = "".join(ch for ch in code.upper() if ch.isalnum())
    return f"{raw[:4]}-{raw[4:]}" if len(raw) == 8 else ""


class Base(DeclarativeBase):
    pass


class Learner(Base):
    __tablename__ = "learners"

    code: Mapped[str] = mapped_column(String(9), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    # When the Word Smart section was unlocked (all 333 studied, or the unlock test passed).
    ws_unlocked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ws_unlocked_via: Mapped[str | None] = mapped_column(String(16), nullable=True)


class Progress(Base):
    __tablename__ = "word_progress"

    learner: Mapped[str] = mapped_column(String(9), primary_key=True)
    word_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    status: Mapped[str] = mapped_column(String(16), default="new")
    starred: Mapped[bool] = mapped_column(Boolean, default=False)
    reviews: Mapped[int] = mapped_column(Integer, default=0)
    level: Mapped[int] = mapped_column(Integer, default=0)  # spaced-repetition box, 0 = never reviewed
    due: Mapped[date | None] = mapped_column(Date, nullable=True)  # next review date
    misses: Mapped[int] = mapped_column(Integer, default=0)  # times answered wrong
    first_seen: Mapped[date | None] = mapped_column(Date, nullable=True)  # day first studied (daily goal)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)  # learner's own sentence / memory trick
    misspells: Mapped[int] = mapped_column(Integer, default=0)  # wrong spellings since last correct one
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ReviewDay(Base):
    """How many cards a learner reviewed on each day (for the streak)."""

    __tablename__ = "review_log"

    learner: Mapped[str] = mapped_column(String(9), primary_key=True)
    day: Mapped[date] = mapped_column(Date, primary_key=True)
    count: Mapped[int] = mapped_column(Integer, default=0)


class QuizResult(Base):
    """One finished quiz. `client_id` is made by the browser so a result saved offline is never stored twice."""

    __tablename__ = "quiz_results"

    learner: Mapped[str] = mapped_column(String(9), primary_key=True)
    client_id: Mapped[str] = mapped_column(String(40), primary_key=True)
    taken_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    title: Mapped[str] = mapped_column(String(80), default="Quiz")
    mode: Mapped[str] = mapped_column(String(24), default="mixed")
    score: Mapped[int] = mapped_column(Integer, default=0)
    total: Mapped[int] = mapped_column(Integer, default=0)
    words: Mapped[str] = mapped_column(Text, default="[]")  # JSON list of word ids
    missed: Mapped[str] = mapped_column(Text, default="[]")  # JSON list of word ids


Base.metadata.create_all(engine)


def migrate():
    """Add columns introduced after the first release to existing tables (Postgres or SQLite)."""
    added = {
        "word_progress": {
            "level": "INTEGER NOT NULL DEFAULT 0",
            "due": "DATE",
            "misses": "INTEGER NOT NULL DEFAULT 0",
            "first_seen": "DATE",
            "note": "TEXT",
            "misspells": "INTEGER NOT NULL DEFAULT 0",
        },
        "learners": {
            "ws_unlocked_at": "TIMESTAMP WITH TIME ZONE" if engine.dialect.name == "postgresql" else "DATETIME",
            "ws_unlocked_via": "VARCHAR(16)",
        },
    }
    with engine.begin() as conn:
        for table, columns in added.items():
            have = {c["name"] for c in inspect(conn).get_columns(table)}
            for name, ddl in columns.items():
                if name not in have:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))


migrate()


# ---------- simple in-memory rate limit (per IP) for code creation / lookup ----------
_hits: dict[str, deque[float]] = defaultdict(deque)


def rate_limit(request: Request, limit: int = 20, window: float = 60.0):
    fwd = request.headers.get("x-forwarded-for", "")
    ip = fwd.split(",")[0].strip() or (request.client.host if request.client else "?")
    now = time.monotonic()
    q = _hits[ip]
    while q and now - q[0] > window:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(429, "Too many requests, please wait a minute.")
    q.append(now)


# ---------- schemas ----------
class ProgressIn(BaseModel):
    status: Status | None = None
    starred: bool | None = None
    level: int | None = Field(default=None, ge=0, le=10)
    due: date | None = None
    misses: int | None = Field(default=None, ge=0, le=100000)
    first_seen: date | None = None
    note: str | None = Field(default=None, max_length=500)
    misspells: int | None = Field(default=None, ge=0, le=100000)
    reviewed: bool = False  # true when the learner just answered this card
    updated_at: datetime | None = None
    day: date | None = None  # learner's local date, for the streak


class ProgressOut(BaseModel):
    status: Status
    starred: bool
    reviews: int
    level: int
    due: date | None
    misses: int
    first_seen: date | None
    note: str | None
    misspells: int = 0
    updated_at: datetime


class SyncIn(BaseModel):
    items: dict[str, ProgressIn] = Field(default_factory=dict)
    days: dict[date, int] = Field(default_factory=dict)  # reviews done while offline


class SyncOut(BaseModel):
    progress: dict[str, ProgressOut]
    days: dict[date, int]


class LearnerOut(BaseModel):
    code: str


app = FastAPI(title="GRE 333 Flashcards API")
# Compress responses (the app bundle with all word data shrinks ~70%).
app.add_middleware(GZipMiddleware, minimum_size=1000)


def learner_code(x_sync_code: str = Header(default="")) -> str:
    code = normalize_code(x_sync_code)
    if not code:
        raise HTTPException(400, "Missing or invalid sync code")
    with Session(engine) as db:
        learner = db.get(Learner, code)
        if learner is None:
            raise HTTPException(404, "Sync code not found")
        learner.last_seen = utcnow()
        db.commit()
    return code


def to_out(p: Progress) -> ProgressOut:
    return ProgressOut(
        status=p.status,
        starred=p.starred,
        reviews=p.reviews or 0,
        level=p.level or 0,
        due=p.due,
        misses=p.misses or 0,
        first_seen=p.first_seen,
        note=p.note,
        misspells=p.misspells or 0,
        updated_at=as_aware(p.updated_at),
    )


def snapshot(db: Session, code: str) -> SyncOut:
    progress = {p.word_id: to_out(p) for p in db.scalars(select(Progress).where(Progress.learner == code))}
    days = {d.day: d.count for d in db.scalars(select(ReviewDay).where(ReviewDay.learner == code))}
    return SyncOut(progress=progress, days=days)


def add_reviews(db: Session, code: str, day: date, n: int):
    if n <= 0:
        return
    row = db.get(ReviewDay, (code, day))
    if row is None:
        db.add(ReviewDay(learner=code, day=day, count=n))
    else:
        row.count += n


def apply(db: Session, code: str, word_id: str, body: ProgressIn, *, only_if_newer: bool = False) -> Progress:
    row = db.get(Progress, (code, word_id))
    stamp = as_aware(body.updated_at) if body.updated_at else utcnow()
    if stamp > utcnow() + timedelta(minutes=5):  # don't trust clocks far in the future
        stamp = utcnow()
    if row is None:
        row = Progress(
            learner=code, word_id=word_id, status="new", starred=False, reviews=0, level=0, misses=0, updated_at=stamp
        )
        db.add(row)
    elif only_if_newer and as_aware(row.updated_at) >= stamp:
        return row
    if body.status is not None:
        row.status = body.status
    if body.starred is not None:
        row.starred = body.starred
    if body.level is not None:
        row.level = body.level
    if body.due is not None:
        row.due = body.due
    if body.misses is not None:
        row.misses = body.misses
    if body.first_seen is not None and row.first_seen is None:
        row.first_seen = body.first_seen
    if body.misspells is not None:
        row.misspells = body.misspells
    if body.note is not None:
        row.note = body.note.strip() or None  # empty text clears the note
    if body.reviewed:
        row.reviews = (row.reviews or 0) + 1
        add_reviews(db, code, body.day or date.today(), 1)
    row.updated_at = stamp
    return row


# ---------- routes ----------
@app.get("/api/health")
def health():
    return {"ok": True, "database": engine.dialect.name}


@app.post("/api/learners", response_model=LearnerOut, dependencies=[Depends(rate_limit)])
def create_learner():
    with Session(engine) as db:
        for _ in range(10):
            code = new_code()
            if db.get(Learner, code) is None:
                db.add(Learner(code=code))
                db.commit()
                return LearnerOut(code=code)
    raise HTTPException(500, "Could not create a sync code")


@app.get("/api/learners/{code}", response_model=LearnerOut, dependencies=[Depends(rate_limit)])
def check_learner(code: str):
    norm = normalize_code(code)
    with Session(engine) as db:
        if not norm or db.get(Learner, norm) is None:
            raise HTTPException(404, "Sync code not found")
    return LearnerOut(code=norm)


@app.get("/api/progress", response_model=SyncOut)
def get_progress(code: str = Depends(learner_code)):
    with Session(engine) as db:
        return snapshot(db, code)


@app.put("/api/progress/{word_id}", response_model=ProgressOut)
def put_progress(word_id: str, body: ProgressIn, code: str = Depends(learner_code)):
    if len(word_id) > 64:
        raise HTTPException(400, "word id too long")
    with Session(engine) as db:
        row = apply(db, code, word_id, body)
        db.commit()
        db.refresh(row)
        return to_out(row)


@app.post("/api/progress/sync", response_model=SyncOut)
def sync_progress(body: SyncIn, code: str = Depends(learner_code)):
    """Merge progress saved in the browser while offline; the newer change wins."""
    if len(body.items) > 1000 or len(body.days) > 3660:
        raise HTTPException(400, "too many items")
    with Session(engine) as db:
        for word_id, item in body.items.items():
            if len(word_id) <= 64:
                apply(db, code, word_id, item.model_copy(update={"reviewed": False}), only_if_newer=True)
        for day, n in body.days.items():
            add_reviews(db, code, day, min(n, 2000))
        db.commit()
        return snapshot(db, code)


@app.delete("/api/progress")
def reset_progress(code: str = Depends(learner_code)):
    with Session(engine) as db:
        db.execute(delete(Progress).where(Progress.learner == code))
        db.execute(delete(ReviewDay).where(ReviewDay.learner == code))
        db.execute(delete(QuizResult).where(QuizResult.learner == code))
        learner = db.get(Learner, code)
        if learner is not None:  # a full reset also locks Word Smart again
            learner.ws_unlocked_at = None
            learner.ws_unlocked_via = None
        db.commit()
    return {"ok": True}


class LearnerState(BaseModel):
    code: str
    ws_unlocked_at: datetime | None
    ws_unlocked_via: str | None


class UnlockIn(BaseModel):
    via: Literal["completed", "test"]


def learner_state(learner: Learner) -> LearnerState:
    return LearnerState(
        code=learner.code,
        ws_unlocked_at=as_aware(learner.ws_unlocked_at) if learner.ws_unlocked_at else None,
        ws_unlocked_via=learner.ws_unlocked_via,
    )


@app.get("/api/me", response_model=LearnerState)
def get_me(code: str = Depends(learner_code)):
    with Session(engine) as db:
        return learner_state(db.get(Learner, code))


@app.post("/api/me/unlock", response_model=LearnerState)
def unlock_word_smart(body: UnlockIn, code: str = Depends(learner_code)):
    """Unlock the Word Smart section (after studying all 333 words, or passing the unlock test)."""
    with Session(engine) as db:
        learner = db.get(Learner, code)
        if learner.ws_unlocked_at is None:
            learner.ws_unlocked_at = utcnow()
            learner.ws_unlocked_via = body.via
            db.commit()
            db.refresh(learner)
        return learner_state(learner)


class QuizIn(BaseModel):
    client_id: str = Field(min_length=6, max_length=40)
    taken_at: datetime
    title: str = Field(max_length=80)
    mode: str = Field(max_length=24)
    score: int = Field(ge=0, le=1000)
    total: int = Field(ge=1, le=1000)
    words: list[str] = Field(default_factory=list, max_length=500)
    missed: list[str] = Field(default_factory=list, max_length=500)


class QuizOut(QuizIn):
    pass


def quiz_out(q: QuizResult) -> QuizOut:
    return QuizOut(
        client_id=q.client_id,
        taken_at=as_aware(q.taken_at),
        title=q.title,
        mode=q.mode,
        score=q.score,
        total=q.total,
        words=json.loads(q.words or "[]"),
        missed=json.loads(q.missed or "[]"),
    )


@app.get("/api/quizzes", response_model=list[QuizOut])
def list_quizzes(limit: int = 200, code: str = Depends(learner_code)):
    """Quiz history, newest first."""
    with Session(engine) as db:
        rows = db.scalars(
            select(QuizResult)
            .where(QuizResult.learner == code)
            .order_by(QuizResult.taken_at.desc())
            .limit(max(1, min(limit, 500)))
        )
        return [quiz_out(q) for q in rows]


@app.post("/api/quizzes", response_model=QuizOut)
def save_quiz(body: QuizIn, code: str = Depends(learner_code)):
    if body.score > body.total:
        raise HTTPException(400, "score is larger than total")
    with Session(engine) as db:
        row = db.get(QuizResult, (code, body.client_id))
        if row is None:  # saving the same quiz twice (e.g. a retry after being offline) is a no-op
            row = QuizResult(
                learner=code,
                client_id=body.client_id,
                taken_at=as_aware(body.taken_at),
                title=body.title,
                mode=body.mode,
                score=body.score,
                total=body.total,
                words=json.dumps(body.words),
                missed=json.dumps(body.missed),
            )
            db.add(row)
            db.commit()
            db.refresh(row)
        return quiz_out(row)


# Serve the built frontend (npm run build) so one server runs the whole app.
DIST = Path(os.getenv("FRONTEND_DIST", BASE_DIR.parent / "dist"))
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(404)
        file = (DIST / path).resolve()
        if path and file.is_file() and DIST.resolve() in file.parents:
            return FileResponse(file)
        return FileResponse(DIST / "index.html")
