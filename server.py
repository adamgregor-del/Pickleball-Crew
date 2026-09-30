#!/usr/bin/env python3
"""HTTP Server for Pickleball Organizer App.
Provides REST API endpoints and serves static UI files.
"""

import http.server
import json
import mimetypes
import os
import re
import socketserver
import urllib.parse
from datetime import datetime

import database

PORT = 8000
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")


class PickleballRequestHandler(http.server.BaseHTTPRequestHandler):
    def end_headers(self):
        # Enable CORS and disable aggressive caching for development ease
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def send_json(self, data, status_code=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_error_json(self, message, status_code=400):
        self.send_json({"error": message}, status_code)

    def parse_json_body(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length == 0:
                return {}
            raw_body = self.rfile.read(content_length)
            return json.loads(raw_body.decode("utf-8"))
        except Exception as e:
            return None

    def serve_static(self, filepath):
        if not os.path.exists(filepath) or os.path.isdir(filepath):
            filepath = os.path.join(STATIC_DIR, "index.html")

        mime_type, _ = mimetypes.guess_type(filepath)
        if not mime_type:
            mime_type = "application/octet-stream"

        try:
            with open(filepath, "rb") as f:
                content = f.read()
            self.send_response(200)
            self.send_header("Content-Type", mime_type)
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_error(500, f"Error reading file: {str(e)}")

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip("/")
        if not path:
            path = "/"

        # API: Settings
        if path == "/api/settings":
            return self.send_json(database.get_all_settings())

        # API: Sessions list
        if path == "/api/sessions":
            sessions = database.get_sessions()
            return self.send_json(sessions)

        # API: Single session details
        match_session = re.match(r"^/api/sessions/(\d+)$", path)
        if match_session:
            session_id = int(match_session.group(1))
            session = database.get_session_by_id(session_id)
            if not session:
                return self.send_error_json("Session not found", 404)
            return self.send_json(session)

        # Static files
        if path == "/" or path == "/index.html":
            return self.serve_static(os.path.join(STATIC_DIR, "index.html"))

        # Serve other static assets
        clean_path = path.lstrip("/")
        safe_path = os.path.abspath(os.path.join(STATIC_DIR, clean_path))
        if safe_path.startswith(os.path.abspath(STATIC_DIR)) and os.path.exists(safe_path):
            return self.serve_static(safe_path)

        # Default fallback to index.html for SPA routing
        return self.serve_static(os.path.join(STATIC_DIR, "index.html"))

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip("/")
        data = self.parse_json_body()
        if data is None:
            return self.send_error_json("Invalid JSON payload", 400)

        # API: Update settings
        if path == "/api/settings":
            for k, v in data.items():
                database.update_setting(k, str(v))
            return self.send_json({"success": True, "settings": database.get_all_settings()})

        # API: Add new session
        if path == "/api/sessions":
            session_date = data.get("session_date")
            if not session_date:
                return self.send_error_json("session_date is required (YYYY-MM-DD)", 400)
            
            time_slot = data.get("time_slot", "7:00 PM - 9:00 PM")
            location = data.get("location", "Woburn Racket Club")
            courts = int(data.get("courts", 2))
            cost_per_person = float(data.get("cost_per_person", 23.00))
            max_players = int(data.get("max_players", 8))
            notes = data.get("notes", "")

            new_id = database.add_session(
                session_date=session_date,
                time_slot=time_slot,
                location=location,
                courts=courts,
                cost_per_person=cost_per_person,
                max_players=max_players,
                notes=notes,
            )
            if not new_id:
                return self.send_error_json("A session for this date already exists or invalid date.", 400)
            return self.send_json({"success": True, "id": new_id, "session": database.get_session_by_id(new_id)}, 201)

        # API: Signup player for session
        match_signup = re.match(r"^/api/sessions/(\d+)/signup$", path)
        if match_signup:
            session_id = int(match_signup.group(1))
            session = database.get_session_by_id(session_id)
            if not session:
                return self.send_error_json("Session not found", 404)

            player_name = data.get("player_name", "").strip()
            if not player_name:
                return self.send_error_json("Player name is required", 400)

            # Check if name already registered in this session
            existing_names = [p["player_name"].lower() for p in session["confirmed_players"] + session["waitlist_players"]]
            if player_name.lower() in existing_names:
                return self.send_error_json(f"'{player_name}' is already signed up for this date!", 400)

            phone = data.get("phone", "").strip()
            notes = data.get("notes", "").strip()

            signup_id = database.add_signup(session_id, player_name, phone, notes)
            updated_session = database.get_session_by_id(session_id)
            
            # Find the newly added signup to check if they made the confirmed roster or waitlist
            is_waitlist = any(p["id"] == signup_id for p in updated_session["waitlist_players"])

            return self.send_json({
                "success": True,
                "signup_id": signup_id,
                "is_waitlist": is_waitlist,
                "session": updated_session
            }, 201)

        return self.send_error_json("Not found", 404)

    def do_PATCH(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip("/")
        data = self.parse_json_body()
        if data is None:
            data = {}

        # API: Toggle payment status
        match_payment = re.match(r"^/api/signups/(\d+)/payment$", path)
        if match_payment:
            signup_id = int(match_payment.group(1))
            explicit_paid = data.get("paid") if "paid" in data else None
            new_status = database.toggle_payment_status(signup_id, explicit_paid)
            if new_status is None:
                return self.send_error_json("Signup not found", 404)
            return self.send_json({"success": True, "signup_id": signup_id, "paid": new_status})

        return self.send_error_json("Not found", 404)

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip("/")

        # API: Delete player signup
        match_delete = re.match(r"^/api/signups/(\d+)$", path)
        if match_delete:
            signup_id = int(match_delete.group(1))
            deleted = database.delete_signup(signup_id)
            if not deleted:
                return self.send_error_json("Signup not found", 404)
            return self.send_json({"success": True, "deleted_id": signup_id})

        # API: Delete entire session date
        match_delete_sess = re.match(r"^/api/sessions/(\d+)$", path)
        if match_delete_sess:
            session_id = int(match_delete_sess.group(1))
            deleted = database.delete_session(session_id)
            if not deleted:
                return self.send_error_json("Session not found", 404)
            return self.send_json({"success": True, "deleted_session_id": session_id})

        return self.send_error_json("Not found", 404)


class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def run(port=PORT):
    database.init_db()
    server_address = ("", port)
    httpd = ThreadedHTTPServer(server_address, PickleballRequestHandler)
    print(f" Pickleball Organizer Server running on http://localhost:{port}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        httpd.server_close()


if __name__ == "__main__":
    import sys
    port = int(sys.argv[1]) if len(sys.argv) > 1 else PORT
    run(port)
