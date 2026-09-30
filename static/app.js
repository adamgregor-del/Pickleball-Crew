// Woburn Pickleball Sign-Up App Client Logic

let state = {
  settings: {
    venmo_handle: "LGoodrich401",
    organizer_name: "Lori",
    cost_per_person: "23",
    location: "Woburn Racket Club, 9 Webster St, Woburn, MA 01801",
    courts: "2",
    time_slot: "7:00 PM - 9:00 PM",
    default_max_players: "8",
    cloud_db_url: ""
  },
  sessions: [],
  currentSessionId: null,
  currentSession: null
};

// DOM Elements
const signupDateSelect = document.getElementById("signupDateSelect");
const datesCarousel = document.getElementById("datesCarousel");
const currentDateHeading = document.getElementById("currentDateHeading");
const currentLocationSub = document.getElementById("currentLocationSub");
const statConfirmed = document.getElementById("statConfirmed");
const statSpotsRemaining = document.getElementById("statSpotsRemaining");
const statWaitlistCaption = document.getElementById("statWaitlistCaption");
const statPaidRatio = document.getElementById("statPaidRatio");
const signupSpotBadge = document.getElementById("signupSpotBadge");
const submitSignupBtn = document.getElementById("submitSignupBtn");
const signupForm = document.getElementById("signupForm");
const confirmedList = document.getElementById("confirmedList");
const confirmedCount = document.getElementById("confirmedCount");
const waitlistSection = document.getElementById("waitlistSection");
const waitlistList = document.getElementById("waitlistList");
const waitlistCount = document.getElementById("waitlistCount");
const toast = document.getElementById("toast");
const headerVenmoHandle = document.getElementById("headerVenmoHandle");
const footerVenmoLink = document.getElementById("footerVenmoLink");

// Modals
const venmoModal = document.getElementById("venmoModal");
const openVenmoModalBtn = document.getElementById("openVenmoModalBtn");
const closeVenmoModal = document.getElementById("closeVenmoModal");
const modalVenmoAmount = document.getElementById("modalVenmoAmount");
const modalVenmoHandle = document.getElementById("modalVenmoHandle");
const modalVenmoMemo = document.getElementById("modalVenmoMemo");
const modalVenmoDeepLink = document.getElementById("modalVenmoDeepLink");
const modalMarkPaidBtn = document.getElementById("modalMarkPaidBtn");
const copyVenmoHandleBtn = document.getElementById("copyVenmoHandleBtn");
const venmoQrCanvas = document.getElementById("venmoQrCanvas");

const settingsModal = document.getElementById("settingsModal");
const openSettingsBtn = document.getElementById("openSettingsBtn");
const closeSettingsModal = document.getElementById("closeSettingsModal");
const settingsForm = document.getElementById("settingsForm");

const addDateModal = document.getElementById("addDateModal");
const addSessionBtn = document.getElementById("addSessionBtn");
const closeAddDateModal = document.getElementById("closeAddDateModal");
const addDateForm = document.getElementById("addDateForm");
const deleteSessionBtn = document.getElementById("deleteSessionBtn");

const shareInviteBtn = document.getElementById("shareInviteBtn");
const copyRosterBtn = document.getElementById("copyRosterBtn");

// -------------------------------------------------------------
// Supabase Configuration & Universal Data Manager
// -------------------------------------------------------------
const SUPABASE_CONFIG = {
  url: "https://udcsdzholfmwyjddelum.supabase.co",
  key: "sb_publishable_QrQfmJ75xcfC7RpW0oChCQ_OBVZRP9O"
};

let supabaseClient = null;

function getSupabase() {
  if (!supabaseClient && window.supabase && typeof window.supabase.createClient === "function") {
    try {
      supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key);
    } catch (e) {
      console.warn("Failed to initialize Supabase client:", e);
    }
  }
  return supabaseClient;
}

