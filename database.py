"""Database layer for Pickleball Signup App.
Handles SQLite schema, connection management, seed sessions, and CRUD operations.
"""

import sqlite3
import os
from datetime import datetime, timedelta

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pickleball.db")


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def init_db():
    conn = get_db_connection()
    with conn:
        # Settings table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
        """)

        # Sessions table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_date TEXT NOT NULL UNIQUE,
                day_of_week TEXT NOT NULL DEFAULT 'Thursday',
                time_slot TEXT NOT NULL DEFAULT '7:00 PM - 9:00 PM',
                location TEXT NOT NULL DEFAULT 'Woburn Racket Club',
                courts INTEGER NOT NULL DEFAULT 2,
                cost_per_person REAL NOT NULL DEFAULT 23.00,
                max_players INTEGER NOT NULL DEFAULT 8,
                notes TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # Signups table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS signups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                player_name TEXT NOT NULL,
                phone TEXT DEFAULT '',
                paid INTEGER NOT NULL DEFAULT 0,
                paid_at TIMESTAMP,
                notes TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
            );
        """)

        # Initialize default settings if missing
        default_settings = {
            "venmo_handle": "LGoodrich401",
            "organizer_name": "Lori",
            "cost_per_person": "23",
            "location": "Woburn Racket Club, 9 Webster St, Woburn, MA 01801",
            "courts": "2",
            "time_slot": "7:00 PM - 9:00 PM",
            "default_max_players": "8",
        }
        for key, val in default_settings.items():
            conn.execute(
                "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
                (key, val),
            )

        # Seed upcoming Thursdays if no sessions exist
        cursor = conn.execute("SELECT COUNT(*) as count FROM sessions")
        if cursor.fetchone()["count"] == 0:
            seed_upcoming_thursdays(conn)

    conn.close()


def seed_upcoming_thursdays(conn):
    """Seed 8 weeks of Thursday sessions starting Thursday, October 15th, skipping Thanksgiving."""
    start_date = datetime(2026, 10, 15).date()
    weeks_added = 0
    week_offset = 0

    while weeks_added < 8:
        current_thursday = start_date + timedelta(weeks=week_offset)
        week_offset += 1
        # Skip Thanksgiving (Thursday, Nov 26, 2026)
        if current_thursday.month == 11 and current_thursday.day == 26:
            continue

        session_date = current_thursday.strftime("%Y-%m-%d")
        weeks_added += 1
        note = f"Week {weeks_added} of 8 • 2 Courts reserved for doubles play!"

        conn.execute(
            """
            INSERT OR IGNORE INTO sessions 
            (session_date, day_of_week, time_slot, location, courts, cost_per_person, max_players, notes)
            VALUES (?, 'Thursday', '7:00 PM - 9:00 PM', 'Woburn Racket Club, 9 Webster St, Woburn, MA 01801', 2, 23.00, 8, ?)
            """,
            (session_date, note),
        )


def get_all_settings():
    conn = get_db_connection()
    rows = conn.execute("SELECT key, value FROM settings").fetchall()
    conn.close()
    return {row["key"]: row["value"] for row in rows}


def update_setting(key, value):
    conn = get_db_connection()
    with conn:
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, str(value)),
        )
    conn.close()


def get_sessions():
    conn = get_db_connection()
    query = """
        SELECT 
            s.*,
            COUNT(su.id) AS total_signups,
            SUM(CASE WHEN su.paid = 1 THEN 1 ELSE 0 END) AS paid_count
        FROM sessions s
        LEFT JOIN signups su ON s.id = su.session_id
        GROUP BY s.id
        ORDER BY s.session_date ASC
    """
    rows = conn.execute(query).fetchall()
    conn.close()

    sessions = []
    for r in rows:
        d = dict(r)
        d["paid_count"] = d["paid_count"] or 0
        d["unpaid_count"] = d["total_signups"] - d["paid_count"]
        d["confirmed_count"] = min(d["total_signups"], d["max_players"])
        d["waitlist_count"] = max(0, d["total_signups"] - d["max_players"])
        d["spots_remaining"] = max(0, d["max_players"] - d["total_signups"])
        sessions.append(d)
    return sessions


