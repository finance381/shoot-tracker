import { supabase } from './supabase.js';
import { initAuth, getUser, getMember, login, logout, isAdmin } from './auth.js';
import { render as renderDashboard } from './dashboard.js';
import { render as renderCalendar } from './calendar.js';
import { render as renderShoots, setFilters, resetFilters } from './shoots.js';
import { render as renderTeam } from './team.js';
import { render as renderReports } from './reports.js';
import { render as renderRequests } from './requests.js';
import { syncShoot } from './sheets-sync.js';

const VAPID_PUBLIC_KEY = 'BPKiw8ndsho2x0VV-j920x49cPM4Z9CkQ7GR77k3_BYd-0Xhc0CWTyvYxSmMi964QAVlF0c64khXpEvCC5BV79k';

const pages = {
  dashboard: renderDashboard,
  calendar:  renderCalendar,
  shoots:    renderShoots,
  team:      renderTeam,
  reports:   renderReports,
  requests:  renderRequests,
};
let currentPage = 'dashboard';
let renderGeneration = 0;
let appSetupDone = false;

// ===== INIT =====
async function init() {
  const user = await initAuth();

  if (user && getMember()) {
    showApp();
  } else if (user && !getMember()) {
    await logout();
    showAuth();
  } else {
    showAuth();
  }
}

// ===== AUTH UI =====
function showAuth() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');

  const submitBtn  = document.getElementById('auth-submit');
  const errorEl    = document.getElementById('auth-error');
  const setupLink  = document.getElementById('auth-setup-link');
  if (!submitBtn || !errorEl) return;

  // Prevent duplicate listeners
  const newBtn = submitBtn.cloneNode(true);
  submitBtn.parentNode.replaceChild(newBtn, submitBtn);

  if (setupLink) {
    const newLink = setupLink.cloneNode(true);
    setupLink.parentNode.replaceChild(newLink, setupLink);

    newLink.addEventListener('click', async () => {
      const phone = document.getElementById('auth-phone').value.trim();
      const pass  = document.getElementById('auth-pass').value;
      errorEl.classList.add('hidden');

      if (!phone || !pass) {
        errorEl.textContent = 'Enter your phone number and choose a password first';
        errorEl.classList.remove('hidden');
        return;
      }
      if (pass.length < 6) {
        errorEl.textContent = 'Password must be at least 6 characters';
        errorEl.classList.remove('hidden');
        return;
      }

      newBtn.disabled = true;
      newBtn.textContent = 'Setting up…';

      try {
        const { phoneToEmail } = await import('./auth.js');
        const fakeEmail = phoneToEmail(phone);
        const { data: member } = await supabase
          .from('team_members')
          .select('id')
          .eq('email', fakeEmail)
          .maybeSingle();

        if (!member) {
          errorEl.textContent = 'This phone number hasn\'t been added to the team yet. Ask your admin.';
          errorEl.classList.remove('hidden');
          newBtn.disabled = false;
          newBtn.textContent = 'Log in';
          return;
        }

        const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
          email: fakeEmail, password: pass,
          options: { data: { phone } }
        });
        if (signUpErr) throw signUpErr;

        await login(phone, pass);

        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser) {
          await supabase.rpc('link_auth_id', {
            p_email: fakeEmail,
            p_auth_id: authUser.id
          });
        }

        await initAuth();
        if (getMember()) {
          showApp();
        } else {
          errorEl.textContent = 'Account created but login failed. Try logging in.';
          errorEl.classList.remove('hidden');
          newBtn.disabled = false;
          newBtn.textContent = 'Log in';
        }
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.classList.remove('hidden');
        newBtn.disabled = false;
        newBtn.textContent = 'Log in';
      }
    });
  }

  newBtn.addEventListener('click', async () => {
    const phone = document.getElementById('auth-phone').value.trim();
    const pass  = document.getElementById('auth-pass').value;
    errorEl.classList.add('hidden');

    if (!phone || !pass) {
      errorEl.textContent = 'Phone number and password are required';
      errorEl.classList.remove('hidden');
      return;
    }

    newBtn.disabled = true;
    newBtn.textContent = 'Please wait…';

    try {
      await login(phone, pass);
      await initAuth();
      if (getMember()) {
        showApp();
      } else {
        await logout();
        errorEl.textContent = 'This phone number hasn\'t been added to the team yet. Ask your admin to add you first.';
        errorEl.classList.remove('hidden');
        newBtn.disabled = false;
        newBtn.textContent = 'Log in';
      }
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
      newBtn.disabled = false;
      newBtn.textContent = 'Log in';
    }
  });
}

// ===== MAIN APP =====
function showApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  const member = getMember();
  document.getElementById('user-greeting').textContent = `Hi, ${member?.name || 'there'}`;

  // Show/hide reports tab based on admin
  const reportsTab = document.querySelector('[data-page="reports"]');
  if (reportsTab) {
    reportsTab.style.display = isAdmin() ? '' : 'none';
  }

  if (!appSetupDone) {
    appSetupDone = true;
    setupNav();
    setupFab();
    setupLogout();
    setupChangePassword();
    setupShootModal();
    setupToast();
    registerSW();
    setupPullToRefresh();
    subscribePush();
    setupDashboardNav();
  }

  navigate('dashboard');
}

// ===== NAVIGATION =====
function navigate(page) {
  currentPage = page;
  renderGeneration++;
  const gen = renderGeneration;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  pages[page]().catch(err => {
    if (renderGeneration === gen) console.error('Page render error:', err);
  });
}

function setupNav() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      if (tab.dataset.page === 'shoots') resetFilters();
      navigate(tab.dataset.page);
    });
  });
}

// Dashboard card clicks → navigate to shoots with filters
function setupDashboardNav() {
  window.addEventListener('navigate-shoots', (e) => {
    const filters = e.detail || {};
    resetFilters();
    setFilters(filters);
    navigate('shoots');
  });
}

// ===== FAB =====
function setupFab() {
  document.getElementById('fab').addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('new-shoot', { detail: {} }));
  });
}

// ===== LOGOUT =====
function setupLogout() {
  document.getElementById('btn-logout').addEventListener('click', async () => {
    await logout();
    location.reload();
  });
}

function setupChangePassword() {
  const btn = document.getElementById('btn-change-pw');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="border-radius:20px 20px 0 0;">
        <div class="modal-header">
          <h2>Change Password</h2>
          <button class="btn-icon" id="pw-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>New password</label>
            <input type="password" id="pw-new" placeholder="Min 6 characters">
          </div>
          <div class="form-group">
            <label>Confirm password</label>
            <input type="password" id="pw-confirm" placeholder="Re-enter password">
          </div>
          <div id="pw-error" class="auth-error hidden"></div>
        </div>
        <div class="modal-footer">
          <span class="spacer"></span>
          <button class="btn-secondary" id="pw-cancel">Cancel</button>
          <button class="btn-primary" id="pw-save">Update</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('#pw-close').addEventListener('click', close);
    overlay.querySelector('#pw-cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    overlay.querySelector('#pw-save').addEventListener('click', async () => {
      const newPw = overlay.querySelector('#pw-new').value;
      const confirmPw = overlay.querySelector('#pw-confirm').value;
      const errEl = overlay.querySelector('#pw-error');

      if (!newPw || newPw.length < 6) {
        errEl.textContent = 'Password must be at least 6 characters';
        errEl.classList.remove('hidden');
        return;
      }
      if (newPw !== confirmPw) {
        errEl.textContent = 'Passwords don\'t match';
        errEl.classList.remove('hidden');
        return;
      }

      try {
        const { error } = await supabase.auth.updateUser({ password: newPw });
        if (error) throw error;
        close();
        window.dispatchEvent(new CustomEvent('toast', { detail: 'Password updated' }));
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      }
    });
  });
}

// ===== SHOOT MODAL =====
function setupShootModal() {
  const overlay = document.getElementById('shoot-modal');
  const titleEl = document.getElementById('modal-title');
  const statusGroup = document.getElementById('status-group');
  const statusBar = document.getElementById('s-status-bar');
  const deleteBtn = document.getElementById('modal-delete');
  let editingShoot = null;

  const close = () => { overlay.classList.add('hidden'); editingShoot = null; };

  document.getElementById('modal-close').addEventListener('click', close);
  document.getElementById('modal-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  async function open(shoot = null, defaults = {}) {
    editingShoot = shoot;
    const isEdit = !!shoot;

    titleEl.textContent = isEdit ? 'Edit Shoot' : 'New Shoot';
    statusGroup.style.display = isEdit ? 'block' : 'none';
    deleteBtn.classList.toggle('hidden', !isEdit);

    document.getElementById('s-date').value  = shoot?.date || defaults.date || new Date().toISOString().slice(0, 10);
    document.getElementById('s-time').value  = shoot?.time || '';
    document.getElementById('s-client').value = shoot?.client || '';
    document.getElementById('s-requested-by').value = shoot?.requested_by || '';
    document.getElementById('s-notes').value = shoot?.notes || '';

    const [mastersRes, teamRes] = await Promise.all([
      supabase.from('masters').select('*').order('sort_order'),
      supabase.from('team_members').select('id, name')
    ]);
    const masters = mastersRes.data || [];
    const team = teamRes.data || [];

    // Assignee
    const assigneeSel = document.getElementById('s-assignee');
    const isExternal = shoot?.assignee_id === '__external' || (!shoot?.assignee_id && shoot?.external_assignee);
    assigneeSel.innerHTML =
      team.map(m =>
        `<option value="${m.id}" ${shoot?.assignee_id === m.id ? 'selected' : ''}>${m.name}</option>`
      ).join('') +
      `<option value="__external" ${isExternal ? 'selected' : ''}>📷 External</option>`;

    const extGroup = document.getElementById('s-external-group');
    const extInput = document.getElementById('s-external');
    extGroup.classList.toggle('hidden', !isExternal);
    extInput.value = shoot?.external_assignee || '';
    assigneeSel.onchange = () => {
      extGroup.classList.toggle('hidden', assigneeSel.value !== '__external');
    };

    // Type checkboxes
    const shootTypes = masters.filter(m => m.type === 'shoot_type');
    const selectedTypes = (shoot?.type || '').split(',').map(t => t.trim()).filter(Boolean);
    document.getElementById('s-type-checks').innerHTML = shootTypes.map(t => `
      <label class="check-label">
        <input type="checkbox" value="${t.label}" ${selectedTypes.includes(t.label) ? 'checked' : ''}>
        <span>${t.label}</span>
      </label>
    `).join('');

    // Department checkboxes
    const departments = masters.filter(m => m.type === 'department');
    const selectedDepts = shoot?.departments || [];
    document.getElementById('s-dept-checks').innerHTML = departments.map(d => `
      <label class="check-label">
        <input type="checkbox" value="${d.label}" ${selectedDepts.includes(d.label) ? 'checked' : ''}>
        <span>${d.label}</span>
      </label>
    `).join('');

    // Location
    const locations = masters.filter(m => m.type === 'location');
    const locationSel = document.getElementById('s-location');
    const currentLoc = shoot?.location || '';
    const locType = shoot?.location_type || 'indoor';
    locationSel.innerHTML =
      locations.map(l =>
        `<option value="${l.label}" ${locType === 'indoor' && currentLoc === l.label ? 'selected' : ''}>${l.label}</option>`
      ).join('') +
      `<option value="__outdoor" ${locType === 'outdoor' ? 'selected' : ''}>🌳 Outdoor (other)</option>`;

    const outdoorGroup = document.getElementById('s-outdoor-group');
    document.getElementById('s-outdoor').value = shoot?.outdoor_venue || '';
    outdoorGroup.classList.toggle('hidden', locType !== 'outdoor');
    locationSel.onchange = () => {
      outdoorGroup.classList.toggle('hidden', locationSel.value !== '__outdoor');
    };

    // Impromptu toggle
    const plannedBtn = document.getElementById('s-planned');
    const impromptuBtn = document.getElementById('s-impromptu');
    const isImpromptu = shoot?.is_impromptu || false;
    plannedBtn.classList.toggle('active', !isImpromptu);
    impromptuBtn.classList.toggle('active', isImpromptu);
    plannedBtn.onclick = () => { plannedBtn.classList.add('active'); impromptuBtn.classList.remove('active'); };
    impromptuBtn.onclick = () => { impromptuBtn.classList.add('active'); plannedBtn.classList.remove('active'); };

    // Status bar (edit only) — uses "Editing" instead of "Edited"
    if (isEdit) {
      const statuses = ['Planned', 'Shot', 'Editing', 'Posted'];
      statusBar.innerHTML = statuses.map(s =>
        `<button data-status="${s}" class="${shoot.status === s ? 'active-' + s : ''}">${s}</button>`
      ).join('');
      statusBar.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
          statusBar.querySelectorAll('button').forEach(b => b.className = '');
          btn.className = `active-${btn.dataset.status}`;
        });
      });
    }

    // Audit log
    if (isEdit) {
      const { data: logs } = await supabase
        .from('audit_log')
        .select('*')
        .eq('shoot_id', shoot.id)
        .order('created_at', { ascending: false })
        .limit(20);

      const logContainer = document.getElementById('s-audit-log');
      if (logContainer && logs?.length) {
        logContainer.innerHTML = `
          <label>Activity Log</label>
          <div class="audit-log-list">
            ${logs.map(l => {
              const time = new Date(l.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
              return `<div class="audit-row">
                <span class="audit-who">${l.member_name}</span>
                <span class="audit-what">${l.type_name}: ${l.from_status} → ${l.to_status}</span>
                <span class="audit-when">${time}</span>
              </div>`;
            }).join('')}
          </div>
        `;
      } else if (logContainer) {
        logContainer.innerHTML = '';
      }
    }

    overlay.classList.remove('hidden');
  }

  // Save
  document.getElementById('modal-save').addEventListener('click', async () => {
    const date     = document.getElementById('s-date').value;
    const time     = document.getElementById('s-time').value || null;
    const client   = document.getElementById('s-client').value.trim();
    const requested_by = document.getElementById('s-requested-by').value.trim();
    const notes    = document.getElementById('s-notes').value.trim();
    const assigneeVal = document.getElementById('s-assignee').value;
    const assignee_id = assigneeVal === '__external' ? null : (assigneeVal || null);
    const external_assignee = assigneeVal === '__external' ? document.getElementById('s-external').value.trim() : '';

    if (!date) return;

    const typeChecks = document.querySelectorAll('#s-type-checks input:checked');
    const type = Array.from(typeChecks).map(c => c.value).join(',');
    if (!type) { alert('Select at least one type'); return; }

    const deptChecks = document.querySelectorAll('#s-dept-checks input:checked');
    const departments = Array.from(deptChecks).map(c => c.value);

    const locationSel = document.getElementById('s-location');
    const locVal = locationSel.value;
    const location_type = locVal === '__outdoor' ? 'outdoor' : 'indoor';
    const location = location_type === 'outdoor' ? '' : locVal;
    const outdoor_venue = location_type === 'outdoor' ? document.getElementById('s-outdoor').value.trim() : '';

    const is_impromptu = document.getElementById('s-impromptu').classList.contains('active');

    let status = 'Planned';
    if (editingShoot) {
      const activeStatus = statusBar.querySelector('button[class^="active-"]');
      status = activeStatus?.dataset.status || editingShoot.status;
    }

    const STATUS_ORDER = ['Planned', 'Shot', 'Editing', 'Posted'];
    const types = type.split(',').map(t => t.trim()).filter(Boolean);
    let type_statuses = {};
    if (editingShoot && editingShoot.type_statuses) {
      types.forEach(t => {
        type_statuses[t] = editingShoot.type_statuses[t] || status;
      });
    } else {
      types.forEach(t => { type_statuses[t] = status; });
    }

    const overallStatus = editingShoot
      ? STATUS_ORDER[Math.min(...Object.values(type_statuses).map(s => STATUS_ORDER.indexOf(s)))]
      : 'Planned';

    const row = { date, time, type, client, requested_by, location, notes, assignee_id, external_assignee, status: overallStatus, departments, location_type, outdoor_venue, is_impromptu, type_statuses };

    if (editingShoot) {
      const { data: updated } = await supabase.from('shoots').update(row).eq('id', editingShoot.id).select().single();

      // Log type status changes
      const oldTS = editingShoot.type_statuses || {};
      const newTS = type_statuses || {};
      const me = getMember();
      for (const t of Object.keys(newTS)) {
        if (oldTS[t] && oldTS[t] !== newTS[t]) {
          await supabase.from('audit_log').insert({
            shoot_id: editingShoot.id,
            member_id: me?.id,
            member_name: me?.name || 'Unknown',
            type_name: t,
            from_status: oldTS[t],
            to_status: newTS[t]
          });
        }
      }

      // Sync to Google Sheets
      if (updated) {
        const teamRes = await supabase.from('team_members').select('id, name');
        const team = teamRes.data || [];
        updated.assignee_name = team.find(t => t.id === updated.assignee_id)?.name || '';
        syncShoot(updated, 'upsert');
      }

      window.dispatchEvent(new CustomEvent('toast', { detail: 'Shoot updated' }));
    } else {
      row.created_by = getMember()?.id || null;
      const { data: inserted } = await supabase.from('shoots').insert(row).select().single();

      // Sync to Google Sheets
      if (inserted) {
        const teamRes = await supabase.from('team_members').select('id, name');
        const team = teamRes.data || [];
        inserted.assignee_name = team.find(t => t.id === inserted.assignee_id)?.name || '';
        syncShoot(inserted, 'upsert');
      }

      window.dispatchEvent(new CustomEvent('toast', { detail: 'Shoot added' }));
    }

    close();
    pages[currentPage]();
  });

  // Delete
  deleteBtn.addEventListener('click', async () => {
    if (!editingShoot || !confirm('Delete this shoot?')) return;
    await supabase.from('shoots').delete().eq('id', editingShoot.id);
    syncShoot(editingShoot, 'delete');
    close();
    pages[currentPage]();
    window.dispatchEvent(new CustomEvent('toast', { detail: 'Shoot deleted' }));
  });

  // Custom events
  window.addEventListener('open-shoot', (e) => open(e.detail));
  window.addEventListener('new-shoot', (e) => open(null, e.detail));
}

// ===== TOAST =====
function setupToast() {
  window.addEventListener('toast', (e) => {
    const el = document.getElementById('toast');
    el.textContent = e.detail;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 2500);
  });
}

// ===== SERVICE WORKER =====
function registerSW() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('./service-worker.js').then(reg => {
    setInterval(() => reg.update(), 2 * 60000);

    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
          window.dispatchEvent(new CustomEvent('toast', { detail: 'App updated — reloading…' }));
          setTimeout(() => location.reload(), 800);
        }
      });
    });
  }).catch(console.error);
}

function setupPullToRefresh() {
  const main = document.getElementById('main-content');
  const indicator = document.getElementById('pull-refresh');
  if (!main || !indicator) return;

  let startY = 0;
  let pulling = false;

  main.addEventListener('touchstart', (e) => {
    if (main.scrollTop === 0) {
      startY = e.touches[0].clientY;
      pulling = true;
    }
  }, { passive: true });

  main.addEventListener('touchmove', (e) => {
    if (!pulling) return;
    const diff = e.touches[0].clientY - startY;
    if (diff > 30 && main.scrollTop === 0) {
      indicator.classList.add('visible');
    } else {
      indicator.classList.remove('visible');
    }
  }, { passive: true });

  main.addEventListener('touchend', async () => {
    if (!pulling) return;
    pulling = false;
    if (indicator.classList.contains('visible')) {
      indicator.classList.remove('visible');
      indicator.classList.add('refreshing');
      indicator.querySelector('span').textContent = '';
      await pages[currentPage]();
      setTimeout(() => {
        indicator.classList.remove('refreshing');
        indicator.querySelector('span').textContent = '↻ Release to refresh';
      }, 500);
    }
  });
}

async function subscribePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();

    if (!sub) {
      const key = Uint8Array.from(atob(VAPID_PUBLIC_KEY.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key
      });
    }

    const member = getMember();
    if (!member) return;

    const json = sub.toJSON();
    await supabase.from('push_subscriptions').upsert({
      member_id: member.id,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth
    }, { onConflict: 'endpoint' });
  } catch (err) {
    console.warn('Push subscription failed:', err);
  }
}

// ===== BOOT =====
init();