const DataManager = {
  isBackendAvailable: null,
  isSupabaseConnected: null,

  getDefaultSettings() {
    return {
      venmo_handle: "LGoodrich401",
      organizer_name: "Lori",
      cost_per_person: "23",
      location: "Woburn Racket Club, 9 Webster St, Woburn, MA 01801",
      courts: "2",
      time_slot: "7:00 PM - 9:00 PM",
      default_max_players: "8",
      cloud_db_url: ""
    };
  },

  async checkSupabase() {
    if (this.isSupabaseConnected === true) return true;
    const sb = getSupabase();
    if (!sb) {
      this.isSupabaseConnected = false;
      return false;
    }
    try {
      const { data, error } = await sb.from("sessions").select("id").limit(1);
      if (!error) {
        this.isSupabaseConnected = true;
        return true;
      }
      // If error (e.g. table not created yet), return false so app falls back gracefully
      console.warn("Supabase query returned error (run supabase_setup.sql in Supabase SQL editor):", error.message || error);
    } catch (e) {
      console.warn("Supabase connection check exception:", e);
    }
    this.isSupabaseConnected = false;
    return false;
  },

  async checkBackend() {
    if (this.isBackendAvailable !== null) return this.isBackendAvailable;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);
      const res = await fetch("/api/settings", { signal: controller.signal });
      clearTimeout(timeoutId);
      const ct = res.headers.get("content-type") || "";
      if (res.ok && ct.includes("application/json")) {
        this.isBackendAvailable = true;
        return true;
      }
    } catch (e) {}
    this.isBackendAvailable = false;
    return false;
  },

  async fetchCloudData(url) {
    if (!url) return null;
    try {
      const endpoint = url.replace(/\/$/, "") + "/store.json";
      const res = await fetch(endpoint);
      if (res.ok) {
        const json = await res.json();
        if (json && json.sessions) return json;
      }
    } catch (e) {
      console.warn("Cloud sync read failed:", e);
    }
    return null;
  },

  async pushCloudData(url, data) {
    if (!url) return;
    try {
      const endpoint = url.replace(/\/$/, "") + "/store.json";
      await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
    } catch (e) {
      console.warn("Cloud sync write failed:", e);
    }
  },

  getLocalData() {
    const raw = localStorage.getItem("woburn_pickleball_store_v2");
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch (e) {}
    }
    const initial = {
      settings: this.getDefaultSettings(),
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
    this.saveLocalData(initial);
    return initial;
  },

  saveLocalData(data) {
    try {
      localStorage.setItem("woburn_pickleball_store_v2", JSON.stringify(data));
      if (data.settings && data.settings.cloud_db_url) {
        this.pushCloudData(data.settings.cloud_db_url, data);
      }
    } catch (e) {}
  },

  async getData() {
    const local = this.getLocalData();
    if (local.settings && local.settings.cloud_db_url) {
      const cloud = await this.fetchCloudData(local.settings.cloud_db_url);
      if (cloud) {
        localStorage.setItem("woburn_pickleball_store_v2", JSON.stringify(cloud));
        return cloud;
      }
    }
    return local;
  },

  async getSettings() {
    const sb = getSupabase();
    if (await this.checkSupabase()) {
      try {
        const { data, error } = await sb.from("settings").select("*");
        if (!error && data && data.length > 0) {
          const map = {};
          data.forEach(item => {
            map[item.key] = item.value;
          });
          return { ...this.getDefaultSettings(), ...map };
        }
      } catch (e) {
        console.warn("Supabase getSettings error, falling back:", e);
      }
    }
    if (await this.checkBackend()) {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) return await res.json();
      } catch (e) {}
    }
    const data = await this.getData();
    return data.settings;
  },

  async updateSettings(newSettings) {
    const sb = getSupabase();
    if (await this.checkSupabase()) {
      try {
        const rows = Object.entries(newSettings).map(([key, val]) => ({
          key,
          value: String(val)
        }));
        const { error } = await sb.from("settings").upsert(rows);
        if (!error) {
          const updated = await this.getSettings();
          return { success: true, settings: updated };
        }
      } catch (e) {
        console.warn("Supabase updateSettings error:", e);
      }
    }
    if (await this.checkBackend()) {
      try {
        const res = await fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newSettings)
        });
        if (res.ok) return await res.json();
      } catch (e) {}
    }
    const data = await this.getData();
    data.settings = { ...data.settings, ...newSettings };
    this.saveLocalData(data);
    return { success: true, settings: data.settings };
  },

  async getSessions() {
    const sb = getSupabase();
    if (await this.checkSupabase()) {
      try {
        const { data: sessions, error: sessErr } = await sb
          .from("sessions")
          .select("*")
          .order("session_date", { ascending: true });

        const { data: signups, error: signErr } = await sb
          .from("signups")
          .select("id, session_id, paid, created_at")
          .order("created_at", { ascending: true });

        if (!sessErr && sessions) {
          const allSignups = signups || [];
          return sessions.map(s => {
            const sSignups = allSignups.filter(su => String(su.session_id) === String(s.id));
            const paidCount = sSignups.filter(su => Number(su.paid) === 1).length;
            const total = sSignups.length;
            const max = parseInt(s.max_players, 10) || 8;
            return {
              ...s,
              id: parseInt(s.id, 10),
              cost_per_person: parseFloat(s.cost_per_person) || 23,
              max_players: max,
              total_signups: total,
              paid_count: paidCount,
              unpaid_count: total - paidCount,
              confirmed_count: Math.min(total, max),
              waitlist_count: Math.max(0, total - max),
              spots_remaining: Math.max(0, max - total)
            };
          });
        }
      } catch (e) {
        console.warn("Supabase getSessions error, falling back:", e);
      }
    }
    if (await this.checkBackend()) {
      try {
        const res = await fetch("/api/sessions");
        if (res.ok) return await res.json();
      } catch (e) {}
    }
    const data = await this.getData();
    return data.sessions.map(s => {
      const sSignups = data.signups.filter(su => su.session_id === s.id);
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
  },

  async getSessionById(sessionId) {
    sessionId = parseInt(sessionId, 10);
    const sb = getSupabase();
    if (await this.checkSupabase()) {
      try {
        const { data: session, error: sessErr } = await sb
          .from("sessions")
          .select("*")
          .eq("id", sessionId)
          .single();

        const { data: signups, error: signErr } = await sb
          .from("signups")
          .select("*")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true });

        if (!sessErr && session) {
          const max = parseInt(session.max_players, 10) || 8;
          const cost = parseFloat(session.cost_per_person) || 23;
          const confirmed = [];
          const waitlist = [];
          const allSignups = signups || [];

          allSignups.forEach((s, idx) => {
            const item = {
              ...s,
              id: parseInt(s.id, 10),
              session_id: parseInt(s.session_id, 10),
              paid: Number(s.paid) || 0
            };
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

          const paidCount = allSignups.filter(s => Number(s.paid) === 1).length;

          return {
            ...session,
            id: parseInt(session.id, 10),
            cost_per_person: cost,
            max_players: max,
            confirmed_players: confirmed,
            waitlist_players: waitlist,
            total_signups: allSignups.length,
            confirmed_count: confirmed.length,
            waitlist_count: waitlist.length,
            spots_remaining: Math.max(0, max - confirmed.length),
            paid_count: paidCount,
            unpaid_count: allSignups.length - paidCount,
            total_collected: paidCount * cost,
            expected_total: confirmed.length * cost
          };
        }
      } catch (e) {
        console.warn("Supabase getSessionById error, falling back:", e);
      }
    }
    if (await this.checkBackend()) {
      try {
        const res = await fetch(`/api/sessions/${sessionId}`);
        if (res.ok) return await res.json();
      } catch (e) {}
    }
    const data = await this.getData();
    const session = data.sessions.find(s => s.id === sessionId);
    if (!session) return null;

    const signups = data.signups
      .filter(su => su.session_id === sessionId)
      .sort((a, b) => (a.created_at || "").localeCompare(b.created_at || "") || a.id - b.id);

    const max = session.max_players;
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

    return {
      ...session,
      confirmed_players: confirmed,
      waitlist_players: waitlist,
      total_signups: signups.length,
      confirmed_count: confirmed.length,
      waitlist_count: waitlist.length,
      spots_remaining: Math.max(0, max - confirmed.length),
      paid_count: paidCount,
      unpaid_count: signups.length - paidCount,
      total_collected: paidCount * session.cost_per_person,
      expected_total: confirmed.length * session.cost_per_person
    };
  },

  async addSignup(sessionId, playerName, phone, notes) {
    sessionId = parseInt(sessionId, 10);
    const sb = getSupabase();
    if (await this.checkSupabase()) {
      try {
        // Check for duplicates
        const { data: existing } = await sb
          .from("signups")
          .select("id, player_name")
          .eq("session_id", sessionId)
          .ilike("player_name", playerName.trim());

        if (existing && existing.length > 0) {
          throw new Error(`'${playerName}' is already signed up for this date!`);
        }

        const { data: inserted, error: insertErr } = await sb
          .from("signups")
          .insert([{
            session_id: sessionId,
            player_name: playerName.trim(),
            phone: (phone || "").trim(),
            notes: (notes || "").trim(),
            paid: 0,
            paid_at: null
          }])
          .select()
          .single();

        if (insertErr) throw insertErr;

        const session = await this.getSessionById(sessionId);
        const isWaitlist = session.waitlist_players.some(p => p.id === inserted.id);

        return {
          success: true,
          signup_id: inserted.id,
          is_waitlist: isWaitlist,
          session: session
        };
      } catch (err) {
        if (err.message && err.message.includes("already signed up")) throw err;
        console.warn("Supabase addSignup error, falling back:", err);
      }
    }

    if (await this.checkBackend()) {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ player_name: playerName, phone, notes })
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to sign up");
        return json;
      } catch (err) {
        if (this.isBackendAvailable) throw err;
      }
    }

    const data = await this.getData();
    const existing = data.signups.some(
      su => su.session_id === sessionId && su.player_name.trim().toLowerCase() === playerName.trim().toLowerCase()
    );
    if (existing) {
      throw new Error(`'${playerName}' is already signed up for this date!`);
    }

    const signupId = data.nextSignupId++;
    const newSignup = {
      id: signupId,
      session_id: sessionId,
      player_name: playerName.trim(),
      phone: (phone || "").trim(),
      notes: (notes || "").trim(),
      paid: 0,
      paid_at: null,
      created_at: new Date().toISOString()
    };
    data.signups.push(newSignup);
    this.saveLocalData(data);

    const session = await this.getSessionById(sessionId);
    const isWaitlist = session.waitlist_players.some(p => p.id === signupId);

    return {
      success: true,
      signup_id: signupId,
      is_waitlist: isWaitlist,
      session: session
    };
  },

  async togglePayment(signupId) {
    signupId = parseInt(signupId, 10);
    const sb = getSupabase();
    if (await this.checkSupabase()) {
      try {
        const { data: cur, error: fetchErr } = await sb
          .from("signups")
          .select("paid")
          .eq("id", signupId)
          .single();

        if (!fetchErr && cur) {
          const nextPaid = Number(cur.paid) === 1 ? 0 : 1;
          const nextPaidAt = nextPaid === 1 ? new Date().toISOString() : null;
          const { error: updErr } = await sb
            .from("signups")
            .update({ paid: nextPaid, paid_at: nextPaidAt })
            .eq("id", signupId);

          if (!updErr) {
            return { success: true, signup_id: signupId, paid: nextPaid };
          }
        }
      } catch (e) {
        console.warn("Supabase togglePayment error, falling back:", e);
      }
    }

    if (await this.checkBackend()) {
      try {
        const res = await fetch(`/api/signups/${signupId}/payment`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" }
        });
        if (res.ok) return await res.json();
      } catch (e) {}
    }

    const data = await this.getData();
    const signup = data.signups.find(s => s.id === signupId);
    if (!signup) throw new Error("Signup not found");

    signup.paid = signup.paid === 1 ? 0 : 1;
    signup.paid_at = signup.paid === 1 ? new Date().toISOString() : null;
    this.saveLocalData(data);

    return { success: true, signup_id: signupId, paid: signup.paid };
  },

  async deleteSignup(signupId) {
    signupId = parseInt(signupId, 10);
    const sb = getSupabase();
    if (await this.checkSupabase()) {
      try {
        const { error } = await sb.from("signups").delete().eq("id", signupId);
        if (!error) {
          return { success: true, deleted_id: signupId };
        }
      } catch (e) {
        console.warn("Supabase deleteSignup error, falling back:", e);
      }
    }

    if (await this.checkBackend()) {
      try {
        const res = await fetch(`/api/signups/${signupId}`, { method: "DELETE" });
        if (res.ok) return await res.json();
      } catch (e) {}
    }

    const data = await this.getData();
    const initialLen = data.signups.length;
    data.signups = data.signups.filter(s => s.id !== signupId);
    if (data.signups.length === initialLen) throw new Error("Signup not found");
    this.saveLocalData(data);
    return { success: true, deleted_id: signupId };
  },

  async addSession(sessionDate, timeSlot, maxPlayers, notes) {
    const sb = getSupabase();
    if (await this.checkSupabase()) {
      try {
        const dt = new Date(sessionDate + "T12:00:00");
        const dayOfWeek = dt.toLocaleDateString("en-US", { weekday: "long" });
        const settings = await this.getSettings();

        const { data: inserted, error } = await sb
          .from("sessions")
          .insert([{
            session_date: sessionDate,
            day_of_week: dayOfWeek,
            time_slot: timeSlot || settings.time_slot || "7:00 PM - 9:00 PM",
            location: settings.location || "Woburn Racket Club, 9 Webster St, Woburn, MA 01801",
            courts: parseInt(settings.courts, 10) || 2,
            cost_per_person: parseFloat(settings.cost_per_person) || 23,
            max_players: parseInt(maxPlayers, 10) || 8,
            notes: notes || "2 Courts reserved for doubles play!"
          }])
          .select()
          .single();

        if (error) {
          if (error.code === "23505") throw new Error("A session for this date already exists.");
          throw error;
        }

        return { success: true, id: inserted.id };
      } catch (e) {
        if (e.message && e.message.includes("already exists")) throw e;
        console.warn("Supabase addSession error, falling back:", e);
      }
    }

    if (await this.checkBackend()) {
      try {
        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_date: sessionDate,
            time_slot: timeSlot,
            max_players: maxPlayers,
            notes: notes
          })
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to add session");
        return json;
      } catch (e) {
        if (this.isBackendAvailable) throw e;
      }
    }

    const data = await this.getData();
    if (data.sessions.some(s => s.session_date === sessionDate)) {
      throw new Error("A session for this date already exists.");
    }

    const dt = new Date(sessionDate + "T12:00:00");
    const dayOfWeek = dt.toLocaleDateString("en-US", { weekday: "long" });

    const newId = data.nextSessionId++;
    const newSession = {
      id: newId,
      session_date: sessionDate,
      day_of_week: dayOfWeek,
      time_slot: timeSlot || data.settings.time_slot || "7:00 PM - 9:00 PM",
      location: data.settings.location || "Woburn Racket Club, 9 Webster St, Woburn, MA 01801",
      courts: parseInt(data.settings.courts, 10) || 2,
      cost_per_person: parseFloat(data.settings.cost_per_person) || 23,
      max_players: parseInt(maxPlayers, 10) || 8,
      notes: notes || "2 Courts reserved for doubles play!"
    };

    data.sessions.push(newSession);
    data.sessions.sort((a, b) => a.session_date.localeCompare(b.session_date));
    this.saveLocalData(data);

    return { success: true, id: newId };
  },

  async deleteSession(sessionId) {
    sessionId = parseInt(sessionId, 10);
    const sb = getSupabase();
    if (await this.checkSupabase()) {
      try {
        await sb.from("signups").delete().eq("session_id", sessionId);
        const { error } = await sb.from("sessions").delete().eq("id", sessionId);
        if (!error) {
          return { success: true, deleted_session_id: sessionId };
        }
      } catch (e) {
        console.warn("Supabase deleteSession error, falling back:", e);
      }
    }

    if (await this.checkBackend()) {
      try {
        const res = await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
        if (res.ok) return await res.json();
      } catch (e) {}
    }

    const data = await this.getData();
    data.sessions = data.sessions.filter(s => s.id !== sessionId);
    data.signups = data.signups.filter(su => su.session_id !== sessionId);
    this.saveLocalData(data);
    return { success: true, deleted_session_id: sessionId };
  }
};

