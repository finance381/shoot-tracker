import { supabase } from './supabase.js';

const VAPID_PUBLIC_KEY = 'BPKiw8ndsho2x0VV-j920x49cPM4Z9CkQ7GR77k3_BYd-0Xhc0CWTyvYxSmMi964QAVlF0c64khXpEvCC5BV79k';

let requester = null;
let activeTab = 'requests';

export function getRequester() {
  if (requester) return requester;
  const saved = localStorage.getItem('requester');
  if (saved) {
    try { requester = JSON.parse(saved); } catch { requester = null; }
  }
  return requester;
}

export function setRequester(r) {
  requester = r;
  if (r) localStorage.setItem('requester', JSON.stringify(r));
  else localStorage.removeItem('requester');
}

export async function loginRequester(username, password) {
  const { data, error } = await supabase.rpc('login_requester', {
    p_username: username,
    p_password: password
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  setRequester(data);
  return data;
}

export function logoutRequester() {
  setRequester(null);
}

export async function renderRequesterApp(container) {
  const r = getRequester();
  if (!r) return;

  container.innerHTML = `
    <header class="req-app-header">
      <div>
        <h1 class="req-app-title">📸 ${r.display_name}</h1>
        <p class="req-app-sub">Shoot Requests</p>
      </div>
      <button id="req-logout" class="btn-icon" title="Log out">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      </button>
    </header>

    <div class="req-app-tabs">
      <button class="req-app-tab ${activeTab === 'requests' ? 'active' : ''}" data-tab="requests">My Requests</button>
      <button class="req-app-tab ${activeTab === 'new' ? 'active' : ''}" data-tab="new">+ New Request</button>
    </div>

    <div class="req-app-content" id="req-app-content"></div>
    <div id="req-toast" class="toast hidden"></div>
  `;

  container.querySelector('#req-logout').addEventListener('click', () => {
    logoutRequester();
    location.reload();
  });

  container.querySelectorAll('.req-app-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      renderRequesterApp(container);
    });
  });

  const content = container.querySelector('#req-app-content');
  if (activeTab === 'requests') {
    await renderMyRequests(content, r);
  } else {
    await renderNewRequest(content, r);
  }

  subscribePush(r);
}

async function renderMyRequests(el, r) {
  el.innerHTML = '<div style="text-align:center;padding:20px;color:#9C8E80">Loading…</div>';

  const { data: requests, error } = await supabase
    .from('shoot_requests')
    .select('*')
    .eq('requester_id', r.id)
    .order('created_at', { ascending: false });

  if (error) {
    el.innerHTML = `<div class="req-empty"><div class="req-empty-icon">⚠️</div>${error.message}</div>`;
    return;
  }

  if (!requests?.length) {
    el.innerHTML = `
      <div class="req-empty">
        <div class="req-empty-icon">📭</div>
        <div>No requests yet</div>
        <div style="font-size:13px;margin-top:4px">Tap "New Request" to submit one</div>
      </div>
    `;
    return;
  }

  el.innerHTML = requests.map(req => {
    const dateObj = new Date(req.date + 'T00:00:00');
    const dateStr = dateObj.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    const timeStr = req.time ? fmtTime(req.time) : '';
    const badgeClass = `req-badge-${req.status}`;

    return `
      <div class="req-list-card req-list-${req.status}">
        <div class="req-list-top">
          <div>
            <div class="req-list-func">${req.function_name || 'No function'}</div>
            <div class="req-list-date">${dateStr}${timeStr ? ' at ' + timeStr : ''}</div>
          </div>
          <span class="req-list-badge ${badgeClass}">${req.status}</span>
        </div>
        ${req.location ? `<div class="req-list-loc">📍 ${req.location}</div>` : ''}
        ${req.notes ? `<div class="req-list-notes">${req.notes}</div>` : ''}
        ${req.status === 'rejected' && req.reject_reason ? `<div class="req-list-reject">Reason: ${req.reject_reason}</div>` : ''}
        ${req.status === 'accepted' ? `<div class="req-list-accepted">✓ Approved — shoot scheduled</div>` : ''}
      </div>
    `;
  }).join('');
}

async function renderNewRequest(el, r) {
  const { data: masters } = await supabase.from('masters').select('*').order('sort_order');
  const locations = (masters || []).filter(m => m.type === 'location');

  el.innerHTML = `
    <div class="req-form">
      <div class="req-form-header">
        <div class="req-form-icon">📸</div>
        <div class="req-form-title">Request a Shoot</div>
        <div class="req-form-sub">Fill in the details and our team will review</div>
      </div>
      <div id="rq-error" class="req-form-error" style="display:none"></div>
      <div class="form-row-2">
        <div class="req-form-group">
          <label>Preferred Date *</label>
          <input type="date" id="rq-date">
        </div>
        <div class="req-form-group">
          <label>Preferred Time</label>
          <input type="time" id="rq-time">
        </div>
      </div>
      <div class="req-form-group">
        <label>Function / Purpose *</label>
        <input type="text" id="rq-function" placeholder="e.g. Product launch, Wedding, Event">
      </div>
      <div class="req-form-group">
        <label>Location</label>
        <select id="rq-location">
          <option value="">Select location…</option>
          ${locations.map(l => `<option value="${l.label}">${l.label}</option>`).join('')}
          <option value="outdoor">🌳 Outdoor (specify in notes)</option>
        </select>
      </div>
      <div class="req-form-group">
        <label>Notes / Special Requirements</label>
        <textarea id="rq-notes" rows="3" placeholder="Shot list, wardrobe, props, specific requests…"></textarea>
      </div>
      <button id="rq-submit" class="req-form-submit">Submit Request</button>
    </div>
  `;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  el.querySelector('#rq-date').value = tomorrow.toISOString().slice(0, 10);

  el.querySelector('#rq-submit').addEventListener('click', async () => {
    const date = el.querySelector('#rq-date').value;
    const time = el.querySelector('#rq-time').value || null;
    const func = el.querySelector('#rq-function').value.trim();
    const location = el.querySelector('#rq-location').value;
    const notes = el.querySelector('#rq-notes').value.trim();
    const errEl = el.querySelector('#rq-error');
    const btn = el.querySelector('#rq-submit');

    errEl.style.display = 'none';
    if (!date) { errEl.textContent = 'Please select a date'; errEl.style.display = 'block'; return; }
    if (!func) { errEl.textContent = 'Please describe the function / purpose'; errEl.style.display = 'block'; return; }

    btn.disabled = true;
    btn.textContent = 'Submitting…';

    try {
      const { error } = await supabase.from('shoot_requests').insert({
        requested_by: r.display_name,
        requester_id: r.id,
        date,
        time,
        function_name: func,
        location,
        notes
      });

      if (error) throw error;

      el.innerHTML = `
        <div class="req-success">
          <div class="req-success-icon">✅</div>
          <div class="req-success-title">Request Submitted!</div>
          <div class="req-success-text">Our photography team will review your request and get back to you. Check the "My Requests" tab for updates.</div>
          <button class="req-form-submit" id="rq-another" style="margin-top:20px">Submit Another Request</button>
          <button class="req-form-back" id="rq-to-requests">View My Requests</button>
        </div>
      `;

      el.querySelector('#rq-another').addEventListener('click', () => renderNewRequest(el, r));
      el.querySelector('#rq-to-requests').addEventListener('click', () => {
        activeTab = 'requests';
        const container = el.closest('#requester-app');
        if (container) renderRequesterApp(container);
      });
    } catch (err) {
      errEl.textContent = err.message || 'Something went wrong. Please try again.';
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Submit Request';
    }
  });
}

async function subscribePush(r) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const key = Uint8Array.from(atob(VAPID_PUBLIC_KEY.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    }

    const json = sub.toJSON();
    await supabase.from('requester_push_subs').upsert({
      requester_name: r.display_name,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth
    }, { onConflict: 'endpoint' });
  } catch (err) {
    console.warn('Requester push failed:', err);
  }
}

function showToast(msg) {
  const el = document.getElementById('req-toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2500);
}

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hr = parseInt(h);
  return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
}
