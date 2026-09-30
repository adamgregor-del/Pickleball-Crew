"""Automated test suite for Pickleball Organizer App.
Tests database operations, API endpoints, waitlist logic, and payment tracking.
"""

import unittest
import database
import json
import os
import shutil

class TestPickleballApp(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Use a fresh test database
        cls.orig_db_path = database.DB_PATH
        cls.test_db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_pickleball.db")
        database.DB_PATH = cls.test_db_path
        if os.path.exists(cls.test_db_path):
            os.remove(cls.test_db_path)
        database.init_db()

    @classmethod
    def tearDownClass(cls):
        database.DB_PATH = cls.orig_db_path
        if os.path.exists(cls.test_db_path):
            os.remove(cls.test_db_path)

    def test_01_settings(self):
        settings = database.get_all_settings()
        self.assertEqual(settings.get("venmo_handle"), "LGoodrich401")
        self.assertEqual(settings.get("organizer_name"), "Lori")
        self.assertEqual(settings.get("cost_per_person"), "23")
        self.assertEqual(settings.get("courts"), "2")
        self.assertEqual(settings.get("default_max_players"), "8")

    def test_02_sessions_seeded(self):
        sessions = database.get_sessions()
        self.assertGreaterEqual(len(sessions), 6)
        first_session = sessions[0]
        self.assertIn("Woburn Racket Club", first_session["location"])
        self.assertIn("9 Webster St", first_session["location"])
        self.assertEqual(first_session["courts"], 2)
        self.assertEqual(first_session["cost_per_person"], 23.0)
        self.assertEqual(first_session["max_players"], 8)
        self.assertEqual(first_session["spots_remaining"], 8)
        self.assertEqual(first_session["confirmed_count"], 0)

        # Verify Thanksgiving is skipped
        dates = [s["session_date"] for s in sessions]
        self.assertNotIn("2026-11-26", dates)
        self.assertIn("2026-12-03", dates)
        self.assertIn("2026-12-10", dates)

    def test_03_roster_filling_and_waitlist(self):
        sessions = database.get_sessions()
        session_id = sessions[0]["id"]

        # Sign up 8 players
        player_ids = []
        for i in range(1, 9):
            pid = database.add_signup(session_id, f"Player {i}", f"555-000{i}")
            self.assertIsNotNone(pid)
            player_ids.append(pid)

        sess = database.get_session_by_id(session_id)
        self.assertEqual(sess["confirmed_count"], 8)
        self.assertEqual(sess["spots_remaining"], 0)
        self.assertEqual(sess["waitlist_count"], 0)
        self.assertEqual(len(sess["confirmed_players"]), 8)

        # 9th player should be put on the waitlist
        waitlist_pid = database.add_signup(session_id, "Player 9 (Sub)", "555-0009")
        self.assertIsNotNone(waitlist_pid)

        sess = database.get_session_by_id(session_id)
        self.assertEqual(sess["confirmed_count"], 8)
        self.assertEqual(sess["waitlist_count"], 1)
        self.assertEqual(len(sess["waitlist_players"]), 1)
        self.assertEqual(sess["waitlist_players"][0]["player_name"], "Player 9 (Sub)")

    def test_04_payment_toggle(self):
        sessions = database.get_sessions()
        session_id = sessions[0]["id"]
        sess = database.get_session_by_id(session_id)

        first_player = sess["confirmed_players"][0]
        self.assertEqual(first_player["paid"], 0)

        # Toggle to Paid
        status = database.toggle_payment_status(first_player["id"])
        self.assertEqual(status, 1)

        sess_updated = database.get_session_by_id(session_id)
        self.assertEqual(sess_updated["paid_count"], 1)

        # Toggle back to Unpaid
        status = database.toggle_payment_status(first_player["id"])
        self.assertEqual(status, 0)

        sess_updated = database.get_session_by_id(session_id)
        self.assertEqual(sess_updated["paid_count"], 0)

        # Mark Paid again
        database.toggle_payment_status(first_player["id"], paid=True)

    def test_05_player_cancellation_and_waitlist_promotion(self):
        sessions = database.get_sessions()
        session_id = sessions[0]["id"]
        sess = database.get_session_by_id(session_id)

        first_player_id = sess["confirmed_players"][0]["id"]
        waitlisted_player_name = sess["waitlist_players"][0]["player_name"]

        # Player 1 drops out
        deleted = database.delete_signup(first_player_id)
        self.assertTrue(deleted)

        # Session should now promote Player 9 into confirmed roster!
        sess_after = database.get_session_by_id(session_id)
        self.assertEqual(sess_after["confirmed_count"], 8)
        self.assertEqual(sess_after["waitlist_count"], 0)

        confirmed_names = [p["player_name"] for p in sess_after["confirmed_players"]]
        self.assertIn(waitlisted_player_name, confirmed_names)

    def test_06_delete_session(self):
        # Add a temporary test session and delete it
        new_id = database.add_session("2026-12-17")
        self.assertIsNotNone(new_id)
        deleted = database.delete_session(new_id)
        self.assertTrue(deleted)
        sess = database.get_session_by_id(new_id)
        self.assertIsNone(sess)

if __name__ == "__main__":
    unittest.main()
