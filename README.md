# Woburn Racket Club Pickleball Organizer & Venmo Sign-Up App

A mobile-friendly, real-time web application to organize weekly pickleball sessions for 8–10 players at **Woburn Racket Club** (9 Webster St, Woburn, MA 01801 • 2 courts, Thursdays 7:00–9:00 PM, $23 per person).

- **Live Site**: [https://picklecrew.netlify.app](https://picklecrew.netlify.app)

## Features

- **8-Week Thursday Playing Schedule**: 
  - Starts **Thursday, October 15th** (skipping Thanksgiving).
  - Clean date carousel showing spots remaining for each week.
- **Smart Date Management**:
  - **+ Add Date**: Automatically calculates and defaults to the next Thursday following your last scheduled session.
  - **🗑️ Remove Date**: Delete any date with confirmation.
- **Venmo Payment Integration**:
  - Configured for **Lori** (`@LGoodrich401`) at **$23.00 / player**.
  - Immediate pop-up card after signup with direct mobile deep-link (`venmo://...`) and desktop QR code.
  - One-tap **"✓ I Paid via Venmo (Mark Paid)"** button.
- **Roster & Automatic Waitlist**:
  - 8 confirmed spots (Courts 1 & 2).
  - Spots 9+ are placed on an automatic waitlist (`W1`, `W2`, ...) and automatically promoted if someone drops out.
- **Paid / Unpaid Tracking**:
  - Toggle player status between `✓ Paid` and `○ Unpaid` with a single click.
  - Total dollars collected is kept private and omitted from the interface.
- **Group Sharing**:
  - **"📋 Share"**: One-click copy of a pre-formatted group invitation with date, time, address, and link.
  - **"📋 Copy Roster"**: Copies current lineup and court assignments to clipboard.

## Quick Start

### 1. Start the Server
Run using standard Python (no external pip dependencies needed):

```bash
python3 server.py
```

The app will start on: **http://localhost:8000**

### 2. Open in Browser
Open `http://localhost:8000` in your web browser (or on your phone's browser if on the same local Wi-Fi).

### 3. Share with Players
Send your link or tap **"📋 Share"** in the app to copy the formatted text invite to your player group chat!
