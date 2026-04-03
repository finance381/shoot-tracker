import { supabase } from './supabase.js';
import { getMember } from './auth.js';

const STATUSES = ['Planned', 'Shot', 'Edited', 'Posted'];
const STATUS_ORDER = ['Planned', 'Shot', 'Edited', 'Posted'];

let filterMember = 'All';
let filterStatus = 'All';
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
  const me = getMember();

  const filtered = shoots.filter(s => {
    if (filterMember !== 'All' && s.assignee_id !== filterMember) return false;
    if (filterStatus !== 'All') {
      const ts = s.type_statuses || {};
      const statuses = Object.keys(ts).length > 0 ? Object.values(ts) : [s.status];
      if (!statuses.includes(filterStatus)) return false;
    }
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
    <div id="shoots-content"></div>
  `;

  el.querySelectorAll('[data-member]').forEach(btn => {
    btn.addEventListener('click', () => { filterMember = btn.dataset.member; render(); });
  });
  el.querySelectorAll('[data-status]').forEach(btn => {
    btn.addEventListener('click', () => { filterStatus = btn.dataset.status; render(); });
  });

  renderDateGrouped(el.querySelector('#shoots-content'), filtered, shoots, me);
}

function getAssigneeName(s) {
  if (s.external_assignee) return '📷 ' + s.external_assignee;
  return teamCache.find(t => t.id === s.assignee_id)?.name || '—';
}

function renderLocation(s) {
  if (s.location_type === 'outdoor') return s.outdoor_venue || 'Outdoor';
  return s.location || '';
}

function getOverallStatus(s) {
  const ts = s.type_statuses || {};
  if (Object.keys(ts).length === 0) return s.status;
  return STATUS_ORDER[Math.min(...Object.values(ts).map(st => STATUS_ORDER.indexOf(st)))];
}

function formatDateHeading(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  const todayStr = today.toISOString().slice(0, 10);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const options = { weekday: 'short', month: 'short', day: 'numeric' };
  const formatted = d.toLocaleDateString('en-IN', options);

  if (dateStr === todayStr) return `Today — ${formatted}`;
  if (dateStr === tomorrowStr) return `Tomorrow — ${formatted}`;
  return formatted;
}

function renderDateGrouped(el, filtered, allShoots, me) {
  // Group by date
  const grouped = {};
  filtered.forEach(s => {
    if (!grouped[s.date]) grouped[s.date] = [];
    grouped[s.date].push(s);
  });

  const sortedDates = Object.keys(grouped).sort();
  const today = new Date().toISOString().slice(0, 10);

  // Split into upcoming and past
  const upcomingDates = sortedDates.filter(d => d >= today);
  const pastDates = sortedDates.filter(d => d < today).reverse();

  if (filtered.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="emoji">📸</div>No shoots found</div>';
    return;
  }

  let html = '';

  if (upcomingDates.length > 0) {
    html += '<p class="section-title">Upcoming</p>';
    html += renderDateGroups(upcomingDates, grouped, me);
  }

  if (pastDates.length > 0) {
    html += '<p class="section-title" style="margin-top:24px">Past</p>';
    html += renderDateGroups(pastDates, grouped, me);
  }

  el.innerHTML = html;

  // Click handlers for cards
  el.querySelectorAll('.shoot-card[data-id]').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.type-advance-btn')) return;
      const shoot = allShoots.find(s => s.id === card.dataset.id);
      if (shoot) window.dispatchEvent(new CustomEvent('open-shoot', { detail: shoot }));
    });
  });

  // Type advance buttons
  el.querySelectorAll('.type-advance-btn').forEach(btn => {
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

      shoot.type_statuses = updatedTS;
      shoot.status = overallStatus;

      render();
      window.dispatchEvent(new CustomEvent('toast', { detail: `${typeName} → ${newStatus}` }));
    });
  });
}

function renderDateGroups(dates, grouped, me) {
  return dates.map(date => {
    const shoots = grouped[date];
    return `
      <div class="date-group">
        <div class="date-heading">${formatDateHeading(date)}</div>
        ${shoots.map(s => renderShootCard(s, me)).join('')}
      </div>
    `;
  }).join('');
}

function renderShootCard(s, me) {
  const isMine = me && s.assignee_id === me.id;
  const ts = s.type_statuses || {};
  const types = Object.keys(ts);
  const loc = renderLocation(s);
  const overall = getOverallStatus(s);

  return `
    <div class="shoot-card ${isMine ? 'shoot-mine' : ''} border-${overall}" data-id="${s.id}">
      <div class="shoot-info">
        <div class="shoot-card-top">
          <div>
            <div class="shoot-title">${s.client || 'No client'}</div>
            <div class="shoot-meta">${s.time ? fmtTime(s.time) : 'No time'}${loc ? ' · ' + loc : ''}</div>
          </div>
          <div class="shoot-card-right">
            <span class="shoot-assignee">${getAssigneeName(s)}</span>
            ${s.is_impromptu ? '<span class="tag tag-impromptu">Impromptu</span>' : ''}
          </div>
        </div>
        ${types.length > 0 ? `
          <div class="type-status-rows">
            ${types.map(t => {
              const tStatus = ts[t];
              const nextIdx = STATUS_ORDER.indexOf(tStatus) + 1;
              const nextS = nextIdx < STATUS_ORDER.length ? STATUS_ORDER[nextIdx] : null;
              return `
                <div class="type-status-row">
                  <span class="type-name">${t}</span>
                  <div class="type-status-pills">
                    ${STATUS_ORDER.map(st => {
                      const isCurrent = st === tStatus;
                      const isPast = STATUS_ORDER.indexOf(st) < STATUS_ORDER.indexOf(tStatus);
                      return `<span class="type-pill ${isCurrent ? 'type-pill-active status-' + st : ''} ${isPast ? 'type-pill-done' : ''}">${st}</span>`;
                    }).join('')}
                  </div>
                  ${nextS ? `<button class="type-advance-btn" data-sid="${s.id}" data-type="${t}" data-to="${nextS}">→</button>` : '<span class="type-done-check">✓</span>'}
                </div>`;
            }).join('')}
          </div>
        ` : `
          <div class="type-status-rows">
            <div class="type-status-row">
              <span class="type-name">${s.type || '—'}</span>
              <span class="status-chip status-${s.status}">${s.status}</span>
            </div>
          </div>
        `}
        ${s.departments?.length ? `<div class="tag-row" style="margin-top:6px">${s.departments.map(d => `<span class="tag tag-dept">${d}</span>`).join('')}</div>` : ''}
      </div>
    </div>
  `;
}

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hr = parseInt(h);
  return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
}