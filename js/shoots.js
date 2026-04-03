import { supabase } from './supabase.js';

const STATUSES = ['Planned', 'Shot', 'Edited', 'Posted'];

let filterMember = 'All';
let filterStatus = 'All';
let viewMode = 'list';
let teamCache = [];

const container = () => document.getElementById('page-shoots');

export async function render() {
  const el = container();
  if (!el.querySelector('.filter-bar')) {
    el.innerHTML = '<div class="page-loader"><div class="skeleton-card short"></div><div class="skeleton-card short"></div><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div></div>';
  }

  const [shootsRes, teamRes] = await Promise.all([
    supabase.from('shoots').select('*').order('date', { ascending: true }),
    supabase.from('team_members').select('id, name')
  ]);

  const shoots = shootsRes.data || [];
  teamCache = teamRes.data || [];

  const filtered = shoots.filter(s => {
    if (filterMember !== 'All' && s.assignee_id !== filterMember) return false;
    if (filterStatus !== 'All' && s.status !== filterStatus) return false;
    return true;
  });

  const memberChips = [{ id: 'All', name: 'All' }, ...teamCache];
  const statusChips = ['All', ...STATUSES];

  el.innerHTML = `
    <div class="filter-bar">
      ${memberChips.map(m => `
        <button class="filter-chip${filterMember === m.id ? ' active' : ''}" data-member="${m.id}">${m.name}</button>
      `).join('')}
    </div>
    <div class="filter-bar">
      ${statusChips.map(s => `
        <button class="filter-chip${filterStatus === s ? ' active' : ''}" data-status="${s}">${s}</button>
      `).join('')}
    </div>
    <div class="view-toggle">
      <button class="${viewMode === 'list' ? 'active' : ''}" data-view="list">List</button>
      <button class="${viewMode === 'pipeline' ? 'active' : ''}" data-view="pipeline">Pipeline</button>
    </div>
    <div id="shoots-content"></div>
  `;

  el.querySelectorAll('[data-member]').forEach(btn => {
    btn.addEventListener('click', () => { filterMember = btn.dataset.member; render(); });
  });
  el.querySelectorAll('[data-status]').forEach(btn => {
    btn.addEventListener('click', () => { filterStatus = btn.dataset.status; render(); });
  });
  el.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => { viewMode = btn.dataset.view; render(); });
  });

  const content = el.querySelector('#shoots-content');
  if (viewMode === 'list') renderList(content, filtered);
  else renderPipeline(content, filtered, shoots);
}

function renderLocation(s) {
  if (s.location_type === 'outdoor') return s.outdoor_venue || 'Outdoor';
  return s.location || '';
}

function renderTags(s) {
  let tags = '';
  if (s.type) tags += s.type.split(',').map(t => `<span class="tag tag-type">${t.trim()}</span>`).join('');
  if (s.departments?.length) tags += s.departments.map(d => `<span class="tag tag-dept">${d}</span>`).join('');
  if (s.is_impromptu) tags += '<span class="tag tag-impromptu">Impromptu</span>';
  if (s.location_type === 'outdoor') tags += '<span class="tag tag-outdoor">Outdoor</span>';
  return tags ? `<div class="tag-row">${tags}</div>` : '';
}

function renderList(el, shoots) {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = shoots.filter(s => s.date >= today);
  const past = [...shoots.filter(s => s.date < today)].reverse();
  const assigneeName = (id) => teamCache.find(t => t.id === id)?.name || '—';
  const loc = (s) => renderLocation(s);

  const renderCard = (s) => `
    <div class="shoot-card border-${s.status}" data-id="${s.id}">
      <div class="shoot-info">
        <div class="shoot-title">${s.client || 'No client'}</div>
        <div class="shoot-meta">${s.date}${s.time ? ' · ' + fmtTime(s.time) : ''}${loc(s) ? ' · ' + loc(s) : ''}</div>
        ${renderTags(s)}
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
        <span class="status-chip status-${s.status}">${s.status}</span>
        <span class="shoot-assignee">${assigneeName(s.assignee_id)}</span>
      </div>
    </div>`;

  el.innerHTML = `
    ${upcoming.length ? `<p class="section-title">Upcoming</p>${upcoming.map(renderCard).join('')}` : ''}
    ${past.length ? `<p class="section-title" style="margin-top:20px">Past</p>${past.map(renderCard).join('')}` : ''}
    ${shoots.length === 0 ? '<div class="empty-state"><div class="emoji">📸</div>No shoots found</div>' : ''}
  `;

  el.querySelectorAll('.shoot-card[data-id]').forEach(card => {
    card.addEventListener('click', () => {
      const shoot = (upcoming.concat(past)).find(s => s.id === card.dataset.id);
      if (shoot) window.dispatchEvent(new CustomEvent('open-shoot', { detail: shoot }));
    });
  });
}

function renderPipeline(el, filtered, allShoots) {
  const assigneeName = (id) => teamCache.find(t => t.id === id)?.name || '—';
  const STATUS_ORDER = ['Planned', 'Shot', 'Edited', 'Posted'];

  const getOverall = (s) => {
    if (!s.type_statuses || Object.keys(s.type_statuses).length === 0) return s.status;
    return STATUS_ORDER[Math.min(...Object.values(s.type_statuses).map(st => STATUS_ORDER.indexOf(st)))];
  };

  el.innerHTML = `
    <div class="pipeline-wrap">
      ${STATUSES.map(status => {
        const items = filtered.filter(s => getOverall(s) === status);
        return `
          <div class="pipeline-col">
            <div class="pipe-header">
              <div class="pipe-dot dot-${status}"></div>
              <span class="pipe-title">${status}</span>
              <span class="pipe-count">${items.length}</span>
            </div>
            ${items.length === 0 ? '<div class="pipe-empty">No shoots</div>' : items.map(s => {
              const ts = s.type_statuses || {};
              const types = Object.keys(ts);
              return `
                <div class="pipe-card" data-id="${s.id}">
                  <div class="pipe-card-type">${s.client || 'No client'}</div>
                  ${s.is_impromptu ? '<span class="tag tag-impromptu" style="margin-top:4px">Impromptu</span>' : ''}
                  <div class="pipe-card-meta">
                    <span>${s.date}</span>
                    <span class="shoot-assignee">${assigneeName(s.assignee_id)}</span>
                  </div>
                  <div class="pipe-subtypes">
                    ${types.map(t => {
                      const tStatus = ts[t];
                      const nextIdx = STATUS_ORDER.indexOf(tStatus) + 1;
                      const nextS = nextIdx < STATUS_ORDER.length ? STATUS_ORDER[nextIdx] : null;
                      return `
                        <div class="pipe-subtype">
                          <span class="pipe-subtype-name">${t}</span>
                          <span class="status-chip status-${tStatus}" style="font-size:10px;padding:2px 8px;">${tStatus}</span>
                          ${nextS ? `<button class="pipe-sub-advance" data-sid="${s.id}" data-type="${t}" data-to="${nextS}" title="Move ${t} to ${nextS}">→</button>` : '<span class="pipe-sub-done">✓</span>'}
                        </div>`;
                    }).join('')}
                  </div>
                </div>`;
            }).join('')}
          </div>`;
      }).join('')}
    </div>`;

  el.querySelectorAll('.pipe-card[data-id]').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.pipe-sub-advance')) return;
      const shoot = allShoots.find(s => s.id === card.dataset.id);
      if (shoot) window.dispatchEvent(new CustomEvent('open-shoot', { detail: shoot }));
    });
  });

  el.querySelectorAll('.pipe-sub-advance').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const shootId = btn.dataset.sid;
      const typeName = btn.dataset.type;
      const newStatus = btn.dataset.to;

      const shoot = allShoots.find(s => s.id === shootId);
      if (!shoot) return;

      const updatedTS = { ...shoot.type_statuses, [typeName]: newStatus };
      const overallStatus = STATUS_ORDER[Math.min(...Object.values(updatedTS).map(st => STATUS_ORDER.indexOf(st)))];

      await supabase.from('shoots').update({
        type_statuses: updatedTS,
        status: overallStatus
      }).eq('id', shootId);

      // Update local data for immediate re-render
      shoot.type_statuses = updatedTS;
      shoot.status = overallStatus;

      render();
      window.dispatchEvent(new CustomEvent('toast', { detail: `${typeName} → ${newStatus}` }));
    });
  });
}

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hr = parseInt(h);
  return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
}
