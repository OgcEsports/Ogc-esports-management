(() => {
  "use strict";

  const TEAM_NAMES = [
    "OGC GALAXY", "OGC LDR", "OGC TITAN", "OGC ESPORTS 1", "OGC NMS",
    "OGC ROYALS", "OGC 4HL", "OGC AXOLOTLS", "OGC RANGERS",
    "OGC X GLADIATOR", "OGC HUSTLERS", "OGC ESPORTS", "OGC STARS",
    "OGC APEX", "OGC NGU"
  ];

  const MODULES = [
    ["◷", "ATTENDANCE", "Attendance status and history"],
    ["✦", "DRILLS", "Daily drills and training tasks"],
    ["▤", "LOBBY OS", "Lobby operating standards"],
    ["?", "DOUBT BOX", "Questions and answers"],
    ["▦", "TOURNAMENT SCHEDULES", "Tournament dates and details"],
    ["◴", "UPCOMING SESSIONS", "Planned sessions and reviews"],
    ["☰", "PLAYER DETAILS", "Player profiles and contact details"]
  ];

  const $ = (id) => document.getElementById(id);
  const views = [
    "loading-view",
    "welcome-view",
    "auth-view",
    "pending-view",
    "dashboard-view"
  ];

  let supabase = null;
  let selectedType = null;
  let mode = "signup";
  let currentUser = null;
  let currentProfile = null;
  let teams = [];

  function showView(id) {
    views.forEach(v => {
      if (v === "loading-view") return;
      $(v).classList.toggle("hidden", v !== id);
    });
    const sp = $("loading-view");
    if (sp) sp.classList.add("hidden");
  }

  const APP_BUILD = "b19";

  function resetSavedLogin() {
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith("sb-"))
        .forEach(k => localStorage.removeItem(k));
    } catch (_) {}
  }

  function showStartupProblem(message) {
    message = message + " [" + APP_BUILD + "]";
    showView("welcome-view");
    const old = $("startup-problem");
    if (old) old.remove();
    const msg = document.createElement("p");
    msg.id = "startup-problem";
    msg.className = "notice error";
    msg.textContent = message;
    $("welcome-view").appendChild(msg);
  }

  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(label + " timed out. Check your Supabase project (it may be paused) and internet.")), ms)
      )
    ]);
  }

  function notice(message, type = "success") {
    const el = $("auth-message");
    el.textContent = message;
    el.className = `notice ${type}`;
  }

  function clearNotice() {
    $("auth-message").className = "notice hidden";
    $("auth-message").textContent = "";
  }

  function setMode(next) {
    mode = next;

    $("signup-fields").classList.toggle("hidden", mode !== "signup");
    $("login-fields").classList.toggle("hidden", mode !== "login");

    $("signup-fields").querySelectorAll("input, select").forEach(el => {
      const isPlayerField = $("player-fields").contains(el);
      el.required = mode === "signup" &&
        (!isPlayerField || selectedType === "player");
    });

    $("login-email").required = mode === "login";
    $("login-password").required = mode === "login";

    document.querySelectorAll(".tab").forEach(t =>
      t.classList.toggle("active", t.dataset.mode === mode)
    );

    $("auth-submit").innerHTML = mode === "signup"
      ? 'Submit account request <span>→</span>'
      : 'Log in <span>→</span>';

    $("auth-heading").textContent =
      `${selectedType === "player" ? "Player" : "Member"} ${
        mode === "signup" ? "access request" : "login"
      }`;

    clearNotice();
  }

  function configReady() {
    return window.OGC_CONFIG &&
      window.OGC_CONFIG.SUPABASE_URL.startsWith("https://") &&
      !window.OGC_CONFIG.SUPABASE_URL.includes("PASTE_") &&
      window.OGC_CONFIG.SUPABASE_ANON_KEY &&
      !window.OGC_CONFIG.SUPABASE_ANON_KEY.includes("PASTE_");
  }

  async function loadTeams() {
    // Teams are public, so load them with a plain request. This avoids
    // any auth-lock hang inside the Supabase library at startup.
    const res = await fetch(
      window.OGC_CONFIG.SUPABASE_URL +
        "/rest/v1/teams?select=id,name&order=name.asc",
      {
        headers: {
          apikey: window.OGC_CONFIG.SUPABASE_ANON_KEY,
          Authorization: "Bearer " + window.OGC_CONFIG.SUPABASE_ANON_KEY
        }
      }
    );

    if (!res.ok) {
      throw new Error("Could not load teams (" + res.status + ")");
    }

    const data = await res.json();
    teams = data || [];

    $("team_id").innerHTML =
      '<option value="">Select your team</option>' +
      teams.map(t =>
        `<option value="${t.id}">${escapeHtml(t.name)}</option>`
      ).join("");
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));
  }

  function selectedTeamName() {
    const t = teams.find(x => x.id === $("team_id").value);
    return t ? t.name : "";
  }

  async function showWelcomeOrDashboard() {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      currentUser = null;
      currentProfile = null;
      $("topbar-right").innerHTML = "";
      showView("welcome-view");
      return;
    }

    currentUser = session.user;
    await loadProfile();
  }

  async function loadProfile() {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (error) throw error;

    currentProfile = data;

    // Create the pending profile after the user's first confirmed login.
    if (!data && currentUser.user_metadata &&
        currentUser.user_metadata.ogc_profile_request) {
      const request = currentUser.user_metadata.ogc_profile_request;

      const { error: createError } = await supabase
        .from("profiles")
        .insert({ id: currentUser.id, ...request });

      if (createError) throw createError;

      return loadProfile();
    }

    if (!data || data.status !== "approved" ||
        (data.account_type === "member" &&
         !data.member_access_approved)) {
      showView("pending-view");
      $("topbar-right").innerHTML =
        '<span class="secure-pill">ACCOUNT REVIEW</span>';
      return;
    }

    await renderDashboard();
  }

  function stat(label, value, foot = "") {
    return `<div class="stat-card">
      <div class="stat-label">${escapeHtml(label)}</div>
      <div class="stat-value">${escapeHtml(value)}</div>
      <div class="stat-foot">${escapeHtml(foot)}</div>
    </div>`;
  }

  function moduleCards(teamId) {
    const canSeePlayers =
      currentProfile &&
      (currentProfile.account_type === "owner" ||
       currentProfile.account_type === "member");
    const visibleModules = MODULES.map((m, i) => ({m, i})).filter(({m}) =>
      canSeePlayers || m[1] !== "PLAYER DETAILS"
    );
    return `<div class="module-grid">${visibleModules.map(({m, i}) => `
      <button type="button"
        class="module-card"
        data-module="${i}"
        data-team-id="${teamId || ""}"
        style="text-align:left;width:100%;cursor:pointer;color:inherit">
        <div class="module-icon">${m[0]}</div>
        <h3>${m[1]}</h3>
        <p>${m[2]}</p>
      </button>
    `).join("")}</div>`;
  }

  async function openAttendance(team) {
    const isOwner = currentProfile && currentProfile.account_type === "owner";
    const isMember = currentProfile && currentProfile.account_type === "member";
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit"
    }).format(new Date());
    const oldPanel = $("attendance-panel");
    if (oldPanel) oldPanel.remove();

    const panel = document.createElement("section");
    panel.id = "attendance-panel";
    panel.className = "content-card";
    panel.style.marginTop = "18px";
    panel.innerHTML = `
      <div class="section-head">
        <h2>ATTENDANCE — ${escapeHtml(team.name)}</h2>
        <button type="button" class="text-btn" id="attendance-close">Close</button>
      </div>
      <p class="tiny muted">Daily deadline: 9:00 PM IST. After the deadline, attendance is locked.</p>
      ${(isOwner || isMember) ? `<div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin:12px 0">
        <label style="display:grid;gap:6px">Date
          <input type="date" id="attendance-date" value="${today}" max="${today}">
        </label>
        <button type="button" class="secondary-btn small" id="attendance-load">Load attendance</button>
      </div>` : ""}
      <p class="tiny muted" id="attendance-message">Loading attendance…</p>
      <div id="attendance-list"></div>
      ${(!isOwner && !isMember) ? `<button type="button" class="primary-btn" id="attendance-mark" style="margin-top:14px">Mark My Attendance — Present</button>` : ""}
    `;
    $("dashboard-content").appendChild(panel);
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
    $("attendance-close").onclick = () => panel.remove();

    async function loadAttendance() {
      const date = (isOwner || isMember) ? ($("attendance-date").value || today) : today;
      $("attendance-message").textContent = "Loading attendance…";
      $("attendance-list").innerHTML = "";

      let query = supabase.from("attendance_records")
        .select("player_id,team_id,attendance_date,status,marked_at,notes")
        .eq("team_id", team.id)
        .eq("attendance_date", date);

      if (!isOwner && !isMember) query = query.eq("player_id", currentUser.id);
      const { data: records, error } = await query;
      if (error) throw error;

      if (isOwner || isMember) {
        const { data: playerRows, error: playerError } = await supabase
          .from("profiles")
          .select("id,full_name,ign,player_role")
          .eq("team_id", team.id)
          .eq("account_type", "player")
          .eq("status", "approved")
          .order("full_name");
        if (playerError) throw playerError;

        const byPlayer = new Map((records || []).map(r => [r.player_id, r]));
        $("attendance-list").innerHTML = !playerRows?.length
          ? empty("No approved players are assigned to this team.")
          : `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">
            <thead><tr><th style="text-align:left;padding:9px">Player</th><th style="text-align:left;padding:9px">Status</th><th style="text-align:left;padding:9px">Marked at</th></tr></thead>
            <tbody>${playerRows.map(p => {
              const r = byPlayer.get(p.id);
              return `<tr>
                <td style="padding:9px;border-top:1px solid #333"><strong>${escapeHtml(p.ign || p.full_name)}</strong><div class="tiny muted">${escapeHtml(p.player_role || "")}</div></td>
                <td style="padding:9px;border-top:1px solid #333">${escapeHtml(r ? r.status.toUpperCase() : "ABSENT (not submitted)")}</td>
                <td style="padding:9px;border-top:1px solid #333">${r?.marked_at ? new Date(r.marked_at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
              </tr>`;
            }).join("")}</tbody></table></div>`;
        $("attendance-message").textContent = `${playerRows?.length || 0} approved player(s) · ${date}`;
      } else {
        const record = (records || [])[0];
        const parts = new Intl.DateTimeFormat("en-GB", {
          timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
        }).format(new Date()).split(":").map(Number);
        const isLocked = date < today || (date === today && (parts[0] > 21 || (parts[0] === 21 && parts[1] >= 0)));
        $("attendance-list").innerHTML = `<div class="content-card">
          <h3>Your status: ${escapeHtml(record ? record.status.toUpperCase() : (isLocked ? "ABSENT" : "NOT MARKED"))}</h3>
          <p class="tiny muted">${record?.marked_at ? "Marked at " + new Date(record.marked_at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }) : (isLocked ? "The attendance deadline has passed." : "Mark yourself present before 9:00 PM IST.")}</p>
        </div>`;
        const markButton = $("attendance-mark");
        if (markButton) markButton.disabled = !!record || isLocked || date !== today;
        $("attendance-message").textContent = date === today ? "Today's attendance" : `Attendance for ${date}`;
      }
    }

    $("attendance-load")?.addEventListener("click", () => loadAttendance().catch(e => alert(e.message)));

    
    const markBtn = $("attendance-mark");
    if (markBtn) {
      markBtn.addEventListener("click", async () => {
        if (markBtn.disabled) return;

        markBtn.disabled = true;
        markBtn.textContent = "Submitting...";

        try {
          const { error } = await supabase.rpc("mark_my_attendance");
          if (error) throw error;

          await loadAttendance();
          alert("Attendance marked as Present.");
        } catch (e) {
          alert(e.message || "Could not mark attendance.");
          markBtn.disabled = false;
        } finally {
          markBtn.textContent = "Mark My Attendance — Present";
        }
      });
    }

    try {
      await loadAttendance();
    } catch (e) {
      $("attendance-message").textContent = "Could not load attendance: " + e.message;
    }
  }
  
async function openSubmission(team, kind) {
  const isReviewer =
    currentProfile?.account_type === "owner" ||
    currentProfile?.account_type === "member";
  const old = $("submission-panel");
  if (old) old.remove();

  const isDrill = kind === "DRILLS";
  const bucket = "ogc-player-submissions";

  const panel = document.createElement("section");
  panel.id = "submission-panel";
  panel.className = "content-card";
  panel.style.marginTop = "18px";

  panel.innerHTML = `
    <div class="section-head">
      <h2>${isDrill ? "DRILL SUBMISSION" : "LOBBY OS SUBMISSION"} — ${escapeHtml(team.name)}</h2>
      <button type="button" class="text-btn" id="submission-close">Close</button>
    </div>

    <p class="muted">
      Upload your ${isDrill ? "training proof (image or video)" : "lobby OS screenshot"} directly.
      Proof is required.
    </p>

    <form id="submission-form" style="display:grid;gap:12px;max-width:650px">
      <label>Title *
        <input id="submission-title" required maxlength="120"
          placeholder="${isDrill ? "Daily training task" : "Lobby OS compliance"}"
          style="display:block;width:100%;margin-top:6px">
      </label>

      ${isDrill ? `
        <label>Drill category *
          <select id="submission-category" required style="display:block;width:100%;margin-top:6px">
            <option value="">Select category</option>
            <option>Primary</option>
            <option>Secondary</option>
            <option>Assaulter</option>
            <option>One-tap</option>
            <option>BR 1v4</option>
            <option>Other</option>
          </select>
        </label>
        <label>Details / result *
          <textarea id="submission-details" required rows="4" maxlength="4000"
            placeholder="Kills, results, practice notes..."
            style="display:block;width:100%;margin-top:6px"></textarea>
        </label>
      ` : `
        <label>OS details *
          <textarea id="submission-details" required rows="4" maxlength="4000"
            placeholder="Describe the lobby OS rules followed or issue found"
            style="display:block;width:100%;margin-top:6px"></textarea>
        </label>
      `}

      <label>${isDrill ? "Screenshot or video proof" : "Lobby OS screenshot"} *
        <input id="submission-proof" type="file"
          accept="${isDrill ? "image/*,video/*" : "image/*"}" required
          style="display:block;width:100%;margin-top:6px">
      </label>

      <p class="tiny muted">
        Maximum file size: 25 MB. ${isDrill ? "Images and videos are accepted." : "Images only."}
      </p>

      <button type="submit" id="submission-submit">Submit</button>
      <p id="submission-status" class="tiny muted"></p>
    </form>

    <div class="section-head"><h2>MY RECENT SUBMISSIONS</h2></div>
    <div id="submission-history" class="tiny muted">Loading...</div>
  `;

  $("dashboard-content").appendChild(panel);
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
  $("submission-close").onclick = () => panel.remove();

  if (isReviewer) {
    // Owners and members only review; they do not upload.
    panel.querySelector("h2").textContent =
      (isDrill ? "DRILL SUBMISSIONS" : "LOBBY OS SUBMISSIONS") + " — " + team.name;
    const intro = panel.querySelector("p.muted");
    if (intro) intro.remove();
    const formEl = $("submission-form");
    if (formEl) formEl.remove();
    const heads = panel.querySelectorAll(".section-head h2");
    if (heads[1]) heads[1].textContent = "ALL PLAYER SUBMISSIONS";
  }

  const status = $("submission-status");

  async function loadMine() {
    let query = supabase
      .from("team_submissions")
      .select("id,kind,title,category,details,proof_url,status,created_at,user_id")
      .eq("team_id", team.id)
      .eq("kind", kind)
      .order("created_at", { ascending: false })
      .limit(100);

    if (
      currentProfile?.account_type !== "owner" &&
      currentProfile?.account_type !== "member"
    ) {
      query = query.eq("user_id", currentUser.id);
    }

    const { data, error } = await query;

    if (error) {
      $("submission-history").textContent = "Could not load submission: " + error.message;
      return;
    }

    const rows = [];

    // Look up player names so reviewers see names instead of long IDs.
    const nameById = new Map();
    const ids = [...new Set((data || []).map(x => x.user_id))];
    if (ids.length) {
      const { data: people } = await supabase
        .from("profiles")
        .select("id,full_name,ign")
        .in("id", ids);
      (people || []).forEach(p => nameById.set(p.id, p.ign || p.full_name));
    }

    for (const item of data || []) {
      let proofLink = "—";

      if (item.proof_url) {
        const { data: signed, error: signError } = await supabase.storage
          .from(bucket)
          .createSignedUrl(item.proof_url, 3600);

        if (!signError && signed?.signedUrl) {
          proofLink = `<a href="${escapeHtml(signed.signedUrl)}" target="_blank" rel="noopener">Open proof</a>`;
        } else {
          console.error("Proof link error:", signError);
          proofLink = `<span class="tiny muted">Proof unavailable${signError?.message ? " (" + escapeHtml(signError.message) + ")" : ""}</span>`;
        }
      }

      rows.push(`<tr>
        <td style="padding:8px;border-top:1px solid #333">${escapeHtml(new Date(item.created_at).toLocaleDateString("en-IN"))}</td>
        <td style="padding:8px;border-top:1px solid #333">${escapeHtml(nameById.get(item.user_id) || item.user_id)}</td>
        <td style="padding:8px;border-top:1px solid #333">
          ${escapeHtml(item.title)}
          ${item.category ? `<div class="tiny muted">${escapeHtml(item.category)}</div>` : ""}
          ${item.details ? `<div class="tiny muted" style="white-space:pre-wrap;max-width:320px">${escapeHtml(item.details)}</div>` : ""}
        </td>
        <td style="padding:8px;border-top:1px solid #333">${escapeHtml(item.status)}</td>
        <td style="padding:8px;border-top:1px solid #333">${proofLink}</td>
      </tr>`);
    }

    $("submission-history").innerHTML = rows.length
      ? `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">
          <thead><tr><th align="left">Date</th><th align="left">Player</th><th align="left">Title</th><th align="left">Status</th><th align="left">Proof</th></tr></thead>
          <tbody>${rows.join("")}</tbody>
        </table></div>`
      : "No submissions yet.";
  }

  const submissionFormEl = $("submission-form") || {};
  submissionFormEl.onsubmit = async (event) => {
    event.preventDefault();

    const button = $("submission-submit");
    const file = $("submission-proof").files?.[0];

    if (!file) {
      status.textContent = "Please attach your proof file.";
      return;
    }

    const maxMb = isDrill ? 50 : 25;
    if (file.size > maxMb * 1024 * 1024) {
      status.textContent =
        "File is " + (file.size / 1024 / 1024).toFixed(1) + " MB. The limit is " +
        maxMb + " MB. Trim or compress the video and try again.";
      return;
    }

    if (isDrill) {
      if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
        status.textContent = "Upload an image or video.";
        return;
      }
    } else if (!file.type.startsWith("image/")) {
      status.textContent = "Lobby OS requires an image screenshot.";
      return;
    }

    button.disabled = true;
    status.textContent = "Uploading proof...";

    let uploadedPath = null;

    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      uploadedPath =
        `${currentUser.id}/${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(uploadedPath, file, {
          upsert: false,
          contentType: file.type
        });

      if (uploadError) throw uploadError;

      const payload = {
        team_id: team.id,
        user_id: currentUser.id,
        kind,
        title: $("submission-title").value.trim(),
        category: isDrill ? $("submission-category").value : null,
        details: $("submission-details").value.trim(),
        proof_url: uploadedPath,
        status: "submitted"
      };

      const { error: insertError } = await supabase
        .from("team_submissions")
        .insert(payload);

      if (insertError) throw insertError;

      status.textContent = "Proof uploaded and submission saved successfully.";
      $("submission-form").reset();
      await loadMine();
    } catch (error) {
      status.textContent = "Submission failed: " + error.message;

      // Remove an uploaded file if saving its database record failed.
      if (uploadedPath) {
        await supabase.storage.from(bucket).remove([uploadedPath]);
      }
    } finally {
      button.disabled = false;
    }
  };

  await loadMine();
}

async function openEvents(team, eventType) {
  const accountType = currentProfile?.account_type;
  const isOwner = accountType === "owner";
  const isMember = accountType === "member";
  const isTournament = eventType === "TOURNAMENT";

  // Owner manages all schedules. Managers manage tournaments only.
  const canEdit = isOwner || (isMember && isTournament);
  const canDelete = isOwner;

  const old = $("feature-panel");
  if (old) old.remove();

  const title = isTournament ? "TOURNAMENT SCHEDULES" : "UPCOMING SESSIONS";
  const panel = document.createElement("section");
  panel.id = "feature-panel";
  panel.className = "content-card";
  panel.style.marginTop = "18px";

  panel.innerHTML = `
    <div class="section-head">
      <h2>${title} — ${escapeHtml(team.name)}</h2>
      <button type="button" class="text-btn" id="feature-close">Close</button>
    </div>

    ${canEdit ? `
      <form id="event-form" style="display:grid;gap:12px;max-width:650px;margin-bottom:20px">
        <label>${isTournament ? "Tournament name" : "Session name"} *
          <input id="event-title" required maxlength="160"
            style="display:block;width:100%;margin-top:6px"
            placeholder="${isTournament ? "Tournament name" : "Training session name"}">
        </label>

        <label>Date *
          <input id="event-date" type="date" required
            style="display:block;width:100%;margin-top:6px">
        </label>

        <label>Time *
          <input id="event-time" type="time" required
            style="display:block;width:100%;margin-top:6px">
        </label>

        ${!isTournament ? `
          <label>Session taken by *
            <input id="event-conductor" required maxlength="120"
              style="display:block;width:100%;margin-top:6px"
              placeholder="Trainer's name">
          </label>
        ` : ""}

        <label>Description (optional)
          <textarea id="event-description" maxlength="2000" rows="3"
            style="display:block;width:100%;margin-top:6px"
            placeholder="Tournament details, rules, venue, room details, or notes"></textarea>
        </label>

        <button type="submit" id="event-save">
          Add ${isTournament ? "tournament" : "session"}
        </button>
        <p id="event-status" class="tiny muted"></p>
      </form>
    ` : `
      <p class="muted">
        ${isMember
          ? "Managers can view schedules but can only edit tournament schedules."
          : "Schedules are available to view here."}
      </p>
    `}

    <div id="events-list" class="tiny muted">Loading schedule...</div>
  `;

  $("dashboard-content").appendChild(panel);
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
  $("feature-close").onclick = () => panel.remove();

  async function loadEvents() {
    const { data, error } = await supabase
      .from("portal_events")
      .select("id,team_id,event_type,title,event_date,event_time,conductor,description,created_by")
      .eq("team_id", team.id)
      .eq("event_type", eventType)
      .order("event_date", { ascending: true })
      .order("event_time", { ascending: true });

    if (error) {
      $("events-list").textContent = "Could not load schedule: " + error.message;
      return;
    }

    const events = data || [];

    $("events-list").innerHTML = events.length
      ? events.map(ev => `
        <article class="content-card" style="margin:10px 0">
          <h3>${escapeHtml(ev.title)}</h3>
          <p>📅 ${escapeHtml(ev.event_date)} · 🕒 ${escapeHtml(String(ev.event_time || "").slice(0, 5))}</p>
          ${!isTournament ? `<p>👤 Session taken by: <strong>${escapeHtml(ev.conductor || "—")}</strong></p>` : ""}
          ${ev.description ? `<p>${escapeHtml(ev.description)}</p>` : ""}
          ${canEdit ? `
            <button type="button" class="secondary-btn small" data-event-edit="${ev.id}">Edit</button>
          ` : ""}
          ${canDelete ? `
            <button type="button" class="secondary-btn small" data-event-delete="${ev.id}">Delete</button>
          ` : ""}
        </article>
      `).join("")
      : "No events scheduled yet.";

    panel.querySelectorAll("[data-event-edit]").forEach(button => {
      button.onclick = () => {
        const ev = events.find(item => String(item.id) === button.dataset.eventEdit);
        if (!ev) return;

        $("event-title").value = ev.title || "";
        $("event-date").value = ev.event_date || "";
        $("event-time").value = String(ev.event_time || "").slice(0, 5);

        if ($("event-conductor")) {
          $("event-conductor").value = ev.conductor || "";
        }

        $("event-description").value = ev.description || "";
        $("event-form").dataset.editId = ev.id;
        $("event-save").textContent = "Save changes";
        $("event-status").textContent = "Editing selected schedule item.";
        $("event-form").scrollIntoView({ behavior: "smooth", block: "center" });
      };
    });

    panel.querySelectorAll("[data-event-delete]").forEach(button => {
      button.onclick = async () => {
        if (!canDelete) return alert("Only the owner can delete schedules.");
        if (!confirm("Delete this schedule item?")) return;

        const { error: deleteError } = await supabase
          .from("portal_events")
          .delete()
          .eq("id", button.dataset.eventDelete)
          .eq("team_id", team.id)
          .eq("event_type", eventType);

        if (deleteError) {
          alert("Could not delete schedule: " + deleteError.message);
          return;
        }

        await loadEvents();
      };
    });
  }

  if (canEdit) {
    $("event-form").onsubmit = async event => {
      event.preventDefault();

      const button = $("event-save");
      const message = $("event-status");
      button.disabled = true;
      message.textContent = "Saving schedule...";

      try {
        const payload = {
          team_id: team.id,
          event_type: eventType,
          title: $("event-title").value.trim(),
          event_date: $("event-date").value,
          event_time: $("event-time").value,
          conductor: !isTournament ? $("event-conductor").value.trim() : null,
          description: $("event-description").value.trim() || null
        };

        const editId = $("event-form").dataset.editId;
        let result;

        if (editId) {
          result = await supabase
            .from("portal_events")
            .update(payload)
            .eq("id", editId)
            .eq("team_id", team.id)
            .eq("event_type", eventType);
        } else {
          result = await supabase
            .from("portal_events")
            .insert({
              ...payload,
              created_by: currentUser.id
            });
        }

        if (result.error) throw result.error;

        $("event-form").reset();
        delete $("event-form").dataset.editId;
        $("event-save").textContent =
          "Add " + (isTournament ? "tournament" : "session");
        message.textContent = "Schedule saved successfully.";

        await loadEvents();
      } catch (error) {
        message.textContent = "Could not save schedule: " + error.message;
      } finally {
        button.disabled = false;
      }
    };
  }

  await loadEvents();
}

async function openPlayerDetails(team) {
  const accountType = currentProfile?.account_type;
  if (accountType !== "owner" && accountType !== "member") return;

  const old = $("player-details-panel");
  if (old) old.remove();

  const panel = document.createElement("section");
  panel.id = "player-details-panel";
  panel.className = "content-card";
  panel.style.marginTop = "18px";

  panel.innerHTML = `
    <div class="section-head">
      <h2>PLAYER DETAILS — ${escapeHtml(team.name)}</h2>
      <button type="button" class="text-btn" id="player-details-close">Close</button>
    </div>
    <div id="player-details-list" class="tiny muted">Loading players...</div>
  `;

  $("dashboard-content").appendChild(panel);
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
  $("player-details-close").onclick = () => panel.remove();

  const { data, error } = await supabase
    .from("profiles")
    .select("id,full_name,ign,ff_uid,player_role,birth_date,phone,email,status,created_at")
    .eq("team_id", team.id)
    .eq("account_type", "player")
    .order("full_name");

  if (error) {
    $("player-details-list").textContent =
      "Could not load players: " + error.message;
    return;
  }

  const players = data || [];

  if (!players.length) {
    $("player-details-list").textContent = "No players in this team yet.";
    return;
  }

  const field = (label, value) => `
    <div style="min-width:140px">
      <div class="tiny muted">${label}</div>
      <div>${escapeHtml(value || "—")}</div>
    </div>`;

  $("player-details-list").innerHTML =
    `<p class="tiny muted">${players.length} player${players.length === 1 ? "" : "s"}</p>` +
    players.map(p => `
      <article class="content-card" style="margin:10px 0">
        <h3 style="margin:0 0 10px">
          ${escapeHtml(p.ign || p.full_name)}
          <span class="tag" style="margin-left:8px">${escapeHtml((p.status || "").toUpperCase())}</span>
        </h3>
        <div style="display:flex;flex-wrap:wrap;gap:14px 28px">
          ${field("Full name", p.full_name)}
          ${field("In-game name", p.ign)}
          ${field("Free Fire UID", p.ff_uid)}
          ${field("Role", p.player_role)}
          ${field("Birthdate", p.birth_date
            ? new Date(p.birth_date).toLocaleDateString("en-IN")
            : "")}
          ${field("Phone", p.phone)}
          ${field("Email", p.email)}
          ${field("Joined", p.created_at
            ? new Date(p.created_at).toLocaleDateString("en-IN")
            : "")}
        </div>
      </article>
    `).join("");
}

async function openDoubtBox(team) {
  const isOwner = currentProfile?.account_type === "owner";
  const isMember = currentProfile?.account_type === "member";

  const old = $("doubt-panel");
  if (old) old.remove();

  const panel = document.createElement("section");
  panel.id = "doubt-panel";
  panel.className = "content-card";
  panel.style.marginTop = "18px";

  panel.innerHTML = `
    <div class="section-head">
      <h2>DOUBT BOX — ${escapeHtml(team.name)}</h2>
      <button type="button" class="text-btn" id="doubt-close">Close</button>
    </div>

    ${isOwner || isMember ? `
      <p class="muted">Review and answer questions submitted by players.</p>
    ` : `
      <form id="doubt-form" style="display:grid;gap:12px;max-width:650px">
        <label>Your question *
          <textarea id="doubt-question" required maxlength="4000" rows="4"
            placeholder="Describe your doubt..."
            style="display:block;width:100%;margin-top:6px"></textarea>
        </label>

        <label>Attachment (optional)
          <input id="doubt-files" type="file" multiple
            accept="image/*,video/*"
            style="display:block;width:100%;margin-top:6px">
        </label>

        <p class="tiny muted">Maximum 25 MB per file. Photos and videos are accepted.</p>
        <button type="submit" id="doubt-submit">Submit question</button>
        <p id="doubt-status" class="tiny muted"></p>
      </form>
    `}

    <div class="section-head"><h2>${isOwner || isMember ? "PLAYER QUESTIONS" : "MY QUESTIONS"}</h2></div>
    <div id="doubt-list" class="tiny muted">Loading questions...</div>
  `;

  $("dashboard-content").appendChild(panel);
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
  $("doubt-close").onclick = () => panel.remove();

  async function loadDoubts() {
    let query = supabase
      .from("doubt_submissions")
      .select("id,team_id,user_id,question,attachment_paths,status,owner_response,created_at")
      .eq("team_id", team.id)
      .order("created_at", { ascending: false });

    // Players see their own questions. Owner and managers can review team questions.
    if (!isOwner && !isMember) {
      query = query.eq("user_id", currentUser.id);
    }

    const { data, error } = await query;

    if (error) {
      $("doubt-list").textContent = "Could not load questions: " + error.message;
      return;
    }

    const items = data || [];

    if (!items.length) {
      $("doubt-list").textContent = "No questions submitted yet.";
      return;
    }

    const rendered = [];

    // Look up who asked each question (owner and members only).
    const askerById = new Map();
    if (isOwner || isMember) {
      const askerIds = [...new Set(items.map(x => x.user_id))];
      if (askerIds.length) {
        const { data: askers } = await supabase
          .from("profiles")
          .select("id,full_name,ign,player_role")
          .in("id", askerIds);
        (askers || []).forEach(a => askerById.set(a.id, a));
      }
    }

    for (const item of items) {
      const links = [];

      for (const path of (item.attachment_paths || [])) {
        const { data: signed, error: signError } = await supabase.storage
          .from("ogc-doubt-attachments")
          .createSignedUrl(path, 3600);

        if (!signError && signed?.signedUrl) {
          links.push(
            `<a href="${escapeHtml(signed.signedUrl)}" target="_blank" rel="noopener">Open attachment</a>`
          );
        }
      }

      rendered.push(`
        <article class="content-card" style="margin:10px 0">
          ${(isOwner || isMember) ? (() => {
            const a = askerById.get(item.user_id);
            const label = a
              ? (a.ign || a.full_name) + (a.ign && a.full_name ? " (" + a.full_name + ")" : "")
              : "Unknown player";
            return `<p style="margin:0 0 4px"><strong>${escapeHtml(label)}</strong>${a && a.player_role ? ` <span class="tiny muted">· ${escapeHtml(a.player_role)}</span>` : ""}</p>`;
          })() : ""}
          <p class="tiny muted">${escapeHtml(new Date(item.created_at).toLocaleString("en-IN"))}</p>
          <h3>Question</h3>
          <p style="white-space:pre-wrap">${escapeHtml(item.question)}</p>
          ${links.length ? `<p>${links.join(" · ")}</p>` : ""}
          <p>Status: <strong>${escapeHtml(item.status || "open")}</strong></p>

          ${item.owner_response ? `
            <div style="border-left:3px solid #e63946;padding:10px;margin-top:10px">
              <strong>Response</strong>
              <p style="white-space:pre-wrap">${escapeHtml(item.owner_response)}</p>
            </div>
          ` : ""}

          ${(isOwner || isMember) ? `
            <form data-doubt-reply="${item.id}" style="display:grid;gap:8px;margin-top:12px">
              <label>Your response
                <textarea name="response" required maxlength="4000" rows="3"
                  placeholder="Write your answer..."
                  style="display:block;width:100%;margin-top:6px">${escapeHtml(item.owner_response || "")}</textarea>
              </label>
              <button type="submit" class="secondary-btn small">Save response</button>
            </form>
          ` : ""}
        </article>
      `);
    }

    $("doubt-list").innerHTML = rendered.join("");

    if (isOwner || isMember) {
      $("doubt-list").querySelectorAll("[data-doubt-reply]").forEach(form => {
        form.onsubmit = async event => {
          event.preventDefault();

          const response = new FormData(form).get("response").trim();
          if (!response) return;

          const button = form.querySelector("button");
          button.disabled = true;
          button.textContent = "Saving...";

          try {
            const { error: updateError } = await supabase
              .from("doubt_submissions")
              .update({
                owner_response: response,
                status: "answered",
                updated_at: new Date().toISOString()
              })
              .eq("id", form.dataset.doubtReply);

            if (updateError) throw updateError;

            await loadDoubts();
          } catch (error) {
            alert("Could not save response: " + error.message);
            button.disabled = false;
            button.textContent = "Save response";
          }
        };
      });
    }
  }

  if (!isOwner && !isMember) {
    $("doubt-form").onsubmit = async event => {
      event.preventDefault();

      const button = $("doubt-submit");
      const status = $("doubt-status");
      const question = $("doubt-question").value.trim();
      const files = Array.from($("doubt-files").files || []);

      if (!question) {
        status.textContent = "Please enter your question.";
        return;
      }

      if (files.some(file => file.size > 25 * 1024 * 1024)) {
        status.textContent = "Each attachment must be 25 MB or smaller.";
        return;
      }

      if (files.some(file =>
        !file.type.startsWith("image/") && !file.type.startsWith("video/")
      )) {
        status.textContent = "Only photo and video attachments are accepted.";
        return;
      }

      button.disabled = true;
      status.textContent = "Uploading question and attachments...";

      const uploadedPaths = [];

      try {
        for (const file of files) {
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const path =
            `${currentUser.id}/${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}`;

          const { error: uploadError } = await supabase.storage
            .from("ogc-doubt-attachments")
            .upload(path, file, {
              upsert: false,
              contentType: file.type
            });

          if (uploadError) throw uploadError;
          uploadedPaths.push(path);
        }

        const { error: insertError } = await supabase
          .from("doubt_submissions")
          .insert({
            team_id: team.id,
            user_id: currentUser.id,
            question,
            attachment_paths: uploadedPaths,
            status: "open"
          });

        if (insertError) throw insertError;

        status.textContent = "Question submitted successfully.";
        $("doubt-form").reset();
        await loadDoubts();
      } catch (error) {
        status.textContent = "Could not submit question: " + error.message;

        if (uploadedPaths.length) {
          await supabase.storage
            .from("ogc-doubt-attachments")
            .remove(uploadedPaths);
        }
      } finally {
        button.disabled = false;
      }
    };
  }

  await loadDoubts();
}

  document.addEventListener("click", async function(event) {
    const button = event.target.closest("[data-module]"); if (!button) return;
    const module = MODULES[Number(button.dataset.module)]; if (!module) return;
    const team = teams.find(t => t.id === button.dataset.teamId);
    if (!team) return alert("Team not found. Please reopen the team workspace.");
    try {
      if (module[1] === "ATTENDANCE") return await openAttendance(team);
      if (module[1] === "DRILLS" || module[1] === "LOBBY OS") return await openSubmission(team, module[1]);
      if (module[1] === "PLAYER DETAILS") return await openPlayerDetails(team);
      if (module[1] === "DOUBT BOX") return await openDoubtBox(team);
      if (module[1] === "TOURNAMENT SCHEDULES") return await openEvents(team, "TOURNAMENT");
      if (module[1] === "UPCOMING SESSIONS") return await openEvents(team, "SESSION");
      alert(module[1] + "\nTeam: " + team.name + "\n\nThis module is not enabled yet.");
    } catch (e) { alert("Could not open module: " + e.message); }
  });

  function empty(message) {
    return `<div class="empty-state">${escapeHtml(message)}</div>`;
  }
  // ---------- Automatic analytics (built from real attendance + submissions) ----------
  const IST_TZ = "Asia/Kolkata";
  const C_RED = "#ff2d4d", C_BLUE = "#4da3ff", C_GREEN = "#3ecf8e", C_GRID = "#2a2a33", C_OFF = "#23232b";
  const RANGES = [7, 14, 30, 90];
  const NO_DATA = "No activity yet. This fills in automatically as players mark attendance and upload drills and lobby OS.";
  let analyticsRange = 30;
  let analyticsTeam = "all";
  let analyticsCache = null;

  function istKey(d) {
    return new Date(d).toLocaleDateString("en-CA", { timeZone: IST_TZ });
  }

  function lastDays(n) {
    const base = new Date(istKey(new Date()) + "T12:00:00Z");
    const keys = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(base);
      d.setUTCDate(d.getUTCDate() - i);
      keys.push(d.toISOString().slice(0, 10));
    }
    return keys;
  }

  function daysAgo(key) {
    return Math.round(
      (Date.parse(istKey(new Date()) + "T00:00:00Z") - Date.parse(key + "T00:00:00Z")) / 86400000
    );
  }

  function keyAgo(n) {
    const d = new Date(istKey(new Date()) + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  }

  function shortDate(key) {
    const p = key.split("-");
    return Number(p[2]) + "/" + Number(p[1]);
  }

  function fullDate(key) {
    return key.split("-").reverse().join("/");
  }

  // Supabase returns at most 1000 rows per request, so read in pages.
  async function fetchAll(makeQuery) {
    const rows = [];
    for (let from = 0; from < 20000; from += 1000) {
      const { data, error } = await makeQuery().range(from, from + 999);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return rows;
  }

  // ----- chart helpers (plain SVG/HTML, no libraries) -----
  function legend(items) {
    return `<div class="tiny muted" style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:6px">${
      items.map(i =>
        `<span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${i.color};margin-right:5px"></span>${escapeHtml(i.name)}</span>`
      ).join("")}</div>`;
  }

  function geom(n, rotate) {
    const H = rotate ? 214 : 180, L = 32, R = 8, T = 10, B = rotate ? 60 : 26;
    const scroll = n > 12;
    const W = scroll ? L + R + n * 26 : 320;
    const plotW = W - L - R, plotH = H - T - B;
    return { H, L, R, T, B, W, scroll, rotate: !!rotate, plotW, plotH, groupW: plotW / n };
  }

  function axes(gm, maxV, unit, labels) {
    let g = "";
    [0, 0.5, 1].forEach(f => {
      const y = gm.T + gm.plotH - f * gm.plotH;
      g += `<line x1="${gm.L}" x2="${gm.W - gm.R}" y1="${y}" y2="${y}" stroke="${C_GRID}" stroke-width="1"/>` +
           `<text x="${gm.L - 4}" y="${y + 3}" text-anchor="end" font-size="9" fill="#9aa0a6">${Math.round(f * maxV)}${unit}</text>`;
    });
    const step = gm.scroll || gm.rotate ? 1 : (labels.length > 8 ? 2 : 1);
    labels.forEach((lab, i) => {
      if ((labels.length - 1 - i) % step !== 0) return;
      const x = gm.L + i * gm.groupW + gm.groupW / 2;
      if (gm.rotate) {
        const y = gm.T + gm.plotH + 12;
        g += `<text x="${x.toFixed(1)}" y="${y}" text-anchor="end" font-size="9" fill="#9aa0a6" transform="rotate(-40 ${x.toFixed(1)} ${y})">${escapeHtml(lab)}</text>`;
      } else {
        g += `<text x="${x.toFixed(1)}" y="${gm.H - 8}" text-anchor="middle" font-size="9" fill="#9aa0a6">${escapeHtml(lab)}</text>`;
      }
    });
    return g;
  }

  function svgWrap(gm, g, label) {
    const svg = `<svg viewBox="0 0 ${gm.W} ${gm.H}" ${gm.scroll ? `width="${gm.W}" style="display:block"` : 'width="100%"'} role="img" aria-label="${escapeHtml(label || "Chart")}">${g}</svg>`;
    return gm.scroll
      ? `<div class="chart-scroll" style="overflow-x:auto;-webkit-overflow-scrolling:touch">${svg}</div>`
      : svg;
  }

  // Bars: grouped by default, stacked with opts.stack
  function barChart(labels, series, opts = {}) {
    const gm = geom(labels.length, opts.rotate);
    const stack = !!opts.stack;
    const peak = stack
      ? Math.max(1, ...labels.map((_, i) => series.reduce((s, x) => s + (x.values[i] || 0), 0)))
      : Math.max(1, ...series.flatMap(s => s.values));
    const maxV = opts.max || Math.max(4, Math.ceil(peak / 4) * 4);
    let g = axes(gm, maxV, opts.unit || "", labels);
    const barW = stack ? gm.groupW * 0.72 : (gm.groupW * 0.72) / series.length;

    labels.forEach((_, i) => {
      let base = gm.T + gm.plotH;
      series.forEach((s, j) => {
        const v = s.values[i] || 0;
        const h = Math.max(0, Math.min(1, v / maxV)) * gm.plotH;
        if (h <= 0) return;
        const x = gm.L + i * gm.groupW + gm.groupW * 0.14 + (stack ? 0 : j * barW);
        const y = stack ? base - h : gm.T + gm.plotH - h;
        if (stack) base -= h;
        g += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(1, barW - 1).toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${s.color}"/>`;
      });
    });
    return svgWrap(gm, g, opts.label);
  }

  // Line with soft area fill
  function lineChart(labels, series, opts = {}) {
    const gm = geom(labels.length);
    const peak = Math.max(1, ...series.flatMap(s => s.values));
    const maxV = opts.max || Math.max(4, Math.ceil(peak / 4) * 4);
    let g = axes(gm, maxV, opts.unit || "", labels);
    const base = gm.T + gm.plotH;

    series.forEach(s => {
      const pts = s.values.map((v, i) => [
        gm.L + i * gm.groupW + gm.groupW / 2,
        base - Math.max(0, Math.min(1, (v || 0) / maxV)) * gm.plotH
      ]);
      const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
      g += `<path d="${line} L${pts[pts.length - 1][0].toFixed(1)} ${base} L${pts[0][0].toFixed(1)} ${base} Z" fill="${s.color}" opacity="0.15"/>`;
      g += `<path d="${line}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      if (pts.length <= 31) {
        pts.forEach(p => { g += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.5" fill="${s.color}"/>`; });
      }
    });
    return svgWrap(gm, g, opts.label);
  }

  // Donut with legend
  function donut(parts, centerText, centerSub) {
    const total = parts.reduce((s, p) => s + p.value, 0);
    if (!total) return empty(NO_DATA);
    const R = 42, C = 2 * Math.PI * R;
    let acc = 0;
    const arcs = parts.filter(p => p.value > 0).map(p => {
      const len = p.value / total * C;
      const el = `<circle r="${R}" cx="60" cy="60" fill="none" stroke="${p.color}" stroke-width="16" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}" transform="rotate(-90 60 60)"/>`;
      acc += len;
      return el;
    }).join("");
    const key = parts.map(p => `
      <div style="margin:5px 0;font-size:14px">
        <span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${p.color};margin-right:7px"></span>${escapeHtml(p.label)}
        <strong style="margin-left:6px">${p.value}</strong>
        <span class="tiny muted">(${Math.round(p.value / total * 100)}%)</span>
      </div>`).join("");
    return `<div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">
      <svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label="Share chart">
        <circle r="${R}" cx="60" cy="60" fill="none" stroke="${C_OFF}" stroke-width="16"/>
        ${arcs}
        <text x="60" y="60" text-anchor="middle" font-size="20" font-weight="700" fill="#fff">${escapeHtml(centerText)}</text>
        <text x="60" y="75" text-anchor="middle" font-size="9" fill="#9aa0a6">${escapeHtml(centerSub || "")}</text>
      </svg>
      <div>${key}</div></div>`;
  }

  // Player x day attendance grid
  function heatmap(players, days, presentMap) {
    if (!players.length) return empty("No approved players in this team yet.");
    const cell = bg => `<span style="flex:0 0 14px;width:14px;height:14px;border-radius:3px;background:${bg}"></span>`;
    const head = `<div style="display:flex;gap:3px;margin-left:118px;height:12px">${
      days.map((d, i) =>
        `<span style="flex:0 0 14px;width:14px;font-size:8px;color:#9aa0a6;white-space:nowrap;overflow:visible">${(days.length - 1 - i) % 7 === 0 ? shortDate(d) : ""}</span>`
      ).join("")}</div>`;
    const rows = players.map(p => {
      const set = presentMap.get(p.id) || new Set();
      return `<div style="display:flex;align-items:center;gap:3px;margin:3px 0">
        <span style="flex:0 0 115px;width:115px;position:sticky;left:0;background:#0c0c12;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;z-index:1">${escapeHtml(p.ign || p.full_name || "Player")}</span>
        ${days.map(d => cell(set.has(d) ? C_GREEN : C_OFF)).join("")}</div>`;
    }).join("");
    return legend([{ name: "Present", color: C_GREEN }, { name: "Absent", color: C_OFF }]) +
      `<div class="chart-scroll" style="overflow-x:auto;-webkit-overflow-scrolling:touch">${head}${rows}</div>`;
  }

  // Small charts for the per-team cards
  function spark(values, color, maxV) {
    const W = 160, H = 46, P = 3, n = values.length;
    const mx = maxV || Math.max(1, ...values);
    const pts = values.map((v, i) => [
      P + (n > 1 ? i * (W - 2 * P) / (n - 1) : (W - 2 * P) / 2),
      H - P - Math.max(0, Math.min(1, v / mx)) * (H - 2 * P)
    ]);
    const line = pts.map((q, i) => (i ? "L" : "M") + q[0].toFixed(1) + " " + q[1].toFixed(1)).join(" ");
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none" role="img" aria-label="Trend">
      <line x1="0" x2="${W}" y1="${H - P}" y2="${H - P}" stroke="${C_GRID}" stroke-width="1"/>
      <path d="${line} L${pts[pts.length - 1][0].toFixed(1)} ${H - P} L${pts[0][0].toFixed(1)} ${H - P} Z" fill="${color}" opacity="0.18"/>
      <path d="${line}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
  }

  function miniBars(a, b) {
    const W = 160, H = 46, P = 3, n = a.length;
    const peak = Math.max(1, ...a.map((v, i) => v + b[i]));
    const slot = (W - 2 * P) / n;
    let g = `<line x1="0" x2="${W}" y1="${H - P}" y2="${H - P}" stroke="${C_GRID}" stroke-width="1"/>`;
    a.forEach((v, i) => {
      let base = H - P;
      [[v, C_RED], [b[i], C_BLUE]].forEach(([val, col]) => {
        const h = val / peak * (H - 2 * P);
        if (h <= 0) return;
        base -= h;
        g += `<rect x="${(P + i * slot + slot * 0.12).toFixed(1)}" y="${base.toFixed(1)}" width="${Math.max(1, slot * 0.76).toFixed(1)}" height="${h.toFixed(1)}" fill="${col}"/>`;
      });
    });
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none" role="img" aria-label="Submissions">${g}</svg>`;
  }

  function rankBars(items, unit = "") {
    const max = Math.max(1, ...items.map(i => i.value));
    return items.map(i => `
      <div style="margin:10px 0">
        <div style="display:flex;justify-content:space-between;gap:10px;font-size:14px">
          <span>${escapeHtml(i.label)}${i.sub ? ` <span class="tiny muted">· ${escapeHtml(i.sub)}</span>` : ""}</span>
          <strong>${i.value}${unit}</strong>
        </div>
        <div style="height:6px;border-radius:4px;background:${C_OFF};margin-top:4px">
          <div style="height:6px;border-radius:4px;width:${(i.value / max * 100).toFixed(0)}%;background:${C_RED}"></div>
        </div>
      </div>`).join("");
  }

  function aCard(title, body) {
    return `<div class="content-card"><h3>${title}</h3>${body}</div>`;
  }

  function dailyTable(rows, cols) {
    return `<div style="overflow:auto;max-height:380px;border:1px solid ${C_GRID};border-radius:10px">
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead><tr>${cols.map(c => `<th style="text-align:left;padding:9px;position:sticky;top:0;background:#14141a">${c}</th>`).join("")}</tr></thead>
        <tbody>${rows.map(r => `<tr>${r.map(c => `<td style="padding:9px;border-top:1px solid ${C_GRID}">${c}</td>`).join("")}</tr>`).join("")}</tbody>
      </table></div>`;
  }

  function rangeBar(active) {
    return `<span class="tiny muted">Show:</span>
      ${RANGES.map(n => `<button type="button" data-range="${n}" class="secondary-btn small" style="${n === active ? "border-color:" + C_RED + ";color:" + C_RED + ";" : ""}">${n} days</button>`).join("")}`;
  }

  // Last 8 weeks, submissions + attendance stacked
  function weeklyChart(subs, present) {
    const order = [7, 6, 5, 4, 3, 2, 1, 0];
    const inWeek = (key, w) => { const a = daysAgo(key); return a >= w * 7 && a < (w + 1) * 7; };
    const subW = order.map(w => subs.filter(s => inWeek(s.day, w)).length);
    const attW = order.map(w => present.filter(r => inWeek(r.attendance_date, w)).length);
    if (subW.every(v => v === 0) && attW.every(v => v === 0)) return empty(NO_DATA);
    return legend([{ name: "Drills + lobby OS", color: C_RED }, { name: "Attendance marks", color: C_GREEN }]) +
      barChart(order.map(w => shortDate(keyAgo(w * 7 + 6))),
        [{ values: subW, color: C_RED }, { values: attW, color: C_GREEN }],
        { stack: true, label: "Weekly activity" });
  }

  // ----- data loading (cached for a minute so range / team switches are instant) -----
  async function loadAnalyticsData(scope) {
    if (analyticsCache && analyticsCache.scope === scope && Date.now() - analyticsCache.at < 60000) {
      return analyticsCache.data;
    }
    const me = scope === "me";
    const since = lastDays(90)[0];
    const sinceTs = new Date(since + "T00:00:00+05:30").toISOString();

    const [attRows, subRows] = await Promise.all([
      fetchAll(() => {
        let q = supabase.from("attendance_records")
          .select("team_id,player_id,attendance_date,status")
          .gte("attendance_date", since)
          .order("attendance_date").order("player_id");
        if (me) q = q.eq("player_id", currentUser.id);
        return q;
      }),
      fetchAll(() => {
        let q = supabase.from("team_submissions")
          .select("team_id,user_id,kind,created_at")
          .gte("created_at", sinceTs)
          .order("created_at").order("user_id");
        if (me) q = q.eq("user_id", currentUser.id);
        return q;
      })
    ]);

    const data = { attRows, subRows, teamRows: [], players: [], counts: new Map(), open: [] };

    if (!me) {
      const { data: teamRows } = await supabase.from("teams").select("id,name");
      data.teamRows = teamRows || [];
      try {
        data.players = await fetchAll(() =>
          supabase.from("profiles")
            .select("id,full_name,ign,team_id")
            .eq("account_type", "player").eq("status", "approved").order("id"));
      } catch (_) {}
      try {
        const { data: counts } = await supabase.rpc("get_team_player_counts");
        (counts || []).forEach(r => data.counts.set(r.team_id, Number(r.approved_count || 0)));
      } catch (_) {}
      try {
        data.open = await fetchAll(() =>
          supabase.from("doubt_submissions").select("id,team_id").eq("status", "open").order("id"));
      } catch (_) { data.open = null; }
    }

    analyticsCache = { scope, at: Date.now(), data };
    return data;
  }

  // ----- numbers for one team over the chosen days -----
  function teamMetrics(teamId, ctx) {
    const { days, present, subs, players, counts } = ctx;
    const pl = players.filter(p => p.team_id === teamId);
    const n = pl.length || counts.get(teamId) || 0;
    const pres = present.filter(r => r.team_id === teamId);
    const sb = subs.filter(s => s.team_id === teamId);
    const presentByDay = days.map(d => new Set(
      pres.filter(r => r.attendance_date === d).map(r => r.player_id)).size);
    const drillsByDay = days.map(d => sb.filter(s => s.day === d && s.kind === "DRILLS").length);
    const osByDay = days.map(d => sb.filter(s => s.day === d && s.kind === "LOBBY OS").length);
    const pct = presentByDay.map(v => (n ? Math.min(100, Math.round(v / n * 100)) : 0));
    const presentDays = presentByDay.reduce((a, b) => a + b, 0);
    const drills = drillsByDay.reduce((a, b) => a + b, 0);
    const os = osByDay.reduce((a, b) => a + b, 0);
    const attRange = n ? Math.min(100, Math.round(presentDays / (n * days.length) * 100)) : 0;
    return { pl, n, pres, sb, presentByDay, drillsByDay, osByDay, pct, presentDays, drills, os, attRange, score: drills + os + presentDays };
  }

  // ----- one team, in detail -----
  function teamView(team, ctx, data) {
    const { days } = ctx;
    const m = teamMetrics(team.id, ctx);
    const labels = days.map(shortDate);
    const last = days.length - 1;
    const dayset = new Set(days);
    const open = Array.isArray(data.open) ? data.open.filter(d => d.team_id === team.id).length : 0;

    const board = m.pl.map(p => {
      const d1 = m.sb.filter(s => s.user_id === p.id && s.kind === "DRILLS" && dayset.has(s.day)).length;
      const o1 = m.sb.filter(s => s.user_id === p.id && s.kind === "LOBBY OS" && dayset.has(s.day)).length;
      const dates = new Set(m.pres.filter(r => r.player_id === p.id && dayset.has(r.attendance_date)).map(r => r.attendance_date));
      return { p, d1, o1, dates, score: d1 + o1 + dates.size };
    }).sort((a, b) => b.score - a.score);
    const presentMap = new Map(board.map(x => [x.p.id, x.dates]));

    const attChart = m.presentDays === 0
      ? empty(NO_DATA)
      : lineChart(labels, [{ values: m.pct, color: C_GREEN }], { max: 100, unit: "%", label: "Daily attendance percentage" });

    const subsChart = (m.drills + m.os) === 0
      ? empty(NO_DATA)
      : legend([{ name: "Drills", color: C_RED }, { name: "Lobby OS", color: C_BLUE }]) +
        barChart(labels, [{ values: m.drillsByDay, color: C_RED }, { values: m.osByDay, color: C_BLUE }],
          { stack: true, label: "Daily drill and lobby OS submissions" });

    const totalSlots = m.n * days.length;
    const absent = Math.max(0, totalSlots - m.presentDays);

    const rows = days.map((d, i) => [
      fullDate(d),
      m.presentByDay[i] + " / " + m.n + " (" + m.pct[i] + "%)",
      String(m.drillsByDay[i]),
      String(m.osByDay[i])
    ]).reverse();

    return `
      <div class="stats-grid">
        ${stat("PLAYERS", String(m.n), "Approved in this team")}
        ${stat("PRESENT TODAY", m.presentByDay[last] + "/" + m.n, "Marked present")}
        ${stat("ATTENDANCE", m.attRange + "%", "Last " + days.length + " days")}
        ${stat("DRILLS", String(m.drills), "Last " + days.length + " days")}
        ${stat("LOBBY OS", String(m.os), "Last " + days.length + " days")}
        ${stat("OPEN DOUBTS", String(open), "Waiting for a reply")}
      </div>
      <div class="two-col" style="margin-top:14px">
        ${aCard("Attendance trend", attChart)}
        ${aCard("Daily submissions", subsChart)}
      </div>
      <div class="two-col" style="margin-top:14px">
        ${aCard("Submission mix", donut(
          [{ label: "Drills", value: m.drills, color: C_RED }, { label: "Lobby OS", value: m.os, color: C_BLUE }],
          String(m.drills + m.os), "uploads"))}
        ${aCard("Attendance split", totalSlots === 0 ? empty(NO_DATA) : donut(
          [{ label: "Present", value: m.presentDays, color: C_GREEN }, { label: "Absent", value: absent, color: C_OFF }],
          m.attRange + "%", "present"))}
      </div>
      <div style="margin-top:14px">${aCard("Weekly activity (8 weeks)", weeklyChart(m.sb, m.pres))}</div>
      <div class="section-head"><h2>PLAYERS</h2><p>Each player, last ${days.length} days</p></div>
      <div class="two-col">
        ${aCard("Player ranking", board.length
          ? rankBars(board.map(x => ({
              label: x.p.ign || x.p.full_name || "Player",
              sub: "D " + x.d1 + " · OS " + x.o1 + " · " + x.dates.size + " days present",
              value: x.score })))
          : empty("No approved players in this team yet."))}
        ${aCard("Attendance by player", heatmap(board.map(x => x.p), days, presentMap))}
      </div>
      <div class="section-head"><h2>DAILY RECORD</h2><p>${escapeHtml(team.name)} · every day, newest first</p></div>
      ${dailyTable(rows, ["Date", "Players present", "Drills", "Lobby OS"])}`;
  }

  // ----- every team side by side (not combined) -----
  function overview(teams, ctx, data) {
    const { days } = ctx;
    const last = days.length - 1;
    const metrics = teams.map(t => ({ t, m: teamMetrics(t.id, ctx) }));
    const byScore = [...metrics].sort((a, b) => b.m.score - a.m.score);
    const byAtt = [...metrics].sort((a, b) => b.m.attRange - a.m.attRange);
    const activeTeams = metrics.filter(x => x.m.score > 0).length;
    const totalPlayers = metrics.reduce((s, x) => s + x.m.n, 0);

    const doubtItems = Array.isArray(data.open)
      ? teams.map(t => ({ label: t.name, value: data.open.filter(d => d.team_id === t.id).length }))
          .filter(x => x.value > 0).sort((a, b) => b.value - a.value)
      : null;
    const doubtBody = doubtItems === null
      ? empty("Unanswered doubts could not be loaded.")
      : doubtItems.length
        ? `<p style="font-size:28px;margin:4px 0"><strong>${doubtItems.reduce((s, x) => s + x.value, 0)}</strong> <span class="tiny muted">waiting for a reply</span></p>${rankBars(doubtItems.slice(0, 8))}`
        : empty("No unanswered doubts. Everything is replied to.");

    const rows = metrics.map(({ t, m }) => [
      `<button type="button" data-team-pick="${t.id}" class="text-btn" style="padding:0;text-align:left">${escapeHtml(t.name)} →</button>`,
      String(m.n),
      m.presentByDay[last] + "/" + m.n,
      m.attRange + "%",
      String(m.drills),
      String(m.os)
    ]);

    const shortNames = metrics.map(x => String(x.t.name).replace(/^OGC\s+/i, ""));
    const anyUploads = metrics.some(x => x.m.drills + x.m.os > 0);
    const anyAtt = metrics.some(x => x.m.attRange > 0);

    const cards = metrics.map(({ t, m }) => `
      <article class="content-card" style="margin:0">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <h3 style="margin:0">${escapeHtml(t.name)}</h3>
          <button type="button" data-team-pick="${t.id}" class="text-btn">Open →</button>
        </div>
        <p class="tiny muted" style="margin:6px 0 10px">${m.n} players · ${m.attRange}% attendance · Drills ${m.drills} · Lobby OS ${m.os}</p>
        <div class="tiny muted">Attendance trend</div>
        ${m.presentDays ? spark(m.pct, C_GREEN, 100) : `<p class="tiny muted" style="margin:8px 0">No attendance yet</p>`}
        <div class="tiny muted" style="margin-top:8px">Drills + lobby OS per day</div>
        ${(m.drills + m.os) ? miniBars(m.drillsByDay, m.osByDay) : `<p class="tiny muted" style="margin:8px 0">No uploads yet</p>`}
      </article>`).join("");

    return `
      <div class="stats-grid">
        ${stat("TEAMS", String(teams.length), "In the organization")}
        ${stat("APPROVED PLAYERS", String(totalPlayers), "Across all teams")}
        ${stat("TEAMS ACTIVE", String(activeTeams), "With activity, last " + days.length + " days")}
      </div>
      <div class="two-col" style="margin-top:14px">
        ${aCard("Uploads by team", anyUploads
          ? legend([{ name: "Drills", color: C_RED }, { name: "Lobby OS", color: C_BLUE }]) +
            barChart(shortNames, [{ values: metrics.map(x => x.m.drills), color: C_RED }, { values: metrics.map(x => x.m.os), color: C_BLUE }],
              { stack: true, rotate: true, label: "Drills and lobby OS uploads by team" })
          : empty(NO_DATA))}
        ${aCard("Attendance by team", anyAtt
          ? `<p class="tiny muted">Average share of players present, last ${days.length} days</p>` +
            barChart(shortNames, [{ values: metrics.map(x => x.m.attRange), color: C_GREEN }],
              { max: 100, unit: "%", rotate: true, label: "Attendance percentage by team" })
          : empty(NO_DATA))}
      </div>
      <div class="section-head"><h2>EACH TEAM</h2><p>Own graphs for every team · tap Open for full records</p></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px">${cards}</div>
      <div style="margin-top:14px">${aCard("Pending reviews", doubtBody)}</div>
      <div class="section-head"><h2>TEAM COMPARISON</h2><p>One row per team</p></div>
      ${dailyTable(rows, ["Team", "Players", "Present today", "Attendance", "Drills", "Lobby OS"])}`;
  }

  // ----- a player's own records -----
  function playerView(ctx) {
    const { days, present, subs } = ctx;
    const labels = days.map(shortDate);
    const presentSet = new Set(present.map(r => r.attendance_date));
    const drillsByDay = days.map(d => subs.filter(s => s.day === d && s.kind === "DRILLS").length);
    const osByDay = days.map(d => subs.filter(s => s.day === d && s.kind === "LOBBY OS").length);
    const presentDays = days.filter(d => presentSet.has(d)).length;
    const drills = drillsByDay.reduce((a, b) => a + b, 0);
    const os = osByDay.reduce((a, b) => a + b, 0);
    const pctAtt = Math.round(presentDays / Math.max(1, days.length) * 100);
    const todayKey = days[days.length - 1];

    const subsChart = (drills + os) === 0
      ? empty(NO_DATA)
      : legend([{ name: "Drills", color: C_RED }, { name: "Lobby OS", color: C_BLUE }]) +
        barChart(labels, [{ values: drillsByDay, color: C_RED }, { values: osByDay, color: C_BLUE }],
          { stack: true, label: "Your daily submissions" });

    const me = { id: "me", ign: "You" };
    const rows = days.map((d, i) => [
      fullDate(d),
      presentSet.has(d) ? "Present" : (d === todayKey ? "Not marked yet" : "Absent"),
      String(drillsByDay[i]),
      String(osByDay[i])
    ]).reverse();

    return `
      <div class="section-head"><h2>YOUR STATS</h2><p>Updates automatically</p></div>
      <div class="stats-grid">
        ${stat("PRESENT", presentDays + "/" + days.length, "Days in range")}
        ${stat("ATTENDANCE", pctAtt + "%", "In range")}
        ${stat("DRILLS", String(drills), "In range")}
        ${stat("LOBBY OS", String(os), "In range")}
      </div>
      <div class="two-col" style="margin-top:14px">
        ${aCard("Daily submissions", subsChart)}
        ${aCard("Submission mix", donut(
          [{ label: "Drills", value: drills, color: C_RED }, { label: "Lobby OS", value: os, color: C_BLUE }],
          String(drills + os), "uploads"))}
      </div>
      <div class="two-col" style="margin-top:14px">
        ${aCard("Attendance calendar", heatmap([me], days, new Map([["me", presentSet]])))}
        ${aCard("Attendance split", donut(
          [{ label: "Present", value: presentDays, color: C_GREEN }, { label: "Absent", value: Math.max(0, days.length - presentDays), color: C_OFF }],
          pctAtt + "%", "present"))}
      </div>
      <div style="margin-top:14px">${aCard("Weekly activity (8 weeks)", weeklyChart(subs, present))}</div>
      <div class="section-head"><h2>DAILY RECORD</h2><p>Every day, newest first</p></div>
      ${dailyTable(rows, ["Date", "Attendance", "Drills", "Lobby OS"])}`;
  }

  async function buildAnalytics(scope) {
    const me = scope === "me";
    const data = await loadAnalyticsData(scope);
    let days = lastDays(analyticsRange);

    // Players: skip days from before the account existed
    if (me && currentProfile && currentProfile.created_at) {
      const joined = istKey(currentProfile.created_at);
      const kept = days.filter(d => d >= joined);
      if (kept.length) days = kept;
    }

    const present = data.attRows.filter(r => String(r.status).toLowerCase() === "present");
    const subs = data.subRows.map(r => ({ ...r, day: istKey(r.created_at) }));
    const ctx = { days, present, subs, players: data.players || [], counts: data.counts || new Map() };

    if (me) {
      return `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 14px">${rangeBar(analyticsRange)}</div>` +
        playerView(ctx);
    }

    const teams = [...data.teamRows].sort((a, b) => String(a.name).localeCompare(String(b.name)));
    if (analyticsTeam !== "all" && !teams.some(t => t.id === analyticsTeam)) analyticsTeam = "all";
    const team = teams.find(t => t.id === analyticsTeam);

    const picker = `<select id="analytics-team" style="flex:1 1 200px;min-width:0;padding:10px 12px;border-radius:10px;border:1px solid ${C_GRID};background:#14141a;color:#fff;font-size:15px">
      <option value="all">All teams — side by side</option>
      ${teams.map(t => `<option value="${t.id}"${t.id === analyticsTeam ? " selected" : ""}>${escapeHtml(t.name)}</option>`).join("")}
    </select>`;

    return `
      <div class="section-head"><h2>${team ? escapeHtml(team.name) + " ANALYTICS" : "TEAM ANALYTICS"}</h2><p>Updates automatically</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 14px">
        ${picker}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 14px">${rangeBar(analyticsRange)}</div>
      ${team ? teamView(team, ctx, data) : overview(teams, ctx, data)}`;
  }

  async function fillAnalytics(scope) {
    const slot = $("analytics-slot");
    if (!slot) return;
    if (!analyticsCache || analyticsCache.scope !== scope) {
      slot.innerHTML = empty("Loading analytics...");
    }
    try {
      slot.innerHTML = await buildAnalytics(scope);
      slot.querySelectorAll("[data-range]").forEach(b => {
        b.onclick = () => { analyticsRange = Number(b.dataset.range); fillAnalytics(scope); };
      });
      const sel = $("analytics-team");
      if (sel) sel.onchange = () => { analyticsTeam = sel.value; fillAnalytics(scope); };
      slot.querySelectorAll("[data-team-pick]").forEach(b => {
        b.onclick = () => {
          analyticsTeam = b.dataset.teamPick;
          fillAnalytics(scope).then(() => slot.scrollIntoView({ behavior: "smooth", block: "start" }));
        };
      });
      slot.querySelectorAll(".chart-scroll").forEach(el => { el.scrollLeft = el.scrollWidth; });
    } catch (e) {
      console.error("Analytics error:", e);
      slot.innerHTML = empty("Could not load analytics: " + (e && e.message ? e.message : e));
    }
  }

  async function renderDashboard() {
    showView("dashboard-view");

    $("topbar-right").innerHTML =
      '<button class="secondary-btn small" id="top-signout">Sign out</button>';

    $("top-signout").addEventListener("click", signOut);
    $("signout-btn").onclick = signOut;

    const p = currentProfile;
    const isOwner = p.account_type === "owner";
    const isMember = p.account_type === "member";

    $("dashboard-title").textContent = isOwner
      ? "Owner Control Center"
      : isMember
        ? "Member Dashboard"
        : (teams.find(t => t.id === p.team_id)?.name || "Team Dashboard");

    $("dashboard-subtitle").textContent =
      `Welcome, ${p.full_name}. ${
        isOwner
          ? "You have owner permissions."
          : isMember
            ? "Organization overview access."
            : "Your team workspace."
      }`;

    if (isOwner) await renderOwnerDashboard();
    else if (isMember) await renderMemberDashboard();
    else await renderPlayerDashboard();
  }

  async function renderPlayerDashboard() {
    const p = currentProfile;
    const team = teams.find(t => t.id === p.team_id);

    $("dashboard-content").innerHTML = `
      <div class="stats-grid">
        ${stat("ACCOUNT STATUS", "APPROVED", "Owner-approved account")}
        ${stat("PLAYER ROLE", p.player_role || "—", "Assigned role")}
        ${stat("TEAM", team?.name || "—", "Your assigned team")}
        ${stat("FF UID", p.ff_uid || "—", "Player profile")}
      </div>

      <div class="section-head">
        <h2>YOUR TEAM WORKSPACE</h2>
        <p>Visible only to approved members of your team</p>
      </div>

      ${team
        ? `<div class="team-detail-top">
             <div>
               <h2>${escapeHtml(team.name)}</h2>
               <p class="muted">Team modules and information</p>
             </div>
             <span class="tag">PRIVATE TEAM</span>
           </div>
           ${moduleCards(team.id)}`
        : empty("Your team has not been assigned yet. Please contact the website owner.")}

      <div id="analytics-slot"></div>`;

    fillAnalytics("me");
  }

  async function renderMemberDashboard() {
    const { data: teamRows, error } = await supabase
      .from("teams")
      .select("id,name")
      .order("name");

    if (error) throw error;

    const { data: counts, error: pErr } =
      await supabase.rpc("get_team_player_counts");

    if (pErr) throw pErr;

    const approvedPlayerTotal = (counts || []).reduce(
      (sum, row) => sum + Number(row.approved_count || 0), 0
    );

    $("dashboard-content").innerHTML = `
      <div class="stats-grid">
        ${stat("TEAMS", String(teamRows.length), "Organization teams")}
        ${stat("APPROVED PLAYERS", String(approvedPlayerTotal), "Across visible teams")}
        ${stat("YOUR ACCESS", "APPROVED", "Member access granted")}
        ${stat("ACTIVITY", "LIVE DATA", "Updates appear as owner records data")}
      </div>

      <div class="section-head">
        <h2>ALL TEAMS</h2>
        <p>Organization-wide view</p>
      </div>

      <div class="team-grid">
        ${teamRows.map(t => {
          const count = Number(
            (counts || []).find(row => row.team_id === t.id)?.approved_count || 0
          );

          return `<article class="team-card">
            <h3>${escapeHtml(t.name)}</h3>
            <div class="team-meta">
              <span>${count} approved player${count === 1 ? "" : "s"}</span>
              <span class="tag">TEAM</span>
            </div>
            <button data-team-open="${t.id}">View team workspace →</button>
          </article>`;
        }).join("")}
      </div>

      <div id="member-team-detail"></div>

      <div id="analytics-slot"></div>`;

    fillAnalytics("org");

    document.querySelectorAll("[data-team-open]").forEach(btn =>
      btn.addEventListener("click", () => {
        const t = teamRows.find(x => x.id === btn.dataset.teamOpen);

        $("member-team-detail").innerHTML = `
          <div class="section-head">
            <h2>${escapeHtml(t.name)} WORKSPACE</h2>
            <button class="text-btn" id="close-team-detail">Close</button>
          </div>
          ${moduleCards(t.id)}`;

        $("close-team-detail").onclick = () =>
          $("member-team-detail").innerHTML = "";

        $("member-team-detail").scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      })
    );
  }
  async function renderOwnerDashboard() {
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const pending = (profiles || []).filter(p => p.status === "pending");

    const { data: teamRows } = await supabase
      .from("teams")
      .select("id,name")
      .order("name");

    $("dashboard-content").innerHTML = `
      <div class="stats-grid">
        ${stat("TEAMS", String(teamRows?.length || 0), "Configured teams")}
        ${stat("ACCOUNTS", String(profiles.length), "All registered profiles")}
        ${stat("PENDING REQUESTS", String(pending.length), "Require your review")}
        ${stat("OWNER ACCESS", "ACTIVE", "Only designated owner can edit")}
      </div>

      <div class="section-head">
        <h2>ACCOUNT REQUESTS</h2>
        <p>Approve or reject access requests</p>
      </div>

      <div class="content-card">
        ${pending.length ? pending.map(p => {
          const team = teamRows?.find(t => t.id === p.team_id);

          return `<div class="list-row">
            <div>
              <strong>
                ${escapeHtml(p.full_name)}
                <span class="tag">${escapeHtml(p.account_type)}</span>
              </strong>
              <small>
                ${escapeHtml(p.email || "")} ·
                ${escapeHtml(team?.name || (p.account_type === "member" ? "Member" : "Team not assigned"))}
              </small>
              <small>
                ${escapeHtml(p.phone || "")}
                ${p.player_role ? " · " + escapeHtml(p.player_role) : ""}
              </small>
            </div>
            <div style="display:flex;gap:7px;flex-wrap:wrap">
              <button class="secondary-btn small" data-approve="${p.id}">Approve</button>
              <button class="secondary-btn small" data-reject="${p.id}">Reject</button>
            </div>
          </div>`;
        }).join("") : empty("No pending account requests.")}
      </div>

      <div class="section-head">
        <h2>ALL TEAMS</h2>
        <p>Owner can view and maintain organization data</p>
      </div>

      <div class="team-grid">
        ${(teamRows || []).map(t => `
          <article class="team-card">
            <h3>${escapeHtml(t.name)}</h3>
            <div class="team-meta">
              <span>Team workspace</span>
              <span class="tag">OWNER</span>
            </div>
            <button data-owner-team="${t.id}">Manage team →</button>
          </article>
        `).join("")}
      </div>

      <div id="owner-team-detail"></div>

      <div id="analytics-slot"></div>`;

    fillAnalytics("org");

    document.querySelectorAll("[data-approve]").forEach(b =>
      b.addEventListener("click", () => approveProfile(b.dataset.approve))
    );

    document.querySelectorAll("[data-reject]").forEach(b =>
      b.addEventListener("click", () => rejectProfile(b.dataset.reject))
    );

    document.querySelectorAll("[data-owner-team]").forEach(b =>
      b.addEventListener("click", () => {
        const t = teamRows.find(x => x.id === b.dataset.ownerTeam);

        $("owner-team-detail").innerHTML = `
          <div class="section-head">
            <h2>${escapeHtml(t.name)}</h2>
            <button class="text-btn" id="close-owner-team">Close</button>
          </div>
          <div class="content-card">
            ${moduleCards(t.id)}
            <p class="tiny muted">
              Team module record editing will be added in the next build stage.
            </p>
          </div>`;

        $("close-owner-team").onclick = () =>
          $("owner-team-detail").innerHTML = "";

        $("owner-team-detail").scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      })
    );
  }

  async function approveProfile(id) {
    const { data: target, error: readErr } = await supabase
      .from("profiles")
      .select("account_type")
      .eq("id", id)
      .single();

    if (readErr) return alert(readErr.message);

    const updates = {
      status: "approved",
      reviewed_at: new Date().toISOString(),
      reviewed_by: currentUser.id
    };

    if (target.account_type === "member") {
      if (!confirm(
        "Approve this member's account AND grant organization-wide access to all teams?"
      )) return;

      updates.member_access_approved = true;
    } else {
      if (!confirm(
        "Approve this player account? Make sure the team assignment is correct."
      )) return;
    }

    const { error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", id);

    if (error) return alert(error.message);

    await renderOwnerDashboard();
  }

  async function rejectProfile(id) {
    if (!confirm("Reject this account request?")) return;

    const { error } = await supabase
      .from("profiles")
      .update({
        status: "rejected",
        reviewed_at: new Date().toISOString(),
        reviewed_by: currentUser.id
      })
      .eq("id", id);

    if (error) return alert(error.message);

    await renderOwnerDashboard();
  }

  async function signOut() {
    await supabase.auth.signOut();
    currentUser = null;
    currentProfile = null;
    showView("welcome-view");
    $("topbar-right").innerHTML = "";
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    clearNotice();

    const btn = $("auth-submit");
    btn.disabled = true;

    try {
      if (mode === "login") {
        const email = $("login-email").value.trim();
        const password = $("login-password").value;

        if (!email || !password) {
          throw new Error("Enter your email and password.");
        }

        const { error } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (error) throw error;

        const { data: { user } } = await supabase.auth.getUser();
        currentUser = user;

        await loadProfile();
      } else {
        const full_name = $("full_name").value.trim();
        const birth_date = $("birth_date").value;
        const phone = $("phone").value.trim();
        const email = $("signup-email").value.trim();
        const password = $("signup-password").value;

        if (!full_name || !birth_date || !phone || !email || !password) {
          throw new Error("Complete every required field.");
        }

        if (birth_date > new Date().toISOString().slice(0, 10)) {
          throw new Error("Birthdate cannot be in the future.");
        }

        const profile = {
          full_name,
          birth_date,
          phone,
          email,
          account_type: selectedType,
          status: "pending",
          member_access_approved: false
        };

        if (selectedType === "player") {
          profile.ign = $("ign").value.trim();
          profile.ff_uid = $("ff_uid").value.trim();
          profile.player_role = $("player_role").value;
          profile.team_id = $("team_id").value;

          if (!profile.ign || !profile.ff_uid ||
              !profile.player_role || !profile.team_id) {
            throw new Error("Complete every required player field.");
          }
        }

        const { data, error } = await 
          supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo:

          "https://ogcesports.github.io/Ogc-esports-management/",
            data: {
              full_name,
              account_type: selectedType,
              ogc_profile_request: profile
            }
          }
        });

        if (error) throw error;

        if (!data.user) {
          throw new Error("Account request could not be completed. Please try again.");
        }

        if (!data.session) {
          notice(
            "Check your email to confirm your account, then return here and log in. Your pending profile request will be created after your first confirmed login.",
            "success"
          );
          return;
        }

        const { error: insertError } = await supabase
          .from("profiles")
          .insert({ id: data.user.id, ...profile });

        if (insertError) throw insertError;

        currentUser = data.user;
        await loadProfile();
      }
    } catch (e) {
      notice(e.message || "Something went wrong. Please try again.", "error");
    } finally {
      btn.disabled = false;
    }
  }

  function chooseType(type) {
    selectedType = type;

    $("auth-heading").textContent =
      type === "player" ? "Player access request" : "Member access request";

    $("auth-subheading").textContent =
      type === "player"
        ? "Enter your player and team details. The owner must approve your account."
        : "Enter your details. The owner must approve your account and organization-wide access.";

    $("player-fields").classList.toggle("hidden", type !== "player");

    ["ign", "ff_uid", "player_role", "team_id"].forEach(id =>
      $(id).required = type === "player"
    );

    ["full_name", "birth_date", "phone", "signup-email", "signup-password"]
      .forEach(id => $(id).required = true);

    $("login-email").required = false;
    $("login-password").required = false;

    setMode("signup");
    showView("auth-view");
  }

  async function init() {
    $("birth_date").max = new Date().toISOString().slice(0, 10);

    document.querySelectorAll("[data-choice]").forEach(b =>
      b.addEventListener("click", () => chooseType(b.dataset.choice))
    );

    document.querySelectorAll("[data-mode]").forEach(b =>
      b.addEventListener("click", () => setMode(b.dataset.mode))
    );

    $("back-to-welcome").onclick = () => showView("welcome-view");
    $("auth-form").addEventListener("submit", handleAuthSubmit);
    $("pending-signout").onclick = signOut;

    $("pending-refresh").onclick = async () => {
      try {
        await showWelcomeOrDashboard();
      } catch (e) {
        alert(e.message);
      }
    };

    $("signout-btn").onclick = signOut;

    if (!configReady()) {
      showView("welcome-view");

      const msg = document.createElement("p");
      msg.className = "notice error";
      msg.textContent =
        "Setup required: add your Supabase project URL and publishable/anon key in config.js before using login.";

      $("welcome-view").appendChild(msg);
      return;
    }

    if (!window.supabase || !window.supabase.createClient) {
      showStartupProblem("Could not load the Supabase library. Check your internet connection and try again.");
      return;
    }

    supabase = window.supabase.createClient(
      window.OGC_CONFIG.SUPABASE_URL,
      window.OGC_CONFIG.SUPABASE_ANON_KEY,
      {
        auth: {
          // Prevents the browser Web Locks freeze that can hang all requests.
          lock: async (_name, _acquireTimeout, fn) => await fn()
        }
      }
    );

    try {
      await withTimeout(loadTeams(), 10000, "Loading teams");
      try {
        await withTimeout(showWelcomeOrDashboard(), 8000, "Checking login");
      } catch (loginErr) {
        console.warn("Login check failed, resetting saved session:", loginErr);
        resetSavedLogin();
        currentUser = null;
        currentProfile = null;
        showView("welcome-view");
      }
    } catch (e) {
      console.error("OGC startup error:", e);
      showStartupProblem("Startup error: " + (e && e.message ? e.message : e));
    }

    supabase.auth.onAuthStateChange((_event, session) => {
      if (session && !currentUser) {
        currentUser = session.user;
        setTimeout(() => loadProfile().catch(console.error), 0);
      }
    });
  }

const splash = document.querySelector("#loading-view");

if (splash) {
  window.setTimeout(() => {
    splash.classList.add("hidden");
  }, 4000);
}

function safeInit() {
  init().catch(e => {
    console.error("OGC init crashed:", e);
    showStartupProblem("App error: " + (e && e.message ? e.message : e));
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", safeInit);
} else {
  safeInit();
}

})();