// -------------------------------------------------------------
// App Initialization & Event Listeners
// -------------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  setupEventListeners();
  await loadSettings();
  await loadSessions();
  initRealtimeSync();
});

function initRealtimeSync() {
  const sb = getSupabase();
  if (!sb) return;
  try {
    sb.channel("pickleball-realtime-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "signups" }, async () => {
        await reloadRosterPreservingSelection();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, async () => {
        await loadSessions();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "settings" }, async () => {
        await loadSettings();
      })
      .subscribe((status) => {
        console.log("Supabase Realtime subscription status:", status);
      });
  } catch (e) {
    console.warn("Realtime sync setup exception:", e);
  }
}

async function reloadRosterPreservingSelection() {
  try {
    state.sessions = await DataManager.getSessions();
    renderDatesCarousel();
    if (state.currentSessionId) {
      state.currentSession = await DataManager.getSessionById(state.currentSessionId);
      renderSessionView();
    }
  } catch (e) {
    console.warn("Error reloading roster on realtime event:", e);
  }
}

function setupEventListeners() {
  // Select dropdown in Sign-Up Card
  if (signupDateSelect) {
    signupDateSelect.addEventListener("change", (e) => {
      const selectedId = parseInt(e.target.value, 10);
      if (selectedId) selectSession(selectedId);
    });
  }

  // Venmo Modal triggers
  openVenmoModalBtn.addEventListener("click", () => openVenmoPaymentModal());
  closeVenmoModal.addEventListener("click", () => closeModal(venmoModal));
  venmoModal.addEventListener("click", (e) => {
    if (e.target === venmoModal) closeModal(venmoModal);
  });
  copyVenmoHandleBtn.addEventListener("click", () => {
    copyToClipboard(`@${state.settings.venmo_handle}`, "Venmo handle copied!");
  });
  if (footerVenmoLink) {
    footerVenmoLink.addEventListener("click", () => openVenmoPaymentModal());
  }

  // Settings Modal triggers
  openSettingsBtn.addEventListener("click", openSettings);
  closeSettingsModal.addEventListener("click", () => closeModal(settingsModal));
  settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) closeModal(settingsModal);
  });
  settingsForm.addEventListener("submit", handleSaveSettings);

  // Add Date Modal triggers
  addSessionBtn.addEventListener("click", openAddDateModal);
  closeAddDateModal.addEventListener("click", () => closeModal(addDateModal));
  addDateModal.addEventListener("click", (e) => {
    if (e.target === addDateModal) closeModal(addDateModal);
  });
  addDateForm.addEventListener("submit", handleAddDate);

  // Remove Date trigger
  if (deleteSessionBtn) {
    deleteSessionBtn.addEventListener("click", handleDeleteSession);
  }

  // Sign up Form
  signupForm.addEventListener("submit", handleSignup);

  // Share & Copy
  shareInviteBtn.addEventListener("click", handleShareInvite);
  copyRosterBtn.addEventListener("click", handleCopyRoster);
}

// Helpers
function showToast(msg, duration = 3000) {
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
  }, duration);
}

function openModal(modal) {
  modal.style.display = "flex";
}

function closeModal(modal) {
  modal.style.display = "none";
}

function copyToClipboard(text, successMsg = "Copied to clipboard!") {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => showToast(successMsg));
  } else {
    const el = document.createElement("textarea");
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
    showToast(successMsg);
  }
}

function formatDatePretty(dateString) {
  const parts = dateString.split("-");
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const date = new Date(year, month, day);

  const options = { weekday: "short", month: "short", day: "numeric" };
  return date.toLocaleDateString("en-US", options);
}

function getOrdinalSuffix(day) {
  if (day > 3 && day < 21) return "th";
  switch (day % 10) {
    case 1:  return "st";
    case 2:  return "nd";
    case 3:  return "rd";
    default: return "th";
  }
}

function formatDateLong(dateString) {
  const parts = dateString.split("-");
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const date = new Date(year, month, day);

  const weekday = date.toLocaleDateString("en-US", { weekday: "long" });
  const monthName = date.toLocaleDateString("en-US", { month: "long" });
  const suffix = getOrdinalSuffix(day);

  return `${weekday}, ${monthName} ${day}${suffix}`;
}

// -------------------------------------------------------------
// Core Actions & State Renderers
// -------------------------------------------------------------
async function loadSettings() {
  try {
    state.settings = await DataManager.getSettings();
    updateSettingsUI();
  } catch (err) {
    console.error("Failed to load settings:", err);
  }
}