def get_session_by_id(session_id):
    conn = get_db_connection()
    session = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
    if not session:
        conn.close()
        return None

    session_dict = dict(session)

    signups = conn.execute(
        """
        SELECT * FROM signups 
        WHERE session_id = ? 
        ORDER BY created_at ASC, id ASC
        """,
        (session_id,),
    ).fetchall()
    conn.close()

    confirmed = []
    waitlist = []
    max_players = session_dict["max_players"]

    for idx, s in enumerate(signups):
        item = dict(s)
        if idx < max_players:
            item["roster_spot"] = idx + 1
            item["is_waitlist"] = False
            confirmed.append(item)
        else:
            item["waitlist_spot"] = (idx - max_players) + 1
            item["is_waitlist"] = True
            waitlist.append(item)

    session_dict["confirmed_players"] = confirmed
    session_dict["waitlist_players"] = waitlist
    session_dict["total_signups"] = len(signups)
    session_dict["confirmed_count"] = len(confirmed)
    session_dict["waitlist_count"] = len(waitlist)
    session_dict["spots_remaining"] = max(0, max_players - len(confirmed))
    session_dict["paid_count"] = sum(1 for s in signups if s["paid"] == 1)
    session_dict["unpaid_count"] = len(signups) - session_dict["paid_count"]
    session_dict["total_collected"] = session_dict["paid_count"] * session_dict["cost_per_person"]
    session_dict["expected_total"] = session_dict["confirmed_count"] * session_dict["cost_per_person"]

    return session_dict


def add_session(session_date, time_slot="7:00 PM - 9:00 PM", location="Woburn Racket Club", courts=2, cost_per_person=23.00, max_players=8, notes=""):
    conn = get_db_connection()
    try:
        # Determine day of week
        dt = datetime.strptime(session_date, "%Y-%m-%d")
        day_of_week = dt.strftime("%A")
        with conn:
            cursor = conn.execute(
                """
                INSERT INTO sessions (session_date, day_of_week, time_slot, location, courts, cost_per_person, max_players, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (session_date, day_of_week, time_slot, location, courts, cost_per_person, max_players, notes),
            )
            session_id = cursor.lastrowid
        conn.close()
        return session_id
    except sqlite3.IntegrityError:
        conn.close()
        return None


def add_signup(session_id, player_name, phone="", notes=""):
    player_name = player_name.strip()
    if not player_name:
        return None

    conn = get_db_connection()
    with conn:
        cursor = conn.execute(
            """
            INSERT INTO signups (session_id, player_name, phone, notes)
            VALUES (?, ?, ?, ?)
            """,
            (session_id, player_name, phone.strip(), notes.strip()),
        )
        signup_id = cursor.lastrowid
    conn.close()
    return signup_id


def toggle_payment_status(signup_id, paid=None):
    conn = get_db_connection()
    with conn:
        curr = conn.execute("SELECT paid FROM signups WHERE id = ?", (signup_id,)).fetchone()
        if not curr:
            conn.close()
            return None

        if paid is None:
            new_paid = 0 if curr["paid"] == 1 else 1
        else:
            new_paid = 1 if paid else 0

        paid_at = datetime.now().isoformat() if new_paid == 1 else None
        conn.execute(
            "UPDATE signups SET paid = ?, paid_at = ? WHERE id = ?",
            (new_paid, paid_at, signup_id),
        )
    conn.close()
    return new_paid


def delete_signup(signup_id):
    conn = get_db_connection()
    with conn:
        cursor = conn.execute("DELETE FROM signups WHERE id = ?", (signup_id,))
        deleted = cursor.rowcount > 0
    conn.close()
    return deleted


def delete_session(session_id):
    conn = get_db_connection()
    with conn:
        cursor = conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
        deleted = cursor.rowcount > 0
    conn.close()
    return deleted


if __name__ == "__main__":
    init_db()
    print("Database initialized successfully.")
    print("Settings:", get_all_settings())
    print("Sessions:", len(get_sessions()))
