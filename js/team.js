import { supabase } from './supabase.js';
import { isAdmin } from './auth.js';

const container = () => document.getElementById('page-team');

let activeMasterTab = 'shoot_type';

export async function render() {
  const el = container();
  if (!el) return;

  try {
    if (!el.querySelector('.team-card') && !el.querySelector('.masters-section')) {
      el.innerHTML = '<div class="page-loader"><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div></div>';
    }

    const { data: members, error } = await supabase
      .from('team_members')
      .select('*')
      .order('created_at');

    if (error) { el.innerHTML = `<div class="empty-state"><div class="emoji">⚠️</div>${error.message}</div>`; return; }

    const team = members || [];
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const meInList = team.find(m => m.email === authUser?.email);
    const showAdmin = isAdmin() || meInList?.is_admin === true;

    el.innerHTML = `
      ${showAdmin ? `<button class="btn-primary btn-full" id="add-member-btn" style="margin-bottom:20px">+ Add Team Member</button>` : ''}
      <p class="section-title">Team members</p>
      ${team.map(m => `
        <div class="team-card" data-id="${m.id}">
          <div class="team-avatar">${m.name.charAt(0).toUpperCase()}</div>
          <div class="team-info">
            <div class="team-name">${m.name} ${m.is_admin ? '<span class="team-admin-badge">Admin</span>' : ''}</div>
            ${m.role ? `<div class="team-role">${m.role}</div>` : ''}
            <div class="team-contact">${m.phone || ''}${m.role ? ' · ' + m.role : ''}</div>
          </div>
          ${showAdmin && !m.is_admin ? `<button class="btn-icon team-edit-btn" data-id="${m.id}" title="Edit">✎</button>` : ''}
        </div>
      `).join('')}
      ${team.length === 0 ? '<div class="empty-state"><div class="emoji">👥</div>No team members yet</div>' : ''}
      ${showAdmin ? renderMastersSection() : ''}
    `;

    if (showAdmin) {
      el.querySelector('#add-member-btn')?.addEventListener('click', () => openTeamModal());

      el.querySelectorAll('.team-edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const member = team.find(m => m.id === btn.dataset.id);
          if (member) openTeamModal(member);
        });
      });

      setupMastersHandlers(el);
    }
  } catch (err) {
    console.error('Team render error:', err);
    el.innerHTML = `<div class="empty-state"><div class="emoji">⚠️</div>Error loading team: ${err.message}</div>`;
  }
}

// ===== MASTERS SECTION =====

function renderMastersSection() {
  const tabs = [
    { key: 'shoot_type', label: 'Shoot Types' },
    { key: 'location', label: 'Locations' },
    { key: 'department', label: 'Departments' }
  ];

  return `
    <div class="masters-section">
      <p class="section-title" style="margin-top:32px">Manage Lists</p>
      <div class="masters-tabs">
        ${tabs.map(t => `
          <button class="master-tab${activeMasterTab === t.key ? ' active' : ''}" data-mtab="${t.key}">${t.label}</button>
        `).join('')}
      </div>
      <div id="masters-content"></div>
    </div>
  `;
}

async function setupMastersHandlers(el) {
  // Tab clicks
  el.querySelectorAll('[data-mtab]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeMasterTab = btn.dataset.mtab;
      el.querySelectorAll('.master-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadMastersList(el);
    });
  });

  await loadMastersList(el);
}

async function loadMastersList(el) {
  const contentEl = el.querySelector('#masters-content');
  if (!contentEl) return;

  const { data: items, error } = await supabase
    .from('masters')
    .select('*')
    .eq('type', activeMasterTab)
    .order('sort_order');

  if (error) {
    contentEl.innerHTML = `<div class="empty-state">${error.message}</div>`;
    return;
  }

  const list = items || [];

  contentEl.innerHTML = `
    <div class="master-list">
      ${list.map(item => `
        <div class="master-item">
          <span class="master-item-label">${item.label}</span>
          <button class="master-item-delete" data-mid="${item.id}" title="Remove">✕</button>
        </div>
      `).join('')}
      ${list.length === 0 ? '<div style="text-align:center;color:var(--stone);font-size:13px;padding:12px;">No items yet</div>' : ''}
    </div>
    <div class="master-add-row">
      <input type="text" id="master-new-label" placeholder="Add new item…">
      <button id="master-add-btn">Add</button>
    </div>
  `;

  // Delete handlers
  contentEl.querySelectorAll('.master-item-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      await supabase.from('masters').delete().eq('id', btn.dataset.mid);
      loadMastersList(el);
      window.dispatchEvent(new CustomEvent('toast', { detail: 'Item removed' }));
    });
  });

  // Add handler
  const addBtn = contentEl.querySelector('#master-add-btn');
  const addInput = contentEl.querySelector('#master-new-label');

  addBtn.addEventListener('click', async () => {
    const label = addInput.value.trim();
    if (!label) return;

    const maxSort = list.length > 0 ? Math.max(...list.map(i => i.sort_order || 0)) : 0;
    await supabase.from('masters').insert({
      type: activeMasterTab,
      label,
      sort_order: maxSort + 1
    });

    addInput.value = '';
    loadMastersList(el);
    window.dispatchEvent(new CustomEvent('toast', { detail: 'Item added' }));
  });

  // Enter key to add
  addInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addBtn.click();
  });
}

// ===== TEAM MODAL =====

function openTeamModal(member = null) {
  const isEdit = !!member;

  const overlay = document.createElement('div');
  overlay.id = 'team-modal';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="border-radius:20px 20px 0 0;">
      <div class="modal-header">
        <h2>${isEdit ? 'Edit Member' : 'Add Member'}</h2>
        <button class="btn-icon" id="tm-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Name *</label>
          <input type="text" id="tm-name" value="${member?.name || ''}" placeholder="Full name">
        </div>
        <div class="form-group">
          <label>Role</label>
          <input type="text" id="tm-role" value="${member?.role || ''}" placeholder="e.g. Photographer, Editor">
        </div>
        <div class="form-group">
          <label>Phone (login number) *</label>
          <input type="tel" id="tm-phone" value="${member?.phone || ''}" placeholder="9876543210" ${isEdit ? 'disabled' : ''}>
        </div>
        <div class="form-group">
          <label>Email (optional)</label>
          <input type="email" id="tm-email" value="${member?.email || ''}" placeholder="their@email.com">
        </div>
        <div id="tm-error" class="auth-error hidden"></div>
      </div>
      <div class="modal-footer">
        ${isEdit ? `<button class="btn-danger" id="tm-delete">Remove</button>` : ''}
        <span class="spacer"></span>
        <button class="btn-secondary" id="tm-cancel">Cancel</button>
        <button class="btn-primary" id="tm-save">${isEdit ? 'Save' : 'Add Member'}</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('#tm-close').addEventListener('click', close);
  overlay.querySelector('#tm-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  overlay.querySelector('#tm-save').addEventListener('click', async () => {
    const name  = overlay.querySelector('#tm-name').value.trim();
    const role  = overlay.querySelector('#tm-role').value.trim();
    const phone = overlay.querySelector('#tm-phone').value.trim();
    const errEl = overlay.querySelector('#tm-error');

    if (!name || !phone) {
      errEl.textContent = 'Name and phone number are required';
      errEl.classList.remove('hidden');
      return;
    }

    const saveBtn = overlay.querySelector('#tm-save');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    try {
      if (isEdit) {
        const { error } = await supabase.from('team_members').update({ name, role, phone }).eq('id', member.id);
        if (error) throw error;
        close();
        render();
        window.dispatchEvent(new CustomEvent('toast', { detail: 'Member updated' }));
      } else {
        const { phoneToEmail } = await import('./auth.js');
        const fakeEmail = phoneToEmail(phone);

        const { error: insertErr } = await supabase.from('team_members').insert({
          name, role, email: fakeEmail, phone, is_admin: false
        });
        if (insertErr) throw insertErr;

        close();
        render();
        window.dispatchEvent(new CustomEvent('toast', { detail: 'Member added — they\'ll set a password on first login' }));
      }
    } catch (err) {
      console.error('Save member error:', err);
      errEl.textContent = err.message || 'Something went wrong';
      errEl.classList.remove('hidden');
      saveBtn.disabled = false;
      saveBtn.textContent = isEdit ? 'Save' : 'Add Member';
    }
  });

  if (isEdit) {
    overlay.querySelector('#tm-delete')?.addEventListener('click', async () => {
      if (!confirm(`Remove ${member.name} from the team?`)) return;
      await supabase.from('team_members').delete().eq('id', member.id);
      close();
      render();
      window.dispatchEvent(new CustomEvent('toast', { detail: 'Member removed' }));
    });
  }
}