function updateSettingsUI() {
  const handle = state.settings.venmo_handle || "LGoodrich401";
  headerVenmoHandle.textContent = `@${handle}`;
  footerVenmoLink.textContent = `@${handle}`;
  modalVenmoHandle.textContent = `@${handle}`;
  copyVenmoHandleBtn.textContent = `Copy Venmo Handle (@${handle})`;
}

async function loadSessions() {
  try {
    state.sessions = await DataManager.getSessions();

    if (state.sessions && state.sessions.length > 0) {
      // Populate select dropdown in Sign-Up card
      if (signupDateSelect) {
        signupDateSelect.innerHTML = state.sessions.map(s => {
          const pretty = formatDateLong(s.session_date);
          const spotsText = s.spots_remaining > 0 ? `${s.spots_remaining} spots open` : `FULL (${s.waitlist_count} waitlist)`;
          return `<option value="${s.id}">${pretty} — ${spotsText}</option>`;
        }).join("");
      }

      renderDatesCarousel();

      // Select first session if not already selected
      if (!state.currentSessionId || !state.sessions.find(s => s.id === state.currentSessionId)) {
        selectSession(state.sessions[0].id);
      } else {
        selectSession(state.currentSessionId);
      }
    } else {
      datesCarousel.innerHTML = `<div class="dates-loading">No upcoming sessions. Click + Add Date to create one.</div>`;
    }
  } catch (err) {
    console.error("Error loading sessions:", err);
    datesCarousel.innerHTML = `<div class="dates-loading">Failed to load sessions.</div>`;
  }
}

function renderDatesCarousel() {
  datesCarousel.innerHTML = "";
  state.sessions.forEach(sess => {
    const pill = document.createElement("div");
    pill.className = `date-pill ${sess.id === state.currentSessionId ? "active" : ""}`;
    pill.onclick = () => selectSession(sess.id);

    const pretty = formatDatePretty(sess.session_date);
    const day = sess.day_of_week.slice(0, 3).toUpperCase();
    const dateNum = pretty.split(", ")[1];

    let badgeClass = "badge-open";
    let badgeText = `${sess.spots_remaining} left`;

    if (sess.spots_remaining === 0) {
      if (sess.waitlist_count > 0) {
        badgeClass = "badge-waitlist";
        badgeText = `${sess.waitlist_count} waitlist`;
      } else {
        badgeClass = "badge-full";
        badgeText = "Full (8/8)";
      }
    }

    pill.innerHTML = `
      <div class="date-pill-day">${day}</div>
      <div class="date-pill-date">${dateNum}</div>
      <div class="date-pill-badge ${badgeClass}">${badgeText}</div>
    `;
    datesCarousel.appendChild(pill);
  });
}

async function selectSession(sessionId) {
  state.currentSessionId = sessionId;
  if (signupDateSelect && signupDateSelect.value != sessionId) {
    signupDateSelect.value = sessionId;
  }
  renderDatesCarousel();

  try {
    state.currentSession = await DataManager.getSessionById(sessionId);
    renderSessionView();
  } catch (err) {
    console.error(err);
    showToast("Error loading session");
  }
}

function renderSessionView() {
  const sess = state.currentSession;
  if (!sess) return;

  const cost = Number(sess.cost_per_person).toFixed(0);
  const max = sess.max_players;
  const confirmed = sess.confirmed_players.length;
  const spotsLeft = sess.spots_remaining;

  currentDateHeading.textContent = formatDateLong(sess.session_date);
  currentLocationSub.textContent = `${sess.location} • ${sess.courts} Courts • ${sess.time_slot}`;

  // Small Metrics
  statConfirmed.textContent = `${confirmed}`;

  if (spotsLeft > 0) {
    statSpotsRemaining.textContent = `${spotsLeft} open`;
    statSpotsRemaining.style.color = "var(--primary)";
    signupSpotBadge.textContent = `${spotsLeft} Spots Available`;
    signupSpotBadge.className = "badge badge-primary";
    submitSignupBtn.innerHTML = `<span>Sign Up to Play ($${cost})</span>`;
  } else {
    statSpotsRemaining.textContent = "Full";
    statSpotsRemaining.style.color = "var(--danger)";
    signupSpotBadge.textContent = "Join Waitlist";
    signupSpotBadge.className = "badge badge-waitlist";
    submitSignupBtn.innerHTML = `<span>Join Waitlist (Spot #${sess.waitlist_players.length + 1})</span>`;
  }

  statWaitlistCaption.textContent = `Waitlist: ${sess.waitlist_players.length}`;
  statPaidRatio.textContent = `${sess.paid_count}/${sess.total_signups} Paid`;

  // Roster rendering
  renderConfirmedRoster(sess);
  renderWaitlist(sess);
}

function renderConfirmedRoster(sess) {
  confirmedCount.textContent = sess.confirmed_players.length;
  confirmedList.innerHTML = "";

  const max = sess.max_players;
  const players = sess.confirmed_players;

  for (let spot = 1; spot <= max; spot++) {
    const player = players[spot - 1];
    const courtNum = spot <= Math.ceil(max / 2) ? 1 : 2;

    if (player) {
      const isPaid = player.paid === 1;
      const item = document.createElement("div");
      item.className = `roster-item court-${courtNum}`;

      item.innerHTML = `
        <div class="roster-left">
          <div class="roster-number" title="Court ${courtNum} (Spot ${spot})">${spot}</div>
          <div class="roster-details">
            <div class="roster-name">${escapeHtml(player.player_name)}</div>
            <div class="roster-sub">
              <span>Court ${courtNum}</span>
              ${player.phone ? `<span>• 📞 ${escapeHtml(player.phone)}</span>` : ""}
              ${player.notes ? `<span>• 💬 ${escapeHtml(player.notes)}</span>` : ""}
            </div>
          </div>
        </div>
        <div class="roster-right">
          <button class="pay-toggle-btn ${isPaid ? "paid" : "unpaid"}" 
                  onclick="togglePayment(${player.id})" 
                  title="Click to toggle Paid/Unpaid">
            ${isPaid ? "✓ Paid" : "○ Unpaid"}
          </button>
          <button class="btn-row-venmo" onclick="openVenmoPaymentModal('${escapeHtml(player.player_name)}', ${player.id}, ${isPaid})">
            Venmo
          </button>
          <button class="btn-row-delete" onclick="confirmDeleteSignup(${player.id}, '${escapeHtml(player.player_name)}')" title="Remove player">
            &times;
          </button>
        </div>
      `;
      confirmedList.appendChild(item);
    } else {
      const emptySpot = document.createElement("div");
      emptySpot.className = "roster-empty-spot";
      emptySpot.innerHTML = `
        <div class="roster-number">${spot}</div>
        <span>Spot Available (Court ${courtNum})</span>
      `;
      confirmedList.appendChild(emptySpot);
    }
  }
}

function renderWaitlist(sess) {
  const waitlist = sess.waitlist_players || [];
  waitlistCount.textContent = waitlist.length;
  waitlistSection.style.display = "block";
  waitlistList.innerHTML = "";

  // Render existing waitlist players
  waitlist.forEach((p, idx) => {
    const item = document.createElement("div");
    item.className = "roster-item waitlist-item";
    const isPaid = p.paid === 1;

    item.innerHTML = `
      <div class="roster-left">
        <div class="roster-number">W${idx + 1}</div>
        <div class="roster-details">
          <div class="roster-name">${escapeHtml(p.player_name)}</div>
          <div class="roster-sub">
            <span>Waitlist Priority #${idx + 1}</span>
            ${p.phone ? `<span>• 📞 ${escapeHtml(p.phone)}</span>` : ""}
            ${p.notes ? `<span>• 💬 ${escapeHtml(p.notes)}</span>` : ""}
          </div>
        </div>
      </div>
      <div class="roster-right">
        <button class="pay-toggle-btn ${isPaid ? "paid" : "unpaid"}" 
                onclick="togglePayment(${p.id})" 
                title="Click to toggle Paid/Unpaid">
          ${isPaid ? "✓ Paid" : "○ Unpaid"}
        </button>
        <button class="btn-row-venmo" onclick="openVenmoPaymentModal('${escapeHtml(p.player_name)}', ${p.id}, ${isPaid})">
          Venmo
        </button>
        <button class="btn-row-delete" onclick="confirmDeleteSignup(${p.id}, '${escapeHtml(p.player_name)}')" title="Remove from waitlist">
          &times;
        </button>
      </div>
    `;
    waitlistList.appendChild(item);
  });

  // Always show open waitlist slots so space is always visible
  const minWaitlistSlots = 3;
  const startSlot = waitlist.length + 1;
  const endSlot = Math.max(minWaitlistSlots, waitlist.length + 1);

  for (let slot = startSlot; slot <= endSlot; slot++) {
    const placeholder = document.createElement("div");
    placeholder.className = "waitlist-empty-spot";
    placeholder.innerHTML = `
      <div class="roster-number">W${slot}</div>
      <span>Waitlist Spot #${slot} — Available for subs / extra players</span>
    `;
    waitlistList.appendChild(placeholder);
  }
}

// Payment Status Toggle
async function togglePayment(signupId) {
  try {
    const res = await DataManager.togglePayment(signupId);
    showToast(res.paid === 1 ? "Marked as Paid! 🎾" : "Marked as Unpaid");
    await selectSession(state.currentSessionId);
    state.sessions = await DataManager.getSessions();
    renderDatesCarousel();
  } catch (err) {
    console.error(err);
    showToast("Error updating payment status");
  }
}

// Sign up Handler
async function handleSignup(e) {
  e.preventDefault();
  if (!state.currentSessionId) return;

  const nameInput = document.getElementById("playerName");
  const phoneInput = document.getElementById("playerPhone");
  const notesInput = document.getElementById("playerNotes");

  const playerName = nameInput.value.trim();
  const phone = phoneInput.value.trim();
  const notes = notesInput.value.trim();

  if (!playerName) {
    showToast("Please enter your name");
    return;
  }

  submitSignupBtn.disabled = true;
  submitSignupBtn.innerHTML = `<span>Saving...</span>`;

  try {
    const data = await DataManager.addSignup(state.currentSessionId, playerName, phone, notes);

    nameInput.value = "";
    phoneInput.value = "";
    notesInput.value = "";

    if (data.is_waitlist) {
      showToast(`Added to the Waitlist (#${data.session.waitlist_players.length})!`);
    } else {
      showToast(`Spot reserved for ${playerName}! 🎾`);
      setTimeout(() => {
        openVenmoPaymentModal(playerName, data.signup_id, false);
      }, 400);
    }

    await loadSessions();
  } catch (err) {
    console.error(err);
    showToast(err.message || "Failed to sign up");
  } finally {
    submitSignupBtn.disabled = false;
    renderSessionView();
  }
}

// Delete Signup
async function confirmDeleteSignup(signupId, playerName) {
  if (!confirm(`Are you sure you want to remove ${playerName} from this session?`)) {
    return;
  }

  try {
    await DataManager.deleteSignup(signupId);
    showToast(`${playerName} removed`);
    await loadSessions();
  } catch (err) {
    console.error(err);
    showToast("Error removing player");
  }
}

// Venmo Modal & QR Code
function openVenmoPaymentModal(forPlayerName = null, forSignupId = null, isPaid = false) {
  if (!state.currentSession) return;

  const handle = state.settings.venmo_handle || "LGoodrich401";
  const cost = Number(state.currentSession.cost_per_person).toFixed(0);
  const dateStr = formatDatePretty(state.currentSession.session_date);
  
  let memo = `Pickleball Woburn Racket Club ${dateStr}`;
  if (forPlayerName) {
    memo += ` - ${forPlayerName}`;
  }

  modalVenmoAmount.textContent = cost;
  modalVenmoHandle.textContent = `@${handle}`;
  modalVenmoMemo.textContent = memo;

  // Manage "Mark Paid" button in the modal
  if (modalMarkPaidBtn) {
    if (forSignupId && !isPaid) {
      modalMarkPaidBtn.style.display = "block";
      modalMarkPaidBtn.textContent = `✓ I Sent $${cost} via Venmo (Mark Paid)`;
      modalMarkPaidBtn.onclick = async () => {
        await togglePayment(forSignupId);
        closeModal(venmoModal);
      };
    } else {
      modalMarkPaidBtn.style.display = "none";
    }
  }

  // Deep link for mobile app: venmo://paycharge?txn=pay&recipients=...&amount=...&note=...
  const deepLink = `venmo://paycharge?txn=pay&recipients=${encodeURIComponent(handle)}&amount=${cost}&note=${encodeURIComponent(memo)}`;
  // Web fallback:
  const webLink = `https://venmo.com/${encodeURIComponent(handle)}?txn=pay&amount=${cost}&note=${encodeURIComponent(memo)}`;

  modalVenmoDeepLink.href = isMobileDevice() ? deepLink : webLink;
  modalVenmoDeepLink.onclick = () => {
    // If mobile, try opening app; fallback gracefully
    if (isMobileDevice()) {
      setTimeout(() => {
        window.location.href = webLink;
      }, 800);
    }
  };

  // Generate QR code for desktop camera scan
  generateVenmoQr(webLink);

  openModal(venmoModal);
}

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function generateVenmoQr(text) {
  if (typeof qrcode !== "undefined") {
    try {
      const qr = qrcode(0, "M");
      qr.addData(text);
      qr.make();
      const canvas = venmoQrCanvas;
      const ctx = canvas.getContext("2d");
      const moduleCount = qr.getModuleCount();
      const cellSize = Math.floor(canvas.width / moduleCount);
      const offset = Math.floor((canvas.width - cellSize * moduleCount) / 2);

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#008cff";

      for (let row = 0; row < moduleCount; row++) {
        for (let col = 0; col < moduleCount; col++) {
          if (qr.isDark(row, col)) {
            ctx.fillRect(offset + col * cellSize, offset + row * cellSize, cellSize, cellSize);
          }
        }
      }
      return;
    } catch (e) {
      console.warn("QR code generation error", e);
    }
  }
  // Fallback simple graphic
  const ctx = venmoQrCanvas.getContext("2d");
  ctx.fillStyle = "#f0f9ff";
  ctx.fillRect(0, 0, venmoQrCanvas.width, venmoQrCanvas.height);
  ctx.fillStyle = "#0284c7";
  ctx.font = "bold 16px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Venmo: @" + state.settings.venmo_handle, venmoQrCanvas.width / 2, venmoQrCanvas.height / 2);
}

// Copy Invite
function handleShareInvite() {
  if (!state.currentSession) return;
  const sess = state.currentSession;
  const dateStr = formatDateLong(sess.session_date);
  const cost = Number(sess.cost_per_person).toFixed(0);
  const handle = state.settings.venmo_handle;
  const spotsLeft = sess.spots_remaining;

  const msg = `🎾 Pickleball at Woburn Racket Club!\n📍 9 Webster St, Woburn, MA 01801\n📅 ${dateStr} from 7:00–9:00 PM (2 Courts)\n💵 $${cost} per person to Lori (Venmo @${handle})\n⚡ ${spotsLeft} spot${spotsLeft === 1 ? "" : "s"} open! Sign up here: ${window.location.origin}`;

  copyToClipboard(msg, "Share invite copied to clipboard!");
}

// Copy Roster
function handleCopyRoster() {
  if (!state.currentSession) return;
  const sess = state.currentSession;
  const dateStr = formatDatePretty(sess.session_date);
  let text = `🎾 Woburn Pickleball Roster - ${dateStr} (7-9 PM):\n`;

  sess.confirmed_players.forEach((p, idx) => {
    const court = idx < 4 ? "Court 1" : "Court 2";
    text += `${idx + 1}. ${p.player_name} [${p.paid ? "PAID" : "UNPAID"}] (${court})\n`;
  });

  if (sess.spots_remaining > 0) {
    text += `\n(${sess.spots_remaining} open spot${sess.spots_remaining > 1 ? "s" : ""} left)\n`;
  }

  if (sess.waitlist_players && sess.waitlist_players.length > 0) {
    text += `\nWaitlist:\n`;
    sess.waitlist_players.forEach((p, idx) => {
      text += `W${idx + 1}. ${p.player_name}\n`;
    });
  }

  copyToClipboard(text, "Roster copied to clipboard!");
}

// Settings
function openSettings() {
  document.getElementById("setVenmoHandle").value = state.settings.venmo_handle || "LGoodrich401";
  document.getElementById("setOrganizerName").value = state.settings.organizer_name || "Lori";
  document.getElementById("setCost").value = state.settings.cost_per_person || 23;
  document.getElementById("setCourtCount").value = state.settings.courts || 2;
  document.getElementById("setMaxPlayers").value = state.settings.default_max_players || 8;
  document.getElementById("setTimeSlot").value = state.settings.time_slot || "7:00 PM - 9:00 PM";
  document.getElementById("setLocation").value = state.settings.location || "Woburn Racket Club, 9 Webster St, Woburn, MA 01801";
  if (document.getElementById("setCloudDbUrl")) {
    document.getElementById("setCloudDbUrl").value = state.settings.cloud_db_url || "";
  }
  openModal(settingsModal);
}

async function handleSaveSettings(e) {
  e.preventDefault();
  const payload = {
    venmo_handle: document.getElementById("setVenmoHandle").value.trim().replace(/^@/, ""),
    organizer_name: document.getElementById("setOrganizerName").value.trim(),
    cost_per_person: document.getElementById("setCost").value,
    courts: document.getElementById("setCourtCount").value,
    default_max_players: document.getElementById("setMaxPlayers").value,
    time_slot: document.getElementById("setTimeSlot").value.trim(),
    location: document.getElementById("setLocation").value.trim(),
    cloud_db_url: document.getElementById("setCloudDbUrl") ? document.getElementById("setCloudDbUrl").value.trim() : ""
  };

  try {
    const data = await DataManager.updateSettings(payload);
    state.settings = data.settings;
    updateSettingsUI();
    closeModal(settingsModal);
    showToast("Settings updated successfully!");
    await selectSession(state.currentSessionId);
  } catch (err) {
    console.error(err);
    showToast("Error saving settings");
  }
}

// Open Add Date modal with smart next-Thursday defaulting
function openAddDateModal() {
  let nextThursday;

  if (state.sessions && state.sessions.length > 0) {
    const sorted = [...state.sessions].sort((a, b) => a.session_date.localeCompare(b.session_date));
    const lastDateStr = sorted[sorted.length - 1].session_date;
    const parts = lastDateStr.split("-");
    const lastDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));

    nextThursday = new Date(lastDate);
    nextThursday.setDate(nextThursday.getDate() + 7);
  } else {
    const today = new Date();
    const day = today.getDay(); // Sunday=0, Thu=4
    const diff = (4 - day + 7) % 7 || 7;
    nextThursday = new Date(today);
    nextThursday.setDate(today.getDate() + diff);
  }

  const yyyy = nextThursday.getFullYear();
  const mm = String(nextThursday.getMonth() + 1).padStart(2, "0");
  const dd = String(nextThursday.getDate()).padStart(2, "0");

  document.getElementById("newSessionDate").value = `${yyyy}-${mm}-${dd}`;
  document.getElementById("newSessionTime").value = state.settings.time_slot || "7:00 PM - 9:00 PM";
  document.getElementById("newSessionMax").value = state.settings.default_max_players || 8;
  document.getElementById("newSessionNotes").value = "2 Courts reserved for doubles play!";

  openModal(addDateModal);
}

// Delete / Remove current session date
async function handleDeleteSession() {
  if (!state.currentSessionId || !state.currentSession) return;
  const sess = state.currentSession;
  const dateFormatted = formatDateLong(sess.session_date);

  const confirmMsg = `Are you sure you want to remove the session for ${dateFormatted}?\n\nThis will remove the date and any signups for this day.`;
  if (!confirm(confirmMsg)) {
    return;
  }

  try {
    await DataManager.deleteSession(state.currentSessionId);
    showToast(`Removed session for ${dateFormatted}`);
    state.currentSessionId = null;
    await loadSessions();
  } catch (err) {
    console.error(err);
    showToast("Error removing session date");
  }
}

// Add Date submit handler
async function handleAddDate(e) {
  e.preventDefault();
  const dateVal = document.getElementById("newSessionDate").value;
  const timeVal = document.getElementById("newSessionTime").value.trim();
  const maxVal = parseInt(document.getElementById("newSessionMax").value, 10);
  const notesVal = document.getElementById("newSessionNotes").value.trim();

  if (!dateVal) return;

  try {
    const data = await DataManager.addSession(dateVal, timeVal, maxVal, notesVal);
    closeModal(addDateModal);
    showToast("New play date added!");
    await loadSessions();
    selectSession(data.id);
  } catch (err) {
    console.error(err);
    showToast(err.message || "Error adding date");
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
