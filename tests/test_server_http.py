"""Integration tests testing the HTTP server directly."""

import urllib.request
import urllib.parse
import json
import subprocess
import time
import os
import sys

def run_integration_tests():
    server_process = subprocess.Popen(
        [sys.executable, "server.py", "8085"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )
    time.sleep(1)

    base_url = "http://localhost:8085"

    try:
        # Test 1: Fetch static HTML
        with urllib.request.urlopen(f"{base_url}/") as resp:
            html = resp.read().decode("utf-8")
            assert "Pickleball" in html
            assert "Woburn Racket Club" in html
            print("✓ Static index.html served correctly")

        # Test 2: Fetch settings
        with urllib.request.urlopen(f"{base_url}/api/settings") as resp:
            settings = json.loads(resp.read().decode("utf-8"))
            assert settings["venmo_handle"] == "LGoodrich401"
            assert settings["organizer_name"] == "Lori"
            print("✓ GET /api/settings returned correct config")

        # Test 3: Fetch sessions
        with urllib.request.urlopen(f"{base_url}/api/sessions") as resp:
            sessions = json.loads(resp.read().decode("utf-8"))
            assert len(sessions) >= 6
            print(f"✓ GET /api/sessions returned {len(sessions)} sessions")

        # Test 4: Sign up a player
        session_id = sessions[0]["id"]
        signup_data = json.dumps({"player_name": "Dave Miller", "phone": "617-555-0199", "notes": "Ready to play"}).encode("utf-8")
        req = urllib.request.Request(
            f"{base_url}/api/sessions/{session_id}/signup",
            data=signup_data,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req) as resp:
            res_json = json.loads(resp.read().decode("utf-8"))
            assert res_json["success"] is True
            signup_id = res_json["signup_id"]
            print(f"✓ POST /api/sessions/{session_id}/signup succeeded (signup_id: {signup_id})")

        # Test 5: Toggle payment
        pay_data = json.dumps({"paid": True}).encode("utf-8")
        req_pay = urllib.request.Request(
            f"{base_url}/api/signups/{signup_id}/payment",
            data=pay_data,
            headers={"Content-Type": "application/json"},
            method="PATCH"
        )
        with urllib.request.urlopen(req_pay) as resp:
            res_pay = json.loads(resp.read().decode("utf-8"))
            assert res_pay["paid"] == 1
            print(f"✓ PATCH /api/signups/{signup_id}/payment marked player as PAID")

        # Test 6: Verify session roster reflects player and payment
        with urllib.request.urlopen(f"{base_url}/api/sessions/{session_id}") as resp:
            sess_detail = json.loads(resp.read().decode("utf-8"))
            assert sess_detail["paid_count"] == 1
            assert sess_detail["confirmed_players"][0]["player_name"] == "Dave Miller"
            assert sess_detail["confirmed_players"][0]["paid"] == 1
            print("✓ GET /api/sessions/:id reflects updated player and payment")

        # Clean up created signup
        del_req = urllib.request.Request(f"{base_url}/api/signups/{signup_id}", method="DELETE")
        with urllib.request.urlopen(del_req) as resp:
            assert resp.status == 200
            print("✓ DELETE /api/signups/:id cleaned up test signup")

        print("\n ALL HTTP INTEGRATION TESTS PASSED SUCCESSFULLY!")

    finally:
        server_process.terminate()
        server_process.wait()

if __name__ == "__main__":
    run_integration_tests()
