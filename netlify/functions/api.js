// Netlify Serverless Function for Woburn Pickleball API

// In-memory store for serverless execution
let memoryStore = {
  settings: {
    venmo_handle: "LGoodrich401",
    organizer_name: "Lori",
    cost_per_person: "23",
    location: "Woburn Racket Club, 9 Webster St, Woburn, MA 01801",
    courts: "2",
    time_slot: "7:00 PM - 9:00 PM",
    default_max_players: "8"
  },
  nextSignupId: 1,
  nextSessionId: 9,
  sessions: [
    { id: 1, session_date: "2026-10-15", day_of_week: "Thursday", time_slot: "7:00 PM - 9:00 PM", location: "Woburn Racket Club, 9 Webster St, Woburn, MA 01801", courts: 2, cost_per_person: 23, max_players: 8, notes: "Week 1 of 8 • 2 Courts reserved for doubles play!" },
    { id: 2, session_date: "2026-10-22", day_of_week: "Thursday", time_slot: "7:00 PM - 9:00 PM", location: "Woburn Racket Club, 9 Webster St, Woburn, MA 01801", courts: 2, cost_per_person: 23, max_players: 8, notes: "Week 2 of 8 • 2 Courts reserved for doubles play!" },
    { id: 3, session_date: "2026-10-29", day_of_week: "Thursday", time_slot: "7:00 PM - 9:00 PM", location: "Woburn Racket Club, 9 Webster St, Woburn, MA 01801", courts: 2, cost_per_person: 23, max_players: 8, notes: "Week 3 of 8 • 2 Courts reserved for doubles play!" },
    { id: 4, session_date: "2026-11-05", day_of_week: "Thursday", time_slot: "7:00 PM - 9:00 PM", location: "Woburn Racket Club, 9 Webster St, Woburn, MA 01801", courts: 2, cost_per_person: 23, max_players: 8, notes: "Week 4 of 8 • 2 Courts reserved for doubles play!" },
    { id: 5, session_date: "2026-11-12", day_of_week: "Thursday", time_slot: "7:00 PM - 9:00 PM", location: "Woburn Racket Club, 9 Webster St, Woburn, MA 01801", courts: 2, cost_per_person: 23, max_players: 8, notes: "Week 5 of 8 • 2 Courts reserved for doubles play!" },
    { id: 6, session_date: "2026-11-19", day_of_week: "Thursday", time_slot: "7:00 PM - 9:00 PM", location: "Woburn Racket Club, 9 Webster St, Woburn, MA 01801", courts: 2, cost_per_person: 23, max_players: 8, notes: "Week 6 of 8 • 2 Courts reserved for doubles play!" },
    { id: 7, session_date: "2026-12-03", day_of_week: "Thursday", time_slot: "7:00 PM - 9:00 PM", location: "Woburn Racket Club, 9 Webster St, Woburn, MA 01801", courts: 2, cost_per_person: 23, max_players: 8, notes: "Week 7 of 8 • 2 Courts reserved for doubles play!" },
    { id: 8, session_date: "2026-12-10", day_of_week: "Thursday", time_slot: "7:00 PM - 9:00 PM", location: "Woburn Racket Club, 9 Webster St, Woburn, MA 01801", courts: 2, cost_per_person: 23, max_players: 8, notes: "Week 8 of 8 • 2 Courts reserved for doubles play!" }
  ],
  signups: []
};

exports.handler = async function (event) {
  const path = event.path.replace(/^\/\.netlify\/functions\/api/, "").replace(/^\/api/, "").replace(/\/$/, "");
  const method = event.httpMethod;

  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS"
  };

  if (method === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  try {
    let body = {};
    if (event.body) {
      try { body = JSON.parse(event.body); } catch (e) {}
    }

    // 1. Settings
    if (path === "/settings" || path === "") {
      if (method === "GET") {
        return { statusCode: 200, headers, body: JSON.stringify(memoryStore.settings) };
      }
      if (method === "POST") {
        memoryStore.settings = { ...memoryStore.settings, ...body };
        return { statusCode: 200, headers, body: JSON.stringify({ success: true, settings: memoryStore.settings }) };
      }
    }

    // 2. Sessions list
    if (path === "/sessions") {
      if (method === "GET") {
        const list = memoryStore.sessions.map(s => {
          const sSignups = memoryStore.signups.filter(su => su.session_id === s.id);
          const paidCount = sSignups.filter(su => su.paid === 1).length;
          const total = sSignups.length;
          const max = s.max_players;
          return {
            ...s,
            total_signups: total,
            paid_count: paidCount,
            unpaid_count: total - paidCount,
            confirmed_count: Math.min(total, max),
            waitlist_count: Math.max(0, total - max),
            spots_remaining: Math.max(0, max - total)
          };
        });
        return { statusCode: 200, headers, body: JSON.stringify(list) };
      }

      if (method === "POST") {
        const sessionDate = body.session_date;
        const newId = memoryStore.nextSessionId++;
        const dt = new Date(sessionDate + "T12:00:00");
        const dayOfWeek = dt.toLocaleDateString("en-US", { weekday: "long" });

        const newSession = {
          id: newId,
          session_date: sessionDate,
          day_of_week: dayOfWeek,
          time_slot: body.time_slot || "7:00 PM - 9:00 PM",
          location: body.location || "Woburn Racket Club, 9 Webster St, Woburn, MA 01801",
          courts: body.courts || 2,
          cost_per_person: body.cost_per_person || 23,
          max_players: body.max_players || 8,
          notes: body.notes || "2 Courts reserved for doubles play!"
        };
        memoryStore.sessions.push(newSession);
        memoryStore.sessions.sort((a, b) => a.session_date.localeCompare(b.session_date));
        return { statusCode: 201, headers, body: JSON.stringify({ success: true, id: newId }) };
      }
    }

    // 3. Single session details
    const matchSession = path.match(/^\/sessions\/(\d+)$/);
    if (matchSession) {
      const sessionId = parseInt(matchSession.group ? matchSession.group(1) : matchSession[1], 10);
      if (method === "GET") {
        const sess = memoryStore.sessions.find(s => s.id === sessionId);
        if (!sess) return { statusCode: 404, headers, body: JSON.stringify({ error: "Session not found" }) };

        const signups = memoryStore.signups.filter(su => su.session_id === sessionId);
        const max = sess.max_players;
        const confirmed = [];
        const waitlist = [];

        signups.forEach((s, idx) => {
          const item = { ...s };
          if (idx < max) {
            item.roster_spot = idx + 1;
            item.is_waitlist = false;
            confirmed.push(item);
          } else {
            item.waitlist_spot = (idx - max) + 1;
            item.is_waitlist = true;
            waitlist.push(item);
          }
        });

        const paidCount = signups.filter(s => s.paid === 1).length;
        const detail = {
          ...sess,
          confirmed_players: confirmed,
          waitlist_players: waitlist,
          total_signups: signups.length,
          confirmed_count: confirmed.length,
          waitlist_count: waitlist.length,
          spots_remaining: Math.max(0, max - confirmed.length),
          paid_count: paidCount,
          unpaid_count: signups.length - paidCount,
          total_collected: paidCount * sess.cost_per_person,
          expected_total: confirmed.length * sess.cost_per_person
        };
        return { statusCode: 200, headers, body: JSON.stringify(detail) };
      }

      if (method === "DELETE") {
        memoryStore.sessions = memoryStore.sessions.filter(s => s.id !== sessionId);
        memoryStore.signups = memoryStore.signups.filter(su => su.session_id !== sessionId);
        return { statusCode: 200, headers, body: JSON.stringify({ success: true, deleted_session_id: sessionId }) };
      }
    }

    // 4. Signup for session
    const matchSignup = path.match(/^\/sessions\/(\d+)\/signup$/);
    if (matchSignup && method === "POST") {
      const sessionId = parseInt(matchSignup[1], 10);
      const playerName = (body.player_name || "").trim();
      if (!playerName) return { statusCode: 400, headers, body: JSON.stringify({ error: "Name is required" }) };

      const signupId = memoryStore.nextSignupId++;
      const newSignup = {
        id: signupId,
        session_id: sessionId,
        player_name: playerName,
        phone: (body.phone || "").trim(),
        notes: (body.notes || "").trim(),
        paid: 0,
        paid_at: null,
        created_at: new Date().toISOString()
      };
      memoryStore.signups.push(newSignup);

      const sess = memoryStore.sessions.find(s => s.id === sessionId);
      const signups = memoryStore.signups.filter(su => su.session_id === sessionId);
      const isWaitlist = signups.length > (sess ? sess.max_players : 8);

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify({ success: true, signup_id: signupId, is_waitlist: isWaitlist, session: sess })
      };
    }

    // 5. Toggle payment
    const matchPayment = path.match(/^\/signups\/(\d+)\/payment$/);
    if (matchPayment && method === "PATCH") {
      const signupId = parseInt(matchPayment[1], 10);
      const signup = memoryStore.signups.find(s => s.id === signupId);
      if (!signup) return { statusCode: 404, headers, body: JSON.stringify({ error: "Signup not found" }) };

      signup.paid = signup.paid === 1 ? 0 : 1;
      signup.paid_at = signup.paid === 1 ? new Date().toISOString() : null;
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, signup_id: signupId, paid: signup.paid }) };
    }

    // 6. Delete signup
    const matchDelSignup = path.match(/^\/signups\/(\d+)$/);
    if (matchDelSignup && method === "DELETE") {
      const signupId = parseInt(matchDelSignup[1], 10);
      memoryStore.signups = memoryStore.signups.filter(s => s.id !== signupId);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, deleted_id: signupId }) };
    }

    return { statusCode: 404, headers, body: JSON.stringify({ error: "Endpoint not found" }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
