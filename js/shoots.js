import { supabase } from './supabase.js';

const STATUSES = ['Planned', 'Shot', 'Edited', 'Posted'];

let filterMember = 'All';
let filterStatus = 'All';
let viewMode = 'list';
let teamCache = [];

const container = () => document.getElementById('page-shoots');

export async function render() {
  const el = container();

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

  el.innerHTML = `
    <div class="pipeline-wrap">
      ${STATUSES.map(status => {
        const items = filtered.filter(s => s.status === status);
        const nextStatus = STATUSES[STATUSES.indexOf(status) + 1];
        return `
          <div class="pipeline-col">
            <div class="pipe-header">
              <div class="pipe-dot dot-${status}"></div>
              <span class="pipe-title">${status}</span>
              <span class="pipe-count">${items.length}</span>
            </div>
            ${items.length === 0 ? '<div class="pipe-empty">No shoots</div>' : items.map(s => `
              <div class="pipe-card" data-id="${s.id}">
                <div class="pipe-card-type">${s.client || 'No client'}</div>
                <div class="pipe-card-client">${s.type || '—'}</div>
                ${s.is_impromptu ? '<span class="tag tag-impromptu" style="margin-top:4px">Impromptu</span>' : ''}
                <div class="pipe-card-meta">
                  <span>${s.date}</span>
                  <span class="shoot-assignee">${assigneeName(s.assignee_id)}</span>
                </div>
                ${nextStatus ? `<button class="pipe-advance" data-advance="${s.id}" data-to="${nextStatus}">Move → ${nextStatus}</button>` : ''}
              </div>
            `).join('')}
          </div>`;
      }).join('')}
    </div>`;

  el.querySelectorAll('.pipe-card[data-id]').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.pipe-advance')) return;
      const shoot = allShoots.find(s => s.id === card.dataset.id);
      if (shoot) window.dispatchEvent(new CustomEvent('open-shoot', { detail: shoot }));
    });
  });

  el.querySelectorAll('.pipe-advance').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await supabase.from('shoots').update({ status: btn.dataset.to }).eq('id', btn.dataset.advance);
      render();
      window.dispatchEvent(new CustomEvent('toast', { detail: `Moved to ${btn.dataset.to}` }));
    });
  });
}

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hr = parseInt(h);
  return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
}
