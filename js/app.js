import { supabase } from './supabase.js';
import { initAuth, getUser, getMember, login, signup, logout } from './auth.js';
import { render as renderDashboard } from './dashboard.js';
import { render as renderCalendar } from './calendar.js';
import { render as renderShoots } from './shoots.js';
import { render as renderTeam } from './team.js';

const pages = {
  dashboard: renderDashboard,
  calendar:  renderCalendar,
  shoots:    renderShoots,
  team:      renderTeam,
};
let currentPage = 'dashboard';

// ===== INIT =====
async function init() {
  const user = await initAuth();

  if (user && getMember()) {
    showApp();
  } else if (user && !getMember()) {
    // Stale session with no team membership — sign out and show clean login
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

  submitBtn.addEventListener('click', async () => {
    const phone = document.getElementById('auth-phone').value.trim();
    const pass  = document.getElementById('auth-pass').value;
    errorEl.classList.add('hidden');

    if (!phone || !pass) {
      errorEl.textContent = 'Phone number and password are required';
      errorEl.classList.remove('hidden');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Please wait…';

    try {
      await login(phone, pass);
      await initAuth();
      if (getMember()) {
        showApp();
      } else {
        await logout();
        errorEl.textContent = 'This phone number hasn\'t been added to the team yet. Ask your admin to add you first.';
        errorEl.classList.remove('hidden');
        submitBtn.disabled = false;
        submitBtn.textContent = isSignup ? 'Sign up' : 'Log in';
      }
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Log in';
    }
  });
}

function showAuthError(msg) {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
  const errorEl = document.getElementById('auth-error');
  errorEl.textContent = msg;
  errorEl.classList.remove('hidden');
}

// ===== MAIN APP =====
function showApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  const member = getMember();
  document.getElementById('user-greeting').textContent = `Hi, ${member?.name || 'there'}`;

  navigate('dashboard');
  setupNav();
  setupFab();
  setupLogout();
  setupChangePassword();
  setupShootModal();
  setupToast();
  setupReminders();
  registerSW();
}

// ===== NAVIGATION =====
function navigate(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  pages[page]();
}

function setupNav() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => navigate(tab.dataset.page));
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

    document.getElementById('s-date').value     = shoot?.date || defaults.date || new Date().toISOString().slice(0, 10);
    document.getElementById('s-time').value     = shoot?.time || '';
    document.getElementById('s-type').value     = shoot?.type || 'Reel';
    document.getElementById('s-client').value   = shoot?.client || '';
    document.getElementById('s-location').value = shoot?.location || '';
    document.getElementById('s-notes').value    = shoot?.notes || '';

    // Load team for assignee dropdown
    const { data: team } = await supabase.from('team_members').select('id, name');
    const assigneeSel = document.getElementById('s-assignee');
    assigneeSel.innerHTML = (team || []).map(m =>
      `<option value="${m.id}" ${shoot?.assignee_id === m.id ? 'selected' : ''}>${m.name}</option>`
    ).join('');

    // Status bar
    if (isEdit) {
      const statuses = ['Planned', 'Shot', 'Edited', 'Posted'];
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

    overlay.classList.remove('hidden');
  }

  // Save
  document.getElementById('modal-save').addEventListener('click', async () => {
    const date     = document.getElementById('s-date').value;
    const time     = document.getElementById('s-time').value || null;
    const type     = document.getElementById('s-type').value;
    const client   = document.getElementById('s-client').value.trim();
    const location = document.getElementById('s-location').value.trim();
    const notes    = document.getElementById('s-notes').value.trim();
    const assignee_id = document.getElementById('s-assignee').value || null;

    if (!date) return;

    let status = 'Planned';
    if (editingShoot) {
      const activeStatus = statusBar.querySelector('button[class^="active-"]');
      status = activeStatus?.dataset.status || editingShoot.status;
    }

    const row = { date, time, type, client, location, notes, assignee_id, status };

    if (editingShoot) {
      await supabase.from('shoots').update(row).eq('id', editingShoot.id);
      window.dispatchEvent(new CustomEvent('toast', { detail: 'Shoot updated' }));
    } else {
      row.created_by = getMember()?.id || null;
      await supabase.from('shoots').insert(row);
      window.dispatchEvent(new CustomEvent('toast', { detail: 'Shoot added' }));
    }

    close();
    pages[currentPage](); // refresh current page
  });

  // Delete
  deleteBtn.addEventListener('click', async () => {
    if (!editingShoot || !confirm('Delete this shoot?')) return;
    await supabase.from('shoots').delete().eq('id', editingShoot.id);
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

// ===== REMINDERS =====
function setupReminders() {
  if (!('Notification' in window) || Notification.permission === 'denied') return;

  if (Notification.permission === 'default') {
    // Ask after a short delay
    setTimeout(() => Notification.requestPermission(), 5000);
  }

  // Check every 5 min for shoots starting within 1 hour
  setInterval(async () => {
    if (Notification.permission !== 'granted') return;
    const now = new Date();
    const soon = new Date(now.getTime() + 60 * 60000);
    const today = now.toISOString().slice(0, 10);

    const { data: shoots } = await supabase
      .from('shoots')
      .select('*')
      .eq('date', today)
      .eq('status', 'Planned')
      .not('time', 'is', null);

    (shoots || []).forEach(s => {
      const shootTime = new Date(`${s.date}T${s.time}`);
      if (shootTime > now && shootTime <= soon) {
        new Notification('📸 Shoot in 1 hour', {
          body: `${s.type}${s.client ? ' — ' + s.client : ''} at ${s.time}${s.location ? ' · ' + s.location : ''}`,
          tag: s.id // prevents duplicates
        });
      }
    });
  }, 5 * 60000);
}

// ===== SERVICE WORKER =====
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(console.error);
  }
}

// ===== BOOT =====
init();