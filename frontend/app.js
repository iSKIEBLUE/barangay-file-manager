/**
 * Barangay File Manager — app.js (v3 FINAL)
 *
 * ROOT CAUSE FIX: On every page load, we call GET /auth/me with the stored
 * token. If the backend rejects it (401), we wipe localStorage and show login.
 * This guarantees we never fire authenticated requests with a bad token.
 */

const API_BASE = "https://barangay-file-manager.onrender.com";

// ─── Document catalogue ───────────────────────────────────────────────────
const DOCUMENT_CATALOGUE = {
  "Barangay Clearance": [
    "1 valid government-issued ID (photocopy)",
    "Cedula / Community Tax Certificate",
    "Recent utility bill or proof of residency",
  ],
  "Certificate of Indigency": [
    "1 valid government-issued ID",
    "Proof of income (or Affidavit of No Income)",
    "Barangay Clearance (if applicable)",
  ],
  "Certificate of Residency": [
    "1 valid government-issued ID",
    "Proof of address (utility bill / lease contract)",
  ],
  "Certificate of Good Moral Character": [
    "1 valid government-issued ID",
    "Cedula / Community Tax Certificate",
    "2 pcs. 2x2 ID picture",
  ],
  "Barangay Business Clearance": [
    "DTI / SEC / CDA Registration",
    "Valid ID of business owner",
    "Lease contract or proof of business location",
    "Mayor's Permit application form",
  ],
  "First-Time Jobseeker Certification": [
    "Oath of Undertaking (required by law - RA 11261)",
    "PSA Birth Certificate",
    "1 valid government-issued ID (or school ID)",
    "Barangay Certificate of Residency",
  ],
  "Certificate to File Action": [
    "Complaint Affidavit (signed and notarized)",
    "2 pcs. 2x2 ID picture",
    "1 valid government-issued ID",
    "Cedula / Community Tax Certificate",
  ],
};

// ─── Storage helpers ──────────────────────────────────────────────────────
function saveAuth(token, user) {
  localStorage.setItem("bfm_token", token);
  localStorage.setItem("bfm_user", JSON.stringify({
    id: user.id, full_name: user.full_name, email: user.email,
    role: user.role, phone: user.phone || "", address: user.address || "",
  }));
}

function getToken() { return localStorage.getItem("bfm_token") || null; }

function clearAuth() {
  localStorage.removeItem("bfm_token");
  localStorage.removeItem("bfm_user");
}

function logout() { clearAuth(); window.location.href = "index.html"; }

// ─── Core API fetch ───────────────────────────────────────────────────────
// Builds headers manually — no spread so Authorization can never be lost.
async function apiFetch(path, method, body) {
  method = method || "GET";
  var token = getToken();
  var headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = "Bearer " + token;

  var opts = { method: method, headers: headers };
  if (body !== undefined) opts.body = JSON.stringify(body);

  var response = await fetch(API_BASE + path, opts);

  if (!response.ok) {
    var msg = "HTTP " + response.status;
    try { var e = await response.json(); msg = e.detail || msg; } catch(_) {}
    throw new Error(msg);
  }
  if (response.status === 204) return null;
  return response.json();
}

// ─── Toast ────────────────────────────────────────────────────────────────
function showToast(msg, type) {
  var c = { success: "#16a34a", error: "#dc2626", info: "#2563eb" };
  var d = document.createElement("div");
  d.style.cssText = "position:fixed;bottom:24px;right:24px;z-index:9999;padding:12px 20px;" +
      "border-radius:8px;color:#fff;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,.2);" +
      "background:" + (c[type] || c.info);
  d.textContent = msg;
  document.body.appendChild(d);
  setTimeout(function() { d.remove(); }, 3500);
}

// ─── Format helpers ───────────────────────────────────────────────────────
function fmtDT(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-PH", { year:"numeric", month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" });
}
function fmtD(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-PH", { year:"numeric", month:"short", day:"numeric" });
}
function badge(status) {
  var m = {
    "Submitted":                   "background:#fef9c3;color:#854d0e",
    "Under Review":                "background:#dbeafe;color:#1e40af",
    "Approved (Ready for Pickup)": "background:#dcfce7;color:#166534",
    "Claimed":                     "background:#e5e7eb;color:#374151",
  };
  return '<span style="' + (m[status]||"background:#f3f4f6;color:#374151") +
      ';padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600">' + status + '</span>';
}

// =========================================================================
// RESIDENT PAGE
// =========================================================================

async function initResidentPage() {
  var token = getToken();

  if (!token) {
    showAuthSection();
    return;
  }

  // Always verify the token with the backend first
  try {
    var raw = await fetch(API_BASE + "/auth/me", {
      headers: { "Authorization": "Bearer " + token }
    });

    if (!raw.ok) {
      clearAuth();
      showAuthSection();
      return;
    }

    var user = await raw.json();
    saveAuth(token, user); // refresh stored user data

    if (user.role === "admin") {
      window.location.href = "admin.html";
      return;
    }

    showResidentDashboard(user);

  } catch (networkErr) {
    showToast("Cannot reach server. Is the backend running?", "error");
    showAuthSection();
  }
}

function showAuthSection() {
  document.getElementById("auth-section").classList.remove("hidden");
  document.getElementById("dashboard-section").classList.add("hidden");
  document.getElementById("header-user").classList.add("hidden");
  var bell = document.getElementById("notif-bell-wrap");
  if (bell) bell.style.display = "none";

  // Clone forms to remove any previously attached listeners
  var lf = document.getElementById("login-form");
  var lfClone = lf.cloneNode(true);
  lf.parentNode.replaceChild(lfClone, lf);

  var rf = document.getElementById("register-form");
  var rfClone = rf.cloneNode(true);
  rf.parentNode.replaceChild(rfClone, rf);

  setupLoginForm();
  setupRegisterForm();

  var tabLogin = document.getElementById("tab-login");
  var tabRegister = document.getElementById("tab-register");
  var tlClone = tabLogin.cloneNode(true);
  var trClone = tabRegister.cloneNode(true);
  tabLogin.parentNode.replaceChild(tlClone, tabLogin);
  tabRegister.parentNode.replaceChild(trClone, tabRegister);

  document.getElementById("tab-login").addEventListener("click", function() { switchTab("login"); });
  document.getElementById("tab-register").addEventListener("click", function() { switchTab("register"); });
}

function showResidentDashboard(user) {
  document.getElementById("auth-section").classList.add("hidden");
  document.getElementById("dashboard-section").classList.remove("hidden");
  document.getElementById("header-user").classList.remove("hidden");
  var bell = document.getElementById("notif-bell-wrap");
  if (bell) bell.style.display = "flex";
  document.getElementById("resident-name").textContent  = user.full_name;
  document.getElementById("resident-email").textContent = user.email;

  var logoutBtn = document.getElementById("logout-btn");
  logoutBtn.replaceWith(logoutBtn.cloneNode(true)); // remove stale listeners
  document.getElementById("logout-btn").addEventListener("click", logout);

  populateDocTypes();
  document.getElementById("doc-type-select").addEventListener("change", showRequirements);

  var form = document.getElementById("request-form");
  form.replaceWith(form.cloneNode(true));
  document.getElementById("request-form").addEventListener("submit", onSubmitRequest);

  loadResidentRequests();
  // Initialize notification state and start polling
  checkResidentNotifications();
  setInterval(checkResidentNotifications, 30000);
}

// ─── Login ────────────────────────────────────────────────────────────────
function setupLoginForm() {
  document.getElementById("login-form").addEventListener("submit", async function(e) {
    e.preventDefault();
    var email    = document.getElementById("login-email").value.trim();
    var password = document.getElementById("login-password").value;
    var btn      = document.getElementById("login-btn");
    btn.disabled = true; btn.textContent = "Logging in...";

    try {
      var res = await fetch(API_BASE + "/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "username=" + encodeURIComponent(email) + "&password=" + encodeURIComponent(password),
      });

      if (!res.ok) {
        var err = await res.json();
        throw new Error(err.detail || "Login failed.");
      }

      var data = await res.json();
      saveAuth(data.access_token, data.user);

      // Navigate — the initResidentPage() on the new load will verify the token
      if (data.user.role === "admin") {
        window.location.href = "admin.html";
      } else {
        window.location.href = "index.html";
      }

    } catch (err) {
      showToast(err.message, "error");
      btn.disabled = false; btn.textContent = "Log In";
    }
  });
}

// ─── Register ─────────────────────────────────────────────────────────────
function setupRegisterForm() {
  document.getElementById("register-form").addEventListener("submit", async function(e) {
    e.preventDefault();
    var btn = document.getElementById("register-btn");
    btn.disabled = true; btn.textContent = "Registering...";
    try {
      await apiFetch("/auth/register", "POST", {
        full_name: document.getElementById("reg-name").value.trim(),
        email:     document.getElementById("reg-email").value.trim(),
        password:  document.getElementById("reg-password").value,
        phone:     document.getElementById("reg-phone").value.trim(),
        address:   document.getElementById("reg-address").value.trim(),
      });
      showToast("Account created! Please log in.", "success");
      switchTab("login");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      btn.disabled = false; btn.textContent = "Create Account";
    }
  });
}

function switchTab(tab) {
  var isLogin = tab === "login";
  document.getElementById("login-form").classList.toggle("hidden", !isLogin);
  document.getElementById("register-form").classList.toggle("hidden", isLogin);
  document.getElementById("tab-login").classList.toggle("border-blue-600", isLogin);
  document.getElementById("tab-login").classList.toggle("text-blue-600", isLogin);
  document.getElementById("tab-register").classList.toggle("border-blue-600", !isLogin);
  document.getElementById("tab-register").classList.toggle("text-blue-600", !isLogin);
}

// ─── Document type dropdown ───────────────────────────────────────────────
function populateDocTypes() {
  var sel = document.getElementById("doc-type-select");
  // Clear any duplicates from previous init
  while (sel.options.length > 1) sel.remove(1);
  Object.keys(DOCUMENT_CATALOGUE).forEach(function(t) {
    var o = document.createElement("option");
    o.value = t; o.textContent = t;
    sel.appendChild(o);
  });
}

function showRequirements() {
  var t    = document.getElementById("doc-type-select").value;
  var box  = document.getElementById("requirements-box");
  var list = document.getElementById("requirements-list");
  if (!t) { box.classList.add("hidden"); return; }
  list.innerHTML = (DOCUMENT_CATALOGUE[t] || []).map(function(r) {
    return '<li class="flex gap-2"><span class="text-blue-500">✓</span><span>' + r + '</span></li>';
  }).join("");
  box.classList.remove("hidden");
}

// ─── Submit request ───────────────────────────────────────────────────────
async function onSubmitRequest(e) {
  e.preventDefault();
  var docType = document.getElementById("doc-type-select").value;
  var purpose = document.getElementById("purpose-input").value.trim();
  var btn     = document.getElementById("submit-request-btn");
  if (!docType) { showToast("Please select a document type.", "error"); return; }
  btn.disabled = true; btn.textContent = "Submitting...";
  try {
    await apiFetch("/requests", "POST", { document_type: docType, purpose: purpose });
    showToast("Request submitted!", "success");
    document.getElementById("doc-type-select").value = "";
    document.getElementById("purpose-input").value   = "";
    document.getElementById("requirements-box").classList.add("hidden");
    loadResidentRequests();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    btn.disabled = false; btn.textContent = "Submit Request";
  }
}

// ─── Load requests list ───────────────────────────────────────────────────
async function loadResidentRequests() {
  var c = document.getElementById("requests-container");
  c.innerHTML = '<p style="color:#9ca3af;font-size:14px">Loading...</p>';
  try {
    var list = await apiFetch("/requests", "GET");
    if (!list.length) {
      c.innerHTML = '<p style="color:#6b7280;font-size:14px;text-align:center;padding:32px 0">No requests yet.</p>';
      return;
    }
    c.innerHTML = list.map(reqCard).join("");
    list.forEach(function(r) {
      var t = document.getElementById("tgl-" + r.id);
      var s = document.getElementById("snd-" + r.id);
      if (t) t.onclick = function() { toggleMsgs(r.id); };
      if (s) s.onclick = function() { sendMsg(r.id); };
    });
  } catch (err) {
    c.innerHTML = '<p style="color:#ef4444;font-size:14px">' + err.message + '</p>';
  }
}

function reqCard(r) {
  var pickup = r.pickup_date
      ? '<p style="color:#15803d;font-size:13px;margin-top:4px">Pickup: ' + r.pickup_date + (r.pickup_time ? " at " + r.pickup_time : "") + '</p>'
      : "";
  return '<div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;background:#fff;margin-bottom:8px">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">' +
      '<div style="flex:1;min-width:0">' +
      '<p style="font-weight:600;color:#1f2937;word-break:break-word">' + r.document_type + '</p>' +
      '<p style="font-size:12px;color:#9ca3af">Submitted: ' + fmtDT(r.created_at) + '</p>' +
      (r.purpose ? '<p style="font-size:12px;color:#6b7280;word-break:break-word">Purpose: ' + r.purpose + '</p>' : '') +
      '</div>' +
      '<div style="flex-shrink:0">' + badge(r.status) + '</div>' +
      '</div>' +
      pickup +
      '<button id="tgl-' + r.id + '" style="font-size:12px;color:#2563eb;cursor:pointer;margin-top:8px;background:none;border:none;padding:0">Messages</button>' +
      '<div id="pan-' + r.id + '" style="display:none;margin-top:8px">' +
      '<div id="mls-' + r.id + '" style="max-height:160px;overflow-y:auto;border:1px solid #e5e7eb;border-radius:8px;padding:8px;background:#f9fafb;font-size:12px;margin-bottom:8px">' +
      '<p style="color:#9ca3af;font-style:italic">Loading...</p>' +
      '</div>' +
      '<div style="display:flex;gap:8px">' +
      '<input id="inp-' + r.id + '" type="text" placeholder="Type a message..." ' +
      'style="flex:1;min-width:0;border:1px solid #d1d5db;border-radius:8px;padding:6px 12px;font-size:14px"/>' +
      '<button id="snd-' + r.id + '" style="flex-shrink:0;background:#2563eb;color:#fff;border:none;border-radius:8px;padding:6px 14px;font-size:14px;cursor:pointer">Send</button>' +
      '</div>' +
      '</div>' +
      '</div>';
}

async function toggleMsgs(id) {
  var pan = document.getElementById("pan-" + id);
  var shown = pan.style.display !== "none";
  pan.style.display = shown ? "none" : "block";
  if (!shown) await loadMsgs(id);
}

async function loadMsgs(id) {
  var el = document.getElementById("mls-" + id);
  try {
    var msgs = await apiFetch("/requests/" + id + "/messages", "GET");
    if (!msgs.length) { el.innerHTML = '<p style="color:#9ca3af;font-style:italic">No messages yet.</p>'; return; }
    el.innerHTML = msgs.map(function(m) {
      return '<div style="color:' + (m.sender_role==="admin" ? "#1d4ed8" : "#374151") + ';margin-bottom:4px">' +
          '<strong>' + m.full_name + ':</strong> ' + m.body + '</div>';
    }).join("");
    el.scrollTop = el.scrollHeight;
  } catch(_) { el.innerHTML = '<p style="color:#ef4444">Could not load messages.</p>'; }
}

async function sendMsg(id) {
  var inp = document.getElementById("inp-" + id);
  var txt = inp.value.trim();
  if (!txt) return;
  try {
    await apiFetch("/requests/" + id + "/messages", "POST", { body: txt });
    inp.value = "";
    await loadMsgs(id);
  } catch(err) { showToast(err.message, "error"); }
}

// =========================================================================
// ADMIN PAGE
// =========================================================================

async function initAdminPage() {
  var token = getToken();

  if (!token) { window.location.href = "index.html"; return; }

  // Verify token with backend
  try {
    var raw = await fetch(API_BASE + "/auth/me", {
      headers: { "Authorization": "Bearer " + token }
    });

    if (!raw.ok) { clearAuth(); window.location.href = "index.html"; return; }

    var user = await raw.json();
    if (user.role !== "admin") { window.location.href = "index.html"; return; }

    saveAuth(token, user);
    document.getElementById("admin-name").textContent = user.full_name;

  } catch (_) {
    showToast("Cannot reach server.", "error");
    return;
  }

  document.getElementById("admin-logout-btn").addEventListener("click", logout);
  document.getElementById("nav-dashboard").addEventListener("click", function() { showTab("dashboard"); });
  document.getElementById("nav-requests").addEventListener("click",   function() { showTab("requests"); });
  var navMsgs = document.getElementById("nav-messages");
  if (navMsgs) navMsgs.addEventListener("click", function() { showTab("messages"); if(typeof loadAllMessages==="function") loadAllMessages(); });

  showTab("dashboard");
  loadAnalytics();
  loadAdminRequests();
}

function showTab(tab) {
  ["dashboard","requests","messages"].forEach(function(t) {
    var el = document.getElementById("tab-" + t);
    var btn = document.getElementById("nav-" + t);
    if (el) el.classList.toggle("hidden", t !== tab);
    if (btn) {
      btn.classList.toggle("nav-active", t === tab);
      btn.classList.toggle("bg-blue-700", t === tab);
    }
  });
}

async function loadAnalytics() {
  try {
    var d = await apiFetch("/admin/analytics", "GET");
    document.getElementById("stat-total").textContent    = d.total_requests;
    document.getElementById("stat-pending").textContent  = d.pending;
    document.getElementById("stat-approved").textContent = d.approved;
    document.getElementById("stat-today").textContent    = d.scheduled_today;
  } catch(err) { showToast("Analytics: " + err.message, "error"); }
}

async function loadAdminRequests() {
  var tb = document.getElementById("requests-tbody");
  tb.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:#9ca3af">Loading...</td></tr>';
  try {
    var list = await apiFetch("/requests", "GET");
    if (!list.length) {
      tb.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:#9ca3af">No requests found.</td></tr>';
      return;
    }
    tb.innerHTML = list.map(adminRow).join("");
    list.forEach(function(r) {
      var b = document.getElementById("mgr-" + r.id);
      if (b) b.onclick = (function(req){ return function(){ openModal(req); }; })(r);
    });
  } catch(err) {
    tb.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#ef4444">' + err.message + '</td></tr>';
  }
}

function adminRow(r) {
  return '<tr data-status="' + r.status + '" style="border-bottom:1px solid #f3f4f6">' +
      '<td style="padding:12px 16px;font-size:14px;font-weight:500">'  + r.full_name     + '</td>' +
      '<td style="padding:12px 16px;font-size:14px;color:#4b5563">'    + r.document_type + '</td>' +
      '<td style="padding:12px 16px">'                                  + badge(r.status) + '</td>' +
      '<td style="padding:12px 16px;font-size:14px;color:#6b7280">'    + fmtD(r.created_at) + '</td>' +
      '<td style="padding:12px 16px;font-size:14px;color:#6b7280">'    + (r.pickup_date ? r.pickup_date + " " + (r.pickup_time||"") : "—") + '</td>' +
      '<td style="padding:12px 16px"><button id="mgr-' + r.id + '" ' +
      'style="background:#2563eb;color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:12px;cursor:pointer">Manage</button></td>' +
      '</tr>';
}

function openModal(req) {
  document.getElementById("modal-title").textContent     = req.document_type;
  document.getElementById("modal-resident").textContent  = req.full_name;
  document.getElementById("modal-phone").textContent     = req.phone || "N/A";
  document.getElementById("modal-purpose").textContent   = req.purpose || "N/A";
  document.getElementById("modal-submitted").textContent = fmtDT(req.created_at);
  document.getElementById("modal-status-select").value   = req.status;
  document.getElementById("modal-pickup-date").value     = req.pickup_date || "";
  document.getElementById("modal-pickup-time").value     = req.pickup_time || "";
  document.getElementById("modal-notes").value           = req.admin_notes || "";
  document.getElementById("modal-req-id").value          = req.id;
  document.getElementById("sms-log").classList.add("hidden");
  document.getElementById("sms-log").innerHTML = "";
  loadModalMsgs(req.id);
  document.getElementById("manage-modal").classList.remove("hidden");
  document.getElementById("modal-save-btn").onclick     = function() { saveUpdate(req.id); };
  document.getElementById("modal-msg-send-btn").onclick = function() { sendAdminMsg(req.id); };
  document.getElementById("modal-close-btn").onclick    = closeModal;
  document.getElementById("modal-overlay").onclick      = closeModal;
}

function closeModal() { document.getElementById("manage-modal").classList.add("hidden"); }

async function saveUpdate(id) {
  var status      = document.getElementById("modal-status-select").value;
  var pickup_date = document.getElementById("modal-pickup-date").value;
  var pickup_time = document.getElementById("modal-pickup-time").value;
  var admin_notes = document.getElementById("modal-notes").value;

  if (status === "Approved (Ready for Pickup)" && !pickup_date) {
    showToast("Please set a pickup date before approving.", "error");
    return;
  }

  // Only send pickup fields when approving
  var payload = { status: status, admin_notes: admin_notes };
  if (status === "Approved (Ready for Pickup)") {
    payload.pickup_date = pickup_date;
    payload.pickup_time = pickup_time;
  }

  try {
    await apiFetch("/requests/" + id, "PATCH", payload);
    showToast("Request updated!", "success");
    if (status === "Approved (Ready for Pickup)") mockSMS(pickup_date, pickup_time);
    closeModal();
    loadAdminRequests();
    loadAnalytics();
  } catch(err) { showToast(err.message, "error"); }
}

function mockSMS(date, time) {
  var el   = document.getElementById("sms-log");
  var phone = document.getElementById("modal-phone").textContent;
  var name  = document.getElementById("modal-resident").textContent;
  el.classList.remove("hidden");
  el.innerHTML = '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px;font-size:13px">' +
      '<p style="font-weight:600;color:#15803d">Mock SMS Sent</p>' +
      '<p style="color:#166534">To: ' + phone + ' (' + name + ')</p>' +
      '<p style="color:#374151;font-style:italic">"Ang iyong dokumento ay approved. Pickup: ' + date + (time ? " " + time : "") + '. Magdala ng valid ID. — Barangay Hall"</p>' +
      '</div>';
}

async function loadModalMsgs(id) {
  var el = document.getElementById("modal-msg-list");
  el.innerHTML = '<p style="color:#9ca3af;font-size:12px;font-style:italic">Loading...</p>';
  try {
    var msgs = await apiFetch("/requests/" + id + "/messages", "GET");
    if (!msgs.length) { el.innerHTML = '<p style="color:#9ca3af;font-size:12px;font-style:italic">No messages yet.</p>'; return; }
    el.innerHTML = msgs.map(function(m) {
      return '<div style="font-size:12px;color:' + (m.sender_role==="admin"?"#1d4ed8":"#374151") + ';margin-bottom:4px">' +
          '<strong>' + m.full_name + ' (' + m.sender_role + '):</strong> ' + m.body + '</div>';
    }).join("");
    el.scrollTop = el.scrollHeight;
  } catch(_) { el.innerHTML = '<p style="color:#ef4444;font-size:12px">Could not load messages.</p>'; }
}

async function sendAdminMsg(id) {
  var inp = document.getElementById("modal-msg-input");
  var txt = inp.value.trim();
  if (!txt) return;
  try {
    await apiFetch("/requests/" + id + "/messages", "POST", { body: txt });
    inp.value = "";
    await loadModalMsgs(id);
    showToast("Message sent.", "success");
  } catch(err) { showToast(err.message, "error"); }
}
// =========================================================================
// ADMIN — FILTERED VIEWS
// =========================================================================

function filterRequests(status) {
  showTab("requests");
  var filterEl = document.getElementById("requests-filter");
  if (filterEl) filterEl.value = status;
  applyRequestsFilter();
}

function applyRequestsFilter() {
  var filterEl = document.getElementById("requests-filter");
  var status = filterEl ? filterEl.value : "";
  var rows = document.querySelectorAll("#requests-tbody tr[data-status]");
  rows.forEach(function(row) {
    row.style.display = (!status || row.dataset.status === status) ? "" : "none";
  });
  var label = document.getElementById("filter-label");
  if (label) label.textContent = status ? ("Showing: " + status) : "All Requests";
}

// =========================================================================
// RESIDENT — NOTIFICATIONS
// =========================================================================

var _lastNotifState = JSON.parse(localStorage.getItem("bfm_notif_state") || "{}");

async function checkResidentNotifications() {
  try {
    var list = await apiFetch("/requests", "GET");
    var bell = document.getElementById("notif-bell");
    var notifList = document.getElementById("notif-list");
    if (!bell) return;

    var newNotifs = [];
    var isFirstRun = Object.keys(_lastNotifState).length === 0;

    list.forEach(function(r) {
      var key = "req_" + r.id;
      if (!_lastNotifState[key]) _lastNotifState[key] = {};
      var prev = _lastNotifState[key];
      if (!isFirstRun && prev.status && prev.status !== r.status) {
        newNotifs.push({ reqId: r.id, text: r.document_type + ': Status changed to "' + r.status + '"', type: "status" });
      }
      _lastNotifState[key].status = r.status;
    });

    await Promise.all(list.map(async function(r) {
      try {
        var msgs = await apiFetch("/requests/" + r.id + "/messages", "GET");
        var lastAdmin = msgs.filter(function(m) { return m.sender_role === "admin"; }).pop();
        var key = "req_" + r.id;
        if (!_lastNotifState[key]) _lastNotifState[key] = {};
        if (lastAdmin) {
          var prevId = _lastNotifState[key].lastAdminMsgId;
          if (!isFirstRun && prevId && prevId !== lastAdmin.id) {
            newNotifs.push({ reqId: r.id, text: r.document_type + ': "' + lastAdmin.body.substring(0,50) + '"', type: "message" });
          }
          _lastNotifState[key].lastAdminMsgId = lastAdmin.id;
        }
      } catch(_) {}
    }));

    localStorage.setItem("bfm_notif_state", JSON.stringify(_lastNotifState));

    var stored = JSON.parse(localStorage.getItem("bfm_notifs") || "[]");
    if (newNotifs.length) { stored = stored.concat(newNotifs); localStorage.setItem("bfm_notifs", JSON.stringify(stored)); }

    var count = stored.length;
    var badge = document.getElementById("notif-count");
    if (badge) { badge.textContent = count; badge.style.display = count > 0 ? "flex" : "none"; }

    if (notifList) {
      notifList.innerHTML = !stored.length
          ? '<p style="padding:16px;font-size:13px;color:#9ca3af;text-align:center">No new notifications</p>'
          : stored.map(function(n, i) {
        return '<div onclick="goToReqMsg(' + n.reqId + ',' + i + ')" style="padding:12px 16px;border-bottom:1px solid #f3f4f6;cursor:pointer;font-size:13px">' +
            '<p style="font-weight:600;color:#0f1f3d">' + (n.type === "message" ? "New Reply" : "Status Update") + '</p>' +
            '<p style="color:#64748b;margin-top:2px">' + n.text + '</p></div>';
      }).join("") + '<div style="padding:10px;text-align:center"><button onclick="clearNotifs()" style="font-size:12px;color:#ef4444;background:none;border:none;cursor:pointer;font-family:Outfit,sans-serif">Clear all</button></div>';
    }
  } catch(_) {}
}


function goToReqMsg(reqId, notifIdx) {
  // Scroll to and open the message panel for this request
  var pan = document.getElementById("pan-" + reqId);
  var tgl = document.getElementById("tgl-" + reqId);
  if (pan && tgl) {
    pan.style.display = "block";
    loadMsgs(reqId);
    document.getElementById("pan-" + reqId).scrollIntoView({ behavior: "smooth", block: "center" });
  }
  // Remove this notif
  var stored = JSON.parse(localStorage.getItem("bfm_notifs") || "[]");
  stored.splice(notifIdx, 1);
  localStorage.setItem("bfm_notifs", JSON.stringify(stored));
  toggleNotifPanel();
  checkResidentNotifications();
}

function clearNotifs() {
  localStorage.removeItem("bfm_notifs");
  checkResidentNotifications();
}

function toggleNotifPanel() {
  var panel = document.getElementById("notif-panel");
  if (panel) panel.style.display = panel.style.display === "none" ? "block" : "none";
}