(() => {
  "use strict";
  const TEAM_NAMES = [
    "OGC GALAXY","OGC LDR","OGC TITAN","OGC BRB","OGC NMS",
    "OGC ROYALS","OGC SYNDICATE","OGC AXOLOTLS","OGC RANGERS",
    "OGC X GLADIATOR","OGC HUSTLERS","OGC ESPORTS","OGC ESPORTS 1",
    "OGC ESPORTS 2","OGC ESPORTS 3"
  ];
  const MODULES = [
    ["◷","ATTENDANCE","Attendance status and history"],
    ["✦","DRILLS","Daily drills and training tasks"],
    ["▤","LOBBY OS","Lobby operating standards"],
    ["?","DOUBT BOX","Questions and answers"],
    ["▦","TOURNAMENT SCHEDULES","Tournament dates and details"],
    ["◴","UPCOMING SESSIONS","Planned sessions and reviews"]
  ];
  const $ = (id) => document.getElementById(id);
  const views = ["loading-view","welcome-view","auth-view","pending-view","dashboard-view"];
  let supabase = null, selectedType = null, mode = "signup", currentUser = null, currentProfile = null, teams = [];

  function showView(id) { views.forEach(v => $(v).classList.toggle("hidden", v !== id)); }
  function notice(message, type = "success") {
    const el = $("auth-message"); el.textContent = message; el.className = `notice ${type}`;
  }
  function clearNotice() { $("auth-message").className = "notice hidden"; $("auth-message").textContent = ""; }
  
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
    return window.OGC_CONFIG && window.OGC_CONFIG.SUPABASE_URL.startsWith("https://") &&
      !window.OGC_CONFIG.SUPABASE_URL.includes("PASTE_") &&
      window.OGC_CONFIG.SUPABASE_ANON_KEY && !window.OGC_CONFIG.SUPABASE_ANON_KEY.includes("PASTE_");
  }
  async function loadTeams() {
    const { data, error } = await supabase.from("teams").select("id,name").order("name");
    if (error) throw error;
    teams = data || [];
    $("team_id").innerHTML = '<option value="">Select your team</option>' +
      teams.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join("");
  }
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }
  function selectedTeamName() {
    const t = teams.find(x => x.id === $("team_id").value);
    return t ? t.name : "";
  }
  async function showWelcomeOrDashboard() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { currentUser = null; currentProfile = null; $("topbar-right").innerHTML = ""; showView("welcome-view"); return; }
    currentUser = session.user;
    await loadProfile();
  }
  async function loadProfile() {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", currentUser.id).maybeSingle();
    if (error) throw error;
    currentProfile = data;
    // If email confirmation was required, create the pending profile on the first confirmed login.
    if (!data && currentUser.user_metadata && currentUser.user_metadata.ogc_profile_request) {
      const request = currentUser.user_metadata.ogc_profile_request;
      const { error: createError } = await supabase.from("profiles").insert({ id: currentUser.id, ...request });
      if (createError) throw createError;
      return loadProfile();
    }
    if (!data || data.status !== "approved" || (data.account_type === "member" && !data.member_access_approved)) {
      showView("pending-view"); $("topbar-right").innerHTML = '<span class="secure-pill">ACCOUNT REVIEW</span>'; return;
    }
    await renderDashboard();
  }
  function stat(label, value, foot = "") {
    return `<div class="stat-card"><div class="stat-label">${escapeHtml(label)}</div><div class="stat-value">${escapeHtml(value)}</div><div class="stat-foot">${escapeHtml(foot)}</div></div>`;
  }
  function moduleCards(teamId) {
  return `<div class="module-grid">${MODULES.map((m, i) => `
    <button type="button" class="module-card"
      data-module="${i}"
      style="text-align:left;width:100%;cursor:pointer;color:inherit">
      <div class="module-icon">${m[0]}</div>
      <h3>${m[1]}</h3>
      <p>${m[2]}</p>
    </button>
  `).join("")}</div>`;
}  
document.addEventListener("click", async function(event) {
  const button = event.target.closest("[data-module]");
  if (!button) return;
  const module = MODULES[Number(button.dataset.module)];
  if (!module) return;
  const teamId = button.dataset.teamId;
  const team = teams.find(t => t.id === teamId);
  const title = module[1];
  if (!team) {
    alert("Team not found. Please reopen the team workspace.");
    return;
  }
  alert(
    title + "\nTeam: " + team.name +
    "\n\nThis module's records and editing form still need to be connected."
  );
});
  function empty(message) { return `<div class="empty-state">${escapeHtml(message)}</div>`; }
  async function renderDashboard() {
    showView("dashboard-view");
    $("topbar-right").innerHTML = `<button class="secondary-btn small" id="top-signout">Sign out</button>`;
    $("top-signout").addEventListener("click", signOut);
    $("signout-btn").onclick = signOut;
    const p = currentProfile;
    const isOwner = p.account_type === "owner";
    const isMember = p.account_type === "member";
    $("dashboard-title").textContent = isOwner ? "Owner Control Center" : isMember ? "Member Dashboard" : (teams.find(t => t.id === p.team_id)?.name || "Team Dashboard");
    $("dashboard-subtitle").textContent = `Welcome, ${p.full_name}. ${isOwner ? "You have owner permissions." : isMember ? "Organization overview access." : "Your team workspace."}`;
    if (isOwner) await renderOwnerDashboard();
    else if (isMember) await renderMemberDashboard();
    else await renderPlayerDashboard();
  async function renderPlayerDashboard() {
    const p = currentProfile;
    const team = teams.find(t => t.id === p.team_id);
    $("dashboard-content").innerHTML = `
      <div class="stats-grid">${stat("ACCOUNT STATUS","APPROVED","Owner-approved account")}${stat("PLAYER ROLE",p.player_role || "—","Assigned role")}${stat("TEAM",team?.name || "—","Your assigned team")}${stat("FF UID",p.ff_uid || "—","Player profile")}</div>
      <div class="section-head"><h2>YOUR TEAM WORKSPACE</h2><p>Visible only to approved members of your team</p></div>
      ${team ? `<div class="team-detail-top"><div><h2>${escapeHtml(team.name)}</h2><p class="muted">Team modules and information</p></div><span class="tag">PRIVATE TEAM</span></div>${moduleCards(team.id)}` : empty("Your team has not been assigned yet. Please contact the website owner.")}
      <div class="section-head"><h2>TEAM STATS</h2></div>
      <div class="two-col"><div class="content-card"><h3>Performance overview</h3><div class="chart-placeholder">Team performance charts will appear here once the owner adds daily performance records.</div></div><div class="content-card"><h3>Attendance</h3><div class="chart-placeholder">Your attendance graph will appear here when attendance records are added.</div></div></div>`;
  }
  async function renderMemberDashboard() {
    const { data: teamRows, error } = await supabase.from("teams").select("id,name").order("name");
    if (error) throw error;
    const { data: counts, error: pErr } = await supabase.rpc("get_team_player_counts");
    if (pErr) throw pErr;
    const approvedPlayerTotal = (counts || []).reduce((sum, row) => sum + Number(row.approved_count || 0), 0);
    $("dashboard-content").innerHTML = `
      <div class="stats-grid">${stat("TEAMS",String(teamRows.length),"Organization teams")}${stat("APPROVED PLAYERS",String(approvedPlayerTotal),"Across visible teams")}${stat("YOUR ACCESS","APPROVED","Member access granted")}${stat("ACTIVITY","LIVE DATA","Updates appear as owner records data")}</div>
      <div class="section-head"><h2>ALL TEAMS</h2><p>Organization-wide view</p></div>
      <div class="team-grid">${teamRows.map(t => {
        const count = Number((counts || []).find(row => row.team_id === t.id)?.approved_count || 0);
        return `<article class="team-card"><h3>${escapeHtml(t.name)}</h3><div class="team-meta"><span>${count} approved player${count===1?"":"s"}</span><span class="tag">TEAM</span></div><button data-team-open="${t.id}">View team workspace →</button></article>`;
      }).join("")}</div>
      <div id="member-team-detail"></div>
      <div class="section-head"><h2>ORGANIZATION ANALYTICS</h2><p>Owner-maintained reporting</p></div>
      <div class="two-col"><div class="content-card"><h3>Daily performance</h3><div class="chart-placeholder">Performance graph will populate after the owner records daily team metrics.</div></div><div class="content-card"><h3>Attendance analysis</h3><div class="chart-placeholder">Attendance graph will populate after the owner records attendance.</div></div></div>
      <div class="two-col" style="margin-top:14px"><div class="content-card"><h3>Weekly team activity</h3>${empty("Weekly activity will appear after activity records are entered.")}</div><div class="content-card"><h3>Pending reviews</h3>${empty("No review data has been added yet.")}</div></div>
      <div class="section-head"><h2>TOP ACTIVE PLAYERS</h2></div><div class="content-card">${empty("Activity rankings will appear when the owner records player activity.")}</div>`;
    document.querySelectorAll("[data-team-open]").forEach(btn => btn.addEventListener("click", () => {
      const t = teamRows.find(x => x.id === btn.dataset.teamOpen);
      $("member-team-detail").innerHTML = `<div class="section-head"><h2>${escapeHtml(t.name)} WORKSPACE</h2><button class="text-btn" id="close-team-detail">Close</button></div>${moduleCards(t.id)}`;
      $("close-team-detail").onclick = () => $("member-team-detail").innerHTML = "";
      $("member-team-detail").scrollIntoView({behavior:"smooth",block:"start"});
    }));
  }
  async function renderOwnerDashboard() {
    const { data: profiles, error } = await supabase.from("profiles").select("*").order("created_at",{ascending:false});
    if (error) throw error;
    const pending = (profiles || []).filter(p => p.status === "pending");
    const { data: teamRows } = await supabase.from("teams").select("id,name").order("name");
    $("dashboard-content").innerHTML = `
      <div class="stats-grid">${stat("TEAMS",String(teamRows?.length || 0),"Configured teams")}${stat("ACCOUNTS",String(profiles.length),"All registered profiles")}${stat("PENDING REQUESTS",String(pending.length),"Require your review")}${stat("OWNER ACCESS","ACTIVE","Only designated owner can edit")}</div>
      <div class="section-head"><h2>ACCOUNT REQUESTS</h2><p>Approve or reject access requests</p></div>
      <div class="content-card">${pending.length ? pending.map(p => {
        const team = teamRows?.find(t => t.id === p.team_id);
        return `<div class="list-row"><div><strong>${escapeHtml(p.full_name)} <span class="tag">${escapeHtml(p.account_type)}</span></strong><small>${escapeHtml(p.email || "")} · ${escapeHtml(team?.name || (p.account_type==="member"?"Member":"Team not assigned"))}</small><small>${escapeHtml(p.phone || "")} ${p.player_role ? "· "+escapeHtml(p.player_role) : ""}</small></div><div style="display:flex;gap:7px;flex-wrap:wrap"><button class="secondary-btn small" data-approve="${p.id}">Approve</button><button class="secondary-btn small" data-reject="${p.id}">Reject</button></div></div>`;
      }).join("") : empty("No pending account requests.")}</div>
      <div class="section-head"><h2>ALL TEAMS</h2><p>Owner can view and maintain organization data</p></div>
      <div class="team-grid">${(teamRows||[]).map(t => `<article class="team-card"><h3>${escapeHtml(t.name)}</h3><div class="team-meta"><span>Team workspace</span><span class="tag">OWNER</span></div><button data-owner-team="${t.id}">Manage team →</button></article>`).join("")}</div>
      <div id="owner-team-detail"></div>
      <p class="tiny muted">This starter version supports secure account approval. Attendance, drill records, performance charts and review workflows are the next build stage.</p>`;
    document.querySelectorAll("[data-approve]").forEach(b => b.addEventListener("click", () => approveProfile(b.dataset.approve)));
    document.querySelectorAll("[data-reject]").forEach(b => b.addEventListener("click", () => rejectProfile(b.dataset.reject)));
    document.querySelectorAll("[data-owner-team]").forEach(b => b.addEventListener("click", () => {
      const t = teamRows.find(x => x.id === b.dataset.ownerTeam);
      $("owner-team-detail").innerHTML = `<div class="section-head"><h2>${escapeHtml(t.name)}</h2><button class="text-btn" id="close-owner-team">Close</button></div><div class="content-card">${moduleCards(t.id)}<p class="tiny muted">Team module record editing will be added in the next build stage.</p></div>`;
      $("close-owner-team").onclick = () => $("owner-team-detail").innerHTML = "";
      $("owner-team-detail").scrollIntoView({behavior:"smooth",block:"start"});
    }));
  }
  async function approveProfile(id) {
    const { data: target, error: readErr } = await supabase.from("profiles").select("account_type").eq("id",id).single();
    if (readErr) return alert(readErr.message);
    const updates = { status:"approved", reviewed_at:new Date().toISOString(), reviewed_by:currentUser.id };
    if (target.account_type === "member") {
      if (!confirm("Approve this member's account AND grant organization-wide access to all teams?")) return;
      updates.member_access_approved = true;
    } else {
      if (!confirm("Approve this player account? Make sure the team assignment is correct.")) return;
    }
    const { error } = await supabase.from("profiles").update(updates).eq("id",id);
    if (error) return alert(error.message);
    await renderOwnerDashboard();
  }
  async function rejectProfile(id) {
    if (!confirm("Reject this account request?")) return;
    const { error } = await supabase.from("profiles").update({status:"rejected",reviewed_at:new Date().toISOString(),reviewed_by:currentUser.id}).eq("id",id);
    if (error) return alert(error.message);
    await renderOwnerDashboard();
  }
  async function signOut() { await supabase.auth.signOut(); currentUser = null; currentProfile = null; showView("welcome-view"); $("topbar-right").innerHTML = ""; }
  async function handleAuthSubmit(event) {
    event.preventDefault(); clearNotice();
    const btn = $("auth-submit"); btn.disabled = true;
    try {
      if (mode === "login") {
        const email = $("login-email").value.trim(), password = $("login-password").value;
        if (!email || !password) throw new Error("Enter your email and password.");
        const { error } = await supabase.auth.signInWithPassword({email,password});
        if (error) throw error;
        const { data: { user } } = await supabase.auth.getUser(); currentUser = user;
        await loadProfile();
      } else {
        const full_name = $("full_name").value.trim();
        const birth_date = $("birth_date").value;
        const phone = $("phone").value.trim();
        const email = $("signup-email").value.trim();
        const password = $("signup-password").value;
        if (!full_name || !birth_date || !phone || !email || !password) throw new Error("Complete every required field.");
        if (birth_date > new Date().toISOString().slice(0,10)) throw new Error("Birthdate cannot be in the future.");
        const profile = { full_name,birth_date,phone,email,account_type:selectedType,status:"pending",member_access_approved:false };
        if (selectedType === "player") {
          profile.ign = $("ign").value.trim();
          profile.ff_uid = $("ff_uid").value.trim();
          profile.player_role = $("player_role").value;
          profile.team_id = $("team_id").value;
          if (!profile.ign || !profile.ff_uid || !profile.player_role || !profile.team_id) throw new Error("Complete every required player field.");
        }
        const { data, error } = await supabase.auth.signUp({email,password,options:{data:{full_name,account_type:selectedType,ogc_profile_request:profile}}});
        if (error) throw error;
        if (!data.user) throw new Error("Account request could not be completed. Please try again.");
        if (!data.session) {
          notice("Check your email to confirm your account, then return here and log in. Your pending profile request will be created after your first confirmed login.", "success");
          return;
        }
        const { error: insertError } = await supabase.from("profiles").insert({id:data.user.id,...profile});
        if (insertError) throw insertError;
        currentUser = data.user;
        await loadProfile();
      }
    } catch (e) { notice(e.message || "Something went wrong. Please try again.", "error"); }
    finally { btn.disabled = false; }
  }
  function chooseType(type) {
    selectedType = type;
    $("auth-heading").textContent = type === "player" ? "Player access request" : "Member access request";
    $("auth-subheading").textContent = type === "player" ? "Enter your player and team details. The owner must approve your account." : "Enter your details. The owner must approve your account and organization-wide access.";
    $("player-fields").classList.toggle("hidden", type !== "player");
    ["ign","ff_uid","player_role","team_id"].forEach(id => $(id).required = type === "player");
    ["full_name","birth_date","phone","signup-email","signup-password"].forEach(id => $(id).required = true);
    $("login-email").required = false; $("login-password").required = false;
    setMode("signup"); showView("auth-view");
  }
  async function init() {
    $("birth_date").max = new Date().toISOString().slice(0,10);
    document.querySelectorAll("[data-choice]").forEach(b => b.addEventListener("click", () => chooseType(b.dataset.choice)));
    document.querySelectorAll("[data-mode]").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));
    $("back-to-welcome").onclick = () => showView("welcome-view");
    $("auth-form").addEventListener("submit", handleAuthSubmit);
    $("pending-signout").onclick = signOut;
    $("pending-refresh").onclick = async () => { try { await showWelcomeOrDashboard(); } catch(e) { alert(e.message); } };
    $("signout-btn").onclick = signOut;
    if (!configReady()) {
      showView("welcome-view");
      const msg = document.createElement("p");
      msg.className = "notice error";
      msg.textContent = "Setup required: add your Supabase project URL and publishable/anon key in config.js before using login.";
      $("welcome-view").appendChild(msg);
      return;
    }
    supabase = window.supabase.createClient(window.OGC_CONFIG.SUPABASE_URL,window.OGC_CONFIG.SUPABASE_ANON_KEY);
    try { await loadTeams(); await showWelcomeOrDashboard(); }
    catch (e) {
    showView("welcome-view");
    console.error("OGC startup error:", e);
    alert("Website startup error: " + e.message);
    }    
    supabase.auth.onAuthStateChange((_event, session) => {
      if (session && !currentUser) { currentUser = session.user; setTimeout(() => loadProfile().catch(console.error),0); }
    });
  }
  document.addEventListener("DOMContentLoaded", init);
})();
