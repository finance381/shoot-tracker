import { supabase } from './supabase.js';
import { getMember } from './auth.js';

const STATUS_ORDER = ['Planned', 'Shot', 'Editing', 'Posted'];
let renderGen = 0;
let filterTab = 'pending';

const container = () => document.getElementById('page-requests');

export async function render() {
  const myGen = ++renderGen;
  const el = container();
  if (!el) return;

  if (!el.querySelector('.requests-tabs')) {
    el.innerHTML = '<div class="page-loader"><div class="skeleton-card short"></div><div class="skeleton-card"></div><div class="skeleton-card"></div></div>';
  }

  const [reqRes, teamRes] = await Promise.all([
    supabase.from('shoot_requests').select('*').order('created_at', { ascending: false }),
    supabase.from('team_members').select('id, name')
  ]);

  if (myGen !== renderGen) return;

  const requests = reqRes.data || [];
  const team = teamRes.data || [];

  const pending = requests.filter(r => r.status === 'pending');
  const accepted = requests.filter(r => r.status === 'accepted');
  const rejected = requests.filter(r => r.status === 'rejected');

  const counts = { pending: pending.length, accepted: accepted.length, rejected: rejected.length };
  const filtered = filterTab === 'pending' ? pending : filterTab === 'accepted' ? accepted : rejected;

  el.innerHTML = `
    <div class="requests-tabs">
      <button class="req-tab ${filterTab === 'pending' ? 'active' : ''}" data-tab="pending">
        Pending ${counts.pending > 0 ? `<span class="req-badge">${counts.pending}</span>` : ''}
      </button>
      <button class="req-tab ${filterTab === 'accepted' ? 'active' : ''}" data-tab="accepted">Accepted</button>
      <button class="req-tab ${filterTab === 'rejected' ? 'active' : ''}" data-tab="rejected">Rejected</button>
    </div>

    ${filtered.length === 0
      ? `<div class="empty-state"><div class="emoji">${filterTab === 'pending' ? '📭' : filterTab === 'accepted' ? '✅' : '❌'}</div>No ${filterTab} requests</div>`
      : filtered.map(r => renderRequestCard(r, team)).join('')
    }
  `;

  // Tab handlers
  el.querySelectorAll('.req-tab').forEach(btn => {
    btn.addEventListener('click', () => { filterTab = btn.dataset.tab; render(); });
  });

  // Accept/reject handlers
  el.querySelectorAll('.req-accept-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openAcceptModal(requests.find(r => r.id === btn.dataset.rid), team);
    });
  });

  el.querySelectorAll('.req-reject-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const rid = btn.dataset.rid;
      const reason = prompt('Reason for rejecting (optional):') || '';
      const me = getMember();

      await supabase.from('shoot_requests').update({
        status: 'rejected',
        reject_reason: reason,
        reviewed_by: me?.id,
        reviewed_at: new Date().toISOString()
      }).eq('id', rid);

      window.dispatchEvent(new CustomEvent('toast', { detail: 'Request rejected' }));
      render();
    });
  });

  // Card click → open detail
  el.querySelectorAll('.req-card').forEach(card => {
    card.addEventListener('click', () => {
      const req = requests.find(r => r.id === card.dataset.rid);
      if (req) openDetailModal(req, team);
    });
  });
}

function renderRequestCard(r, team) {
  const dateObj = new Date(r.date + 'T00:00:00');
  const dateStr = dateObj.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  const timeStr = r.time ? fmtTime(r.time) : '';
  const reviewer = r.reviewed_by ? team.find(t => t.id === r.reviewed_by)?.name : '';
  const ago = timeAgo(r.created_at);

  return `
    <div class="req-card req-${r.status}" data-rid="${r.id}">
      <div class="req-card-top">
        <div>
          <div class="req-card-name">${r.requested_by}</div>
          <div class="req-card-meta">${dateStr}${timeStr ? ' at ' + timeStr : ''} · ${ago}</div>
        </div>
        ${r.status === 'pending' ? `
          <div class="req-card-actions">
            <button class="req-accept-btn" data-rid="${r.id}">✓ Accept</button>
            <button class="req-reject-btn" data-rid="${r.id}">✗</button>
          </div>
        ` : ''}
      </div>
      <div class="req-card-details">
        ${r.shoot_type ? `<span class="tag tag-type">${r.shoot_type.replace(/,/g, ', ')}</span>` : ''}
        ${r.department ? r.department.split(',').map(d => `<span class="tag tag-dept">${d.trim()}</span>`).join('') : ''}
      </div>
      <div class="req-card-function">${r.function || ''}</div>
      ${r.location ? `<div class="req-card-loc">📍 ${r.location}</div>` : ''}
      ${r.notes ? `<div class="req-card-notes">${r.notes}</div>` : ''}
      ${r.status === 'rejected' && r.reject_reason ? `<div class="req-card-reject">Rejected: ${r.reject_reason}</div>` : ''}
      ${r.status === 'accepted' && reviewer ? `<div class="req-card-accepted">Accepted by ${reviewer}</div>` : ''}
    </div>
  `;
}

async function openAcceptModal(req, team) {
  if (!req) return;
  document.getElementById('accept-modal')?.remove();

  // Fetch masters for dropdowns
  const { data: masters } = await supabase.from('masters').select('*').order('sort_order');
  const items = masters || [];
  const shootTypes = items.filter(m => m.type === 'shoot_type');
  const departments = items.filter(m => m.type === 'department');
  const locations = items.filter(m => m.type === 'location');

  const dateStr = new Date(req.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  const overlay = document.createElement('div');
  overlay.id = 'accept-modal';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="border-radius:20px 20px 0 0;">
      <div class="modal-header">
        <h2>Accept & Create Shoot</h2>
        <button class="btn-icon" id="acc-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="req-summary">
          <strong>${req.requested_by}</strong> requested a shoot
          on <strong>${dateStr}</strong>
          ${req.time ? ' at <strong>' + fmtTime(req.time) + '</strong>' : ''}
          ${req.function ? ' — <strong>' + req.function + '</strong>' : ''}
          ${req.location ? ' · 📍 ' + req.location : ''}
          ${req.notes ? '<br><span style="font-size:12px;color:var(--stone)">' + req.notes + '</span>' : ''}
        </div>

        <div class="form-row-2">
          <div class="form-group">
            <label>Date *</label>
            <input type="date" id="acc-date" value="${req.date}">
          </div>
          <div class="form-group">
            <label>Time</label>
            <input type="time" id="acc-time" value="${req.time || ''}">
          </div>
        </div>

        <div class="form-group">
          <label>Type of Shoot *</label>
          <div id="acc-type-checks" class="checkbox-group">
            ${shootTypes.map(t => `
              <label class="check-label">
                <input type="checkbox" value="${t.label}">
                <span>${t.label}</span>
              </label>
            `).join('')}
          </div>
        </div>

        <div class="form-group">
          <label>Assign Photographer *</label>
          <select id="acc-assignee">
            ${team.map(m => `<option value="${m.id}">${m.name}</option>`).join('')}
          </select>
        </div>

        <div class="form-group">
          <label>Function</label>
          <input type="text" id="acc-function" value="${req.function || ''}">
        </div>

        <div class="form-group">
          <label>Requested By</label>
          <input type="text" id="acc-requested-by" value="${req.requested_by || ''}">
        </div>

        <div class="form-group">
          <label>For Department</label>
          <div id="acc-dept-checks" class="checkbox-group">
            ${departments.map(d => `
              <label class="check-label">
                <input type="checkbox" value="${d.label}">
                <span>${d.label}</span>
              </label>
            `).join('')}
          </div>
        </div>

        <div class="form-group">
          <label>Location</label>
          <select id="acc-location">
            ${locations.map(l => `<option value="${l.label}" ${req.location === l.label ? 'selected' : ''}>${l.label}</option>`).join('')}
            <option value="__outdoor">🌳 Outdoor (other)</option>
          </select>
        </div>
        <div class="form-group hidden" id="acc-outdoor-group">
          <label>Outdoor Venue</label>
          <input type="text" id="acc-outdoor" placeholder="e.g. Central Park, Mall Road">
        </div>

        <div class="form-group">
          <label>Notes</label>
          <textarea id="acc-notes" rows="2">${req.notes || ''}</textarea>
        </div>

        <div id="acc-error" class="auth-error hidden"></div>
      </div>
      <div class="modal-footer">
        <span class="spacer"></span>
        <button class="btn-secondary" id="acc-cancel">Cancel</button>
        <button class="btn-primary" id="acc-confirm">Create Shoot</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('#acc-close').addEventListener('click', close);
  overlay.querySelector('#acc-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  // Outdoor toggle
  const locSel = overlay.querySelector('#acc-location');
  const outdoorGrp = overlay.querySelector('#acc-outdoor-group');
  locSel.addEventListener('change', () => {
    outdoorGrp.classList.toggle('hidden', locSel.value !== '__outdoor');
  });

  overlay.querySelector('#acc-confirm').addEventListener('click', async () => {
    const date = overlay.querySelector('#acc-date').value;
    const time = overlay.querySelector('#acc-time').value || null;
    const assigneeId = overlay.querySelector('#acc-assignee').value;
    const client = overlay.querySelector('#acc-function').value.trim();
    const requested_by = overlay.querySelector('#acc-requested-by').value.trim();
    const notes = overlay.querySelector('#acc-notes').value.trim();
    const errEl = overlay.querySelector('#acc-error');

    const typeChecks = overlay.querySelectorAll('#acc-type-checks input:checked');
    const typeStr = Array.from(typeChecks).map(c => c.value).join(',');
    if (!typeStr) { errEl.textContent = 'Select at least one shoot type'; errEl.classList.remove('hidden'); return; }

    const deptChecks = overlay.querySelectorAll('#acc-dept-checks input:checked');
    const depts = Array.from(deptChecks).map(c => c.value);

    const locVal = locSel.value;
    const location_type = locVal === '__outdoor' ? 'outdoor' : 'indoor';
    const location = location_type === 'outdoor' ? '' : locVal;
    const outdoor_venue = location_type === 'outdoor' ? overlay.querySelector('#acc-outdoor').value.trim() : '';

    const btn = overlay.querySelector('#acc-confirm');
    btn.disabled = true;
    btn.textContent = 'Creating…';

    try {
      const me = getMember();
      const types = typeStr.split(',').map(t => t.trim()).filter(Boolean);
      const type_statuses = {};
      types.forEach(t => { type_statuses[t] = 'Planned'; });

      const { data: shoot, error: shootErr } = await supabase.from('shoots').insert({
        date, time,
        type: typeStr,
        client,
        requested_by,
        location, location_type, outdoor_venue,
        assignee_id: assigneeId,
        status: 'Planned',
        type_statuses,
        departments: depts,
        notes,
        is_impromptu: false,
        created_by: me?.id
      }).select().single();

      if (shootErr) throw shootErr;

      await supabase.from('shoot_requests').update({
        status: 'accepted',
        reviewed_by: me?.id,
        reviewed_at: new Date().toISOString(),
        shoot_id: shoot?.id
      }).eq('id', req.id);

      if (shoot) {
        const teamMember = team.find(t => t.id === shoot.assignee_id);
        shoot.assignee_name = teamMember?.name || '';
        import('./sheets-sync.js').then(({ syncShoot }) => syncShoot(shoot, 'upsert'));
      }

      close();
      window.dispatchEvent(new CustomEvent('toast', { detail: 'Shoot created from request!' }));
      render();
    } catch (err) {
      errEl.textContent = err.message || 'Failed to create shoot';
      errEl.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = 'Create Shoot';
    }
  });
}

function openDetailModal(req, team) {
  document.getElementById('req-detail-modal')?.remove();

  const dateStr = new Date(req.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  const reviewer = req.reviewed_by ? team.find(t => t.id === req.reviewed_by)?.name : '';
  const reviewedAt = req.reviewed_at ? new Date(req.reviewed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

  const overlay = document.createElement('div');
  overlay.id = 'req-detail-modal';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="border-radius:20px 20px 0 0;">
      <div class="modal-header">
        <h2>Request Details</h2>
        <button class="btn-icon" id="rd-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="req-detail-row"><strong>Requested By</strong><span>${req.requested_by}${req.phone ? ' · ' + req.phone : ''}</span></div>
        <div class="req-detail-row"><strong>Date</strong><span>${dateStr}</span></div>
        ${req.time ? `<div class="req-detail-row"><strong>Time</strong><span>${fmtTime(req.time)}</span></div>` : ''}
        <div class="req-detail-row"><strong>Type</strong><span>${(req.shoot_type || '').replace(/,/g, ', ')}</span></div>
        ${req.function ? `<div class="req-detail-row"><strong>Function</strong><span>${req.function}</span></div>` : ''}
        ${req.department ? `<div class="req-detail-row"><strong>Department</strong><span>${req.department.replace(/,/g, ', ')}</span></div>` : ''}
        ${req.location ? `<div class="req-detail-row"><strong>Location</strong><span>${req.location}</span></div>` : ''}
        ${req.notes ? `<div class="req-detail-row"><strong>Notes</strong><span>${req.notes}</span></div>` : ''}
        <div class="req-detail-row"><strong>Status</strong><span class="req-status-badge req-status-${req.status}">${req.status.charAt(0).toUpperCase() + req.status.slice(1)}</span></div>
        ${reviewer ? `<div class="req-detail-row"><strong>Reviewed By</strong><span>${reviewer} · ${reviewedAt}</span></div>` : ''}
        ${req.reject_reason ? `<div class="req-detail-row"><strong>Reject Reason</strong><span>${req.reject_reason}</span></div>` : ''}
        <div class="req-detail-row" style="color:var(--stone);font-size:12px;">Submitted ${new Date(req.created_at).toLocaleString('en-IN')}</div>
      </div>
      <div class="modal-footer">
        <span class="spacer"></span>
        <button class="btn-secondary" id="rd-done">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('#rd-close').addEventListener('click', close);
  overlay.querySelector('#rd-done').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hr = parseInt(h);
  return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
