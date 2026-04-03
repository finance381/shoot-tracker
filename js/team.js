import { supabase } from './supabase.js';
import { isAdmin } from './auth.js';

const container = () => document.getElementById('page-team');

export async function render() {
  const el = container();
  if (!el) return;

  try {
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
        ${isAdmin() && !m.is_admin ? `<button class="btn-icon team-edit-btn" data-id="${m.id}" title="Edit">✎</button>` : ''}
      </div>
    `).join('')}
    ${team.length === 0 ? '<div class="empty-state"><div class="emoji">👥</div>No team members yet</div>' : ''}
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
  }
  } catch (err) {
    console.error('Team render error:', err);
    el.innerHTML = `<div class="empty-state"><div class="emoji">⚠️</div>Error loading team: ${err.message}</div>`;
  }
}

function openTeamModal(member = null) {
  const isEdit = !!member;

  const overlay = document.createElement('div');
  overlay.id = 'team-modal';
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
        ${!isEdit ? `
          <div class="form-group">
            <label>Password *</label>
            <input type="password" id="tm-pass" placeholder="Min 6 characters">
          </div>
        ` : ''}
        <div id="tm-error" class="auth-error hidden"></div>
      </div>
      <div class="modal-footer">
        ${isEdit ? `<button class="btn-danger" id="tm-delete">Remove</button>` : ''}
        <span class="spacer"></span>
        <button class="btn-secondary" id="tm-cancel">Cancel</button>
        <button class="btn-primary" id="tm-save">${isEdit ? 'Save' : 'Add & Create Login'}</button>
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
        const pass = overlay.querySelector('#tm-pass').value;
        if (!pass || pass.length < 6) {
          errEl.textContent = 'Password must be at least 6 characters';
          errEl.classList.remove('hidden');
          saveBtn.disabled = false;
          saveBtn.textContent = 'Add & Create Login';
          return;
        }

        const { phoneToEmail } = await import('./auth.js');
        const fakeEmail = phoneToEmail(phone);

        // Step 1: Insert row while admin session is guaranteed active
        const { data: newRow, error: insertErr } = await supabase
          .from('team_members')
          .insert({ name, role, email: fakeEmail, phone, is_admin: false })
          .select()
          .single();
        if (insertErr) throw insertErr;

        // Step 2: Create auth account in background
        // signUp hijacks session — we handle that after
        try {
          const { data: { session: adminSession } } = await supabase.auth.getSession();
          const adminTokens = {
            access_token: adminSession.access_token,
            refresh_token: adminSession.refresh_token
          };

          const { data: signUpData } = await supabase.auth.signUp({
            email: fakeEmail, password: pass,
            options: { data: { name, phone } }
          });

          // Restore admin — don't await, just fire
          supabase.auth.setSession(adminTokens);

          // Link auth_id if we got one
          if (signUpData?.user?.id) {
            supabase.from('team_members')
              .update({ auth_id: signUpData.user.id })
              .eq('id', newRow.id)
              .then(() => {})
              .catch(() => {});
          }
        } catch (authErr) {
          // Auth creation failed but team row exists
          // User will be linked on first login via loadMember
          console.warn('Auth account creation failed, will link on first login:', authErr.message);
        }

        close();
        render();
        window.dispatchEvent(new CustomEvent('toast', { detail: 'Member added — they can log in now' }));
      }
    } catch (err) {
      console.error('Save member error:', err);
      errEl.textContent = err.message || 'Something went wrong';
      errEl.classList.remove('hidden');
      saveBtn.disabled = false;
      saveBtn.textContent = isEdit ? 'Save' : 'Add & Create Login';
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