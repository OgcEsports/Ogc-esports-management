(() => {
  "use strict";

  const TEAM_NAMES = [
    "OGC GALAXY", "OGC LDR", "OGC TITAN", "OGC BRB", "OGC NMS",
    "OGC ROYALS", "OGC SYNDICATE", "OGC AXOLOTLS", "OGC RANGERS",
    "OGC X GLADIATOR", "OGC HUSTLERS", "OGC ESPORTS", "OGC ESPORTS 1",
    "OGC ESPORTS 2", "OGC ESPORTS 3"
  ];

  const MODULES = [
    ["◷", "ATTENDANCE", "Attendance status and history"],
    ["✦", "DRILLS", "Daily drills and training tasks"],
    ["▤", "LOBBY OS", "Lobby operating standards"],
    ["?", "DOUBT BOX", "Questions and answers"],
    ["▦", "TOURNAMENT SCHEDULES", "Tournament dates and details"],
    ["◴", "UPCOMING SESSIONS", "Planned sessions and reviews"]
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
    views.forEach(v => $(v).classList.toggle("hidden", v !== id));
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
    const { data, error } = await supabase
      .from("teams")
      .select("id,name")
      .order("name");

    if (error) throw error;

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
    return `<div class="module-grid">${MODULES.map((m, i) => `
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
      ${(!isOwner && !isMember) ? `<button type="button" id="attendance-mark" style="margin-top:14px">Mark My Attendance — Present</button>` : ""}
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

    $("attendance-mark")?.addEventListener("click", async () => {
      const button = $("attendance-mark");
      button.disabled = true;
      button.textContent = "Submitting…";
      try {
        const { error } = await supabase.rpc("mark_my_attendance");
        if (error) throw error;
        alert("Attendance marked as Present.");
        await loadAttendance();
      } catch (e) {
        alert(e.message || "Could not mark attendance.");
        button.disabled = false;
        button.textContent = "Mark My Attendance — Present";
      }
    });

    try {
      await loadAttendance();
    } catch (e) {
      $("attendance-message").textContent = "Could not load attendance: " + e.message;
    }
  }
  async function openSubmission(team, kind) {
    const old = $("submission-panel"); if (old) old.remove();
    const panel = document.createElement("section");
    panel.id = "submission-panel"; panel.className = "content-card"; panel.style.marginTop = "18px";
    const isDrill = kind === "DRILLS";
    panel.innerHTML = `
      <div class="section-head"><h2>${isDrill ? "DRILL SUBMISSION" : "LOBBY OS SUBMISSION"} — ${escapeHtml(team.name)}</h2><button type="button" class="text-btn" id="submission-close">Close</button></div>
      <p class="muted">Submit your ${isDrill ? "daily training task" : "lobby operating standards proof"}. Your submission is saved for the owner to review.</p>
      <form id="submission-form" style="display:grid;gap:12px;max-width:650px">
        <label>Title *<input id="submission-title" required maxlength="120" placeholder="${isDrill ? "e.g. Daily training task" : "e.g. Custom room compliance"}" style="display:block;width:100%;margin-top:6px"></label>
        ${isDrill ? `<label>Drill category *<select id="submission-category" required style="display:block;width:100%;margin-top:6px"><option value="">Select category</option><option>Primary</option><option>Secondary</option><option>Assaulter</option><option>One-tap</option><option>BR 1v4</option><option>Other</option></select></label><label>Details / result *<textarea id="submission-details" required rows="4" maxlength="4000" placeholder="Kills, KD, streak, practice notes, etc." style="display:block;width:100%;margin-top:6px"></textarea></label>` : ""}
        <label>${isDrill ? "Proof" : "Screenshot"} *<input id="submission-proof" type="url" required maxlength="1000" placeholder="Paste screenshot/video link" style="display:block;width:100%;margin-top:6px"></label>
        <button type="submit" id="submission-submit">Submit ${isDrill ? "drill" : "OS"}</button><p id="submission-status" class="tiny muted"></p>
      </form>
      <div class="section-head"><h2>MY RECENT SUBMISSIONS</h2></div><div id="submission-history" class="tiny muted">Loading…</div>`;
    $("dashboard-content").appendChild(panel); panel.scrollIntoView({behavior:"smooth",block:"start"});
    $("submission-close").onclick=()=>panel.remove();
    const status=$("submission-status");
    async function loadMine(){
      const {data,error}=await supabase.from("team_submissions").select("id,kind,title,category,details,proof_url,status,created_at").eq("team_id",team.id).eq("user_id",currentUser.id).eq("kind",kind).order("created_at",{ascending:false}).limit(10);
      if(error){$("submission-history").textContent="Could not load history: "+error.message;return;}
      $("submission-history").innerHTML=data.length?`<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse"><thead><tr><th align="left">Date</th><th align="left">Title</th><th align="left">Status</th><th align="left">${isDrill?"Proof":"Screenshot"}</th></tr></thead><tbody>${data.map(x=>`<tr><td style="padding:8px;border-top:1px solid #333">${new Date(x.created_at).toLocaleDateString("en-IN")}</td><td style="padding:8px;border-top:1px solid #333">${escapeHtml(x.title)}${x.category?`<div class="tiny muted">${escapeHtml(x.category)}</div>`:""}</td><td style="padding:8px;border-top:1px solid #333">${escapeHtml(x.status)}</td><td style="padding:8px;border-top:1px solid #333"><a href="${escapeHtml(x.proof_url)}" target="_blank" rel="noopener">Open</a></td></tr>`).join("")}</tbody></table></div>`:"No submissions yet.";
    }
    $("submission-form").onsubmit=async e=>{
      e.preventDefault(); const btn=$("submission-submit");btn.disabled=true;status.textContent="Submitting…";
      try{const payload={team_id:team.id,user_id:currentUser.id,kind,title:$("submission-title").value.trim(),category:isDrill?$("submission-category").value:null,details:isDrill?$("submission-details").value.trim():"Screenshot submitted",proof_url:$("submission-proof").value.trim()};
        const {error}=await supabase.from("team_submissions").insert(payload);if(error)throw error;status.textContent="Submitted successfully.";$("submission-form").reset();await loadMine();
      }catch(e){status.textContent="Submission failed: "+e.message;}finally{btn.disabled=false;}
    };
    await loadMine();
  }

  async function openDoubtBox(team) {
    const old=$("feature-panel"); if(old) old.remove();
    const panel=document.createElement("section"); panel.id="feature-panel"; panel.className="content-card"; panel.style.marginTop="18px";
    panel.innerHTML=`<div class="section-head"><h2>DOUBT BOX — ${escapeHtml(team.name)}</h2><button type="button" class="text-btn" id="feature-close">Close</button></div>
      <p class="muted">Ask a question and attach supporting photos or videos if needed.</p>
      <form id="doubt-form" style="display:grid;gap:12px;max-width:650px">
      <label>Your doubt *<textarea id="doubt-question" required maxlength="4000" rows="5" placeholder="Type your question here..." style="display:block;width:100%;margin-top:6px"></textarea></label>
      <label>Photos / videos (optional)<input id="doubt-files" type="file" accept="image/*,video/*" multiple style="display:block;width:100%;margin-top:6px"></label>
      <p class="tiny muted">Maximum 5 files, 25 MB per file. Photos and videos are stored privately.</p>
      <button type="submit" id="doubt-submit">Submit doubt</button><p id="doubt-status" class="tiny muted"></p></form>
      <div class="section-head"><h2>MY RECENT DOUBTS</h2></div><div id="doubt-history" class="tiny muted">Loading…</div>`;
    $("dashboard-content").appendChild(panel); panel.scrollIntoView({behavior:"smooth",block:"start"}); $("feature-close").onclick=()=>panel.remove();
    async function loadDoubts(){
      let query=supabase.from("doubt_submissions").select("id,user_id,question,attachment_paths,status,owner_response,created_at").eq("team_id",team.id).order("created_at",{ascending:false}).limit(20);
      if(currentProfile?.account_type!=="owner" && currentProfile?.account_type!=="member") query=query.eq("user_id",currentUser.id);
      const {data,error}=await query;
      if(error){$("doubt-history").textContent="Could not load doubts: "+error.message;return;}
      const cards=[];
      for(const d of (data||[])){
        const links=[];
        for(const path of (d.attachment_paths||[])){
          const {data:linkData}=await supabase.storage.from("ogc-doubt-attachments").createSignedUrl(path,3600);
          if(linkData?.signedUrl) links.push(`<a href="${escapeHtml(linkData.signedUrl)}" target="_blank" rel="noopener">Open attachment</a>`);
        }
        cards.push(`<article style="padding:10px 0;border-bottom:1px solid #333"><strong>${escapeHtml(new Date(d.created_at).toLocaleString("en-IN"))}</strong><p>${escapeHtml(d.question)}</p><small class="muted">${escapeHtml(d.status)}${currentProfile?.account_type==="owner"?" · User "+escapeHtml(d.user_id):""}</small><p>${links.join(" · ")||"No attachments"}</p>${d.owner_response?`<p><strong>Owner response:</strong> ${escapeHtml(d.owner_response)}</p>`:""}${currentProfile?.account_type==="owner"?`<label>Owner response<textarea id="doubt-response-${d.id}" rows="2" maxlength="4000">${escapeHtml(d.owner_response||"")}</textarea></label><button type="button" class="secondary-btn small" data-doubt-reply="${d.id}">Save response</button>`:""}</article>`);
      }
      $("doubt-history").innerHTML=cards.join("")||"No doubts submitted yet.";
      panel.querySelectorAll("[data-doubt-reply]").forEach(b=>b.onclick=async()=>{const id=b.dataset.doubtReply;const response=$("doubt-response-"+id).value.trim();const {error}=await supabase.from("doubt_submissions").update({owner_response:response,status:response?"answered":"submitted",updated_at:new Date().toISOString()}).eq("id",id);if(error)alert(error.message);else await loadDoubts();});
    }
    $("doubt-form").onsubmit=async e=>{
      e.preventDefault(); const btn=$("doubt-submit"), msg=$("doubt-status"), files=Array.from($("doubt-files").files||[]);
      if(files.length>5){msg.textContent="Please attach no more than 5 files.";return;}
      if(files.some(f=>f.size>25*1024*1024)){msg.textContent="Each file must be 25 MB or smaller.";return;}
      btn.disabled=true;msg.textContent="Uploading and submitting…";
      try{
        const paths=[];
        for(const file of files){
          if(!file.type.startsWith("image/")&&!file.type.startsWith("video/")) throw new Error("Only photos and videos are allowed.");
          const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
          const path=`${currentUser.id}/${Date.now()}-${Math.random().toString(36).slice(2)}-${safe}`;
          const {error:uploadError}=await supabase.storage.from("ogc-doubt-attachments").upload(path,file,{upsert:false,contentType:file.type});
          if(uploadError)throw uploadError; paths.push(path);
        }
        const {error}=await supabase.from("doubt_submissions").insert({team_id:team.id,user_id:currentUser.id,question:$("doubt-question").value.trim(),attachment_paths:paths});
        if(error)throw error;
        msg.textContent="Doubt submitted successfully."; $("doubt-form").reset(); await loadDoubts();
      }catch(err){msg.textContent="Submission failed: "+err.message;}finally{btn.disabled=false;}
    };
    await loadDoubts();
  }

  async function openEvents(team, eventType) {
    const isOwner=currentProfile?.account_type==="owner";
    const old=$("feature-panel"); if(old) old.remove();
    const title=eventType==="TOURNAMENT"?"TOURNAMENT SCHEDULES":"UPCOMING SESSIONS";
    const panel=document.createElement("section");panel.id="feature-panel";panel.className="content-card";panel.style.marginTop="18px";
    panel.innerHTML=`<div class="section-head"><h2>${title} — ${escapeHtml(team.name)}</h2><button type="button" class="text-btn" id="feature-close">Close</button></div>
      ${isOwner?`<form id="event-form" style="display:grid;gap:12px;max-width:650px;margin-bottom:20px">
      <label>${eventType==="TOURNAMENT"?"Tournament name":"Session name"} *<input id="event-title" required maxlength="160" style="display:block;width:100%;margin-top:6px" placeholder="${eventType==="TOURNAMENT"?"e.g. OGC Championship":"e.g. Team Training Session"}"></label>
      <label>Date *<input id="event-date" type="date" required style="display:block;width:100%;margin-top:6px"></label>
      <label>Time *<input id="event-time" type="time" required style="display:block;width:100%;margin-top:6px"></label>
      ${eventType==="SESSION"?`<label>Session taken by *<input id="event-conductor" required maxlength="120" style="display:block;width:100%;margin-top:6px" placeholder="Trainer's name"></label>`:""}
      <label>Description (optional)<textarea id="event-description" maxlength="2000" rows="2" style="display:block;width:100%;margin-top:6px" placeholder="Additional details"></textarea></label>
      <button type="submit" id="event-save">Add ${eventType==="TOURNAMENT"?"tournament":"session"}</button><p id="event-status" class="tiny muted"></p></form>`:"<p class='muted'>Schedules are managed by the owner.</p>"}
      <div id="events-list" class="tiny muted">Loading schedule…</div>`;
    $("dashboard-content").appendChild(panel);panel.scrollIntoView({behavior:"smooth",block:"start"});$("feature-close").onclick=()=>panel.remove();
    async function loadEvents(){
      const {data,error}=await supabase.from("portal_events").select("id,event_type,title,event_date,event_time,conductor,description").eq("team_id",team.id).eq("event_type",eventType).order("event_date").order("event_time");
      if(error){$("events-list").textContent="Could not load schedule: "+error.message;return;}
      $("events-list").innerHTML=data.length?data.map(ev=>`<article class="content-card" style="margin:10px 0"><h3>${escapeHtml(ev.title)}</h3><p>📅 ${escapeHtml(ev.event_date)} · 🕒 ${escapeHtml(String(ev.event_time).slice(0,5))}</p>${eventType==="SESSION"?`<p>👤 Session taken by: <strong>${escapeHtml(ev.conductor||"—")}</strong></p>`:""}${ev.description?`<p>${escapeHtml(ev.description)}</p>`:""}${isOwner?`<button type="button" class="secondary-btn small" data-event-edit="${ev.id}">Edit</button> <button type="button" class="secondary-btn small" data-event-delete="${ev.id}">Delete</button>`:""}</article>`).join(""):"No events scheduled yet.";
      panel.querySelectorAll("[data-event-edit]").forEach(b=>b.onclick=async()=>{const ev=data.find(x=>String(x.id)===b.dataset.eventEdit);if(!ev)return;$("event-title").value=ev.title;$("event-date").value=ev.event_date;$("event-time").value=String(ev.event_time).slice(0,5);if($("event-conductor"))$("event-conductor").value=ev.conductor||"";$("event-description").value=ev.description||"";$("event-form").dataset.editId=ev.id;$("event-save").textContent="Save changes";$("event-status").textContent="Editing selected schedule item."; $("event-form").scrollIntoView({behavior:"smooth",block:"center"});});
      panel.querySelectorAll("[data-event-delete]").forEach(b=>b.onclick=async()=>{if(!confirm("Delete this schedule item?"))return;const {error}=await supabase.from("portal_events").delete().eq("id",b.dataset.eventDelete);if(error)alert(error.message);else await loadEvents();});
    }
    if(isOwner)$("event-form").onsubmit=async e=>{
      e.preventDefault();const btn=$("event-save"),msg=$("event-status");btn.disabled=true;msg.textContent="Saving…";
      try{const payload={team_id:team.id,event_type:eventType,title:$("event-title").value.trim(),event_date:$("event-date").value,event_time:$("event-time").value,conductor:eventType==="SESSION"?$("event-conductor").value.trim():null,description:$("event-description").value.trim()||null};
        const editId=$("event-form").dataset.editId;
        const result=editId?await supabase.from("portal_events").update(payload).eq("id",editId):await supabase.from("portal_events").insert({...payload,created_by:currentUser.id});
        if(result.error)throw result.error;$("event-form").reset();delete $("event-form").dataset.editId;$("event-save").textContent="Add "+(eventType==="TOURNAMENT"?"tournament":"session");msg.textContent="Saved.";await loadEvents();
      }catch(err){msg.textContent="Could not save: "+err.message;}finally{btn.disabled=false;}
    };
    await loadEvents();
  }

  document.addEventListener("click", async function(event) {
    const button = event.target.closest("[data-module]"); if (!button) return;
    const module = MODULES[Number(button.dataset.module)]; if (!module) return;
    const team = teams.find(t => t.id === button.dataset.teamId);
    if (!team) return alert("Team not found. Please reopen the team workspace.");
    try {
      if (module[1] === "ATTENDANCE") return await openAttendance(team);
      if (module[1] === "DRILLS" || module[1] === "LOBBY OS") return await openSubmission(team, module[1]);
      if (module[1] === "DOUBT BOX") return await openDoubtBox(team);
      if (module[1] === "TOURNAMENT SCHEDULES") return await openEvents(team, "TOURNAMENT");
      if (module[1] === "UPCOMING SESSIONS") return await openEvents(team, "SESSION");
      alert(module[1] + "\\nTeam: " + team.name + "\\n\\nThis module is not enabled yet.");
    } catch (e) { alert("Could not open module: " + e.message); }
  });

  function empty(message) {
    return `<div class="empty-state">${escapeHtml(message)}</div>`;
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

      <div class="section-head"><h2>TEAM STATS</h2></div>

      <div class="two-col">
        <div class="content-card">
          <h3>Performance overview</h3>
          <div class="chart-placeholder">
            Team performance charts will appear here once the owner adds daily performance records.
          </div>
        </div>

        <div class="content-card">
          <h3>Attendance</h3>
          <div class="chart-placeholder">
            Your attendance graph will appear here when attendance records are added.
          </div>
        </div>
      </div>`;
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

      <div class="section-head">
        <h2>ORGANIZATION ANALYTICS</h2>
        <p>Owner-maintained reporting</p>
      </div>

      <div class="two-col">
        <div class="content-card">
          <h3>Daily performance</h3>
          <div class="chart-placeholder">
            Performance graph will populate after the owner records daily team metrics.
          </div>
        </div>

        <div class="content-card">
          <h3>Attendance analysis</h3>
          <div class="chart-placeholder">
            Attendance graph will populate after the owner records attendance.
          </div>
        </div>
      </div>

      <div class="two-col" style="margin-top:14px">
        <div class="content-card">
          <h3>Weekly team activity</h3>
          ${empty("Weekly activity will appear after activity records are entered.")}
        </div>

        <div class="content-card">
          <h3>Pending reviews</h3>
          ${empty("No review data has been added yet.")}
        </div>
      </div>

      <div class="section-head"><h2>TOP ACTIVE PLAYERS</h2></div>
      <div class="content-card">
        ${empty("Activity rankings will appear when the owner records player activity.")}
      </div>`;

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

      <p class="tiny muted">
        This starter version supports secure account approval. Attendance, drill records,
        performance charts and review workflows are the next build stage.
      </p>`;

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

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
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

    supabase = window.supabase.createClient(
      window.OGC_CONFIG.SUPABASE_URL,
      window.OGC_CONFIG.SUPABASE_ANON_KEY
    );

    try {
      await loadTeams();
      await showWelcomeOrDashboard();
    } catch (e) {
      showView("welcome-view");
      console.error("OGC startup error:", e);
      alert("Website startup error: " + e.message);
    }

    supabase.auth.onAuthStateChange((_event, session) => {
      if (session && !currentUser) {
        currentUser = session.user;
        setTimeout(() => loadProfile().catch(console.error), 0);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
