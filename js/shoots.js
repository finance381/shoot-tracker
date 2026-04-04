import { supabase } from './supabase.js';
import { getMember } from './auth.js';

async function logStatusChange(shootId, typeName, fromStatus, toStatus) {
  const me = getMember();
  if (!me) return;
  await supabase.from('audit_log').insert({
    shoot_id: shootId,
    member_id: me.id,
    member_name: me.name,
    type_name: typeName,
    from_status: fromStatus,
    to_status: toStatus
  });
}

const STATUS_ORDER = ['Planned', 'Shot', 'Editing', 'Posted'];

let filterMember = 'All';
let filterStatus = 'All';
let filterVenue = 'All';
let filterDateFrom = '';
let filterDateTo = '';
let filterSearch = '';
let teamCache = [];
let venueCache = [];
let renderGen = 0;

const container = () => document.getElementById('page-shoots');

// Allow external filter setting (from dashboard clicks)
export function setFilters(filters = {}) {
  if (filters.member !== undefined) filterMember = filters.member;
  if (filters.status !== undefined) filterStatus = filters.status;
  if (filters.venue !== undefined) filterVenue = filters.venue;
  if (filters.dateFrom !== undefined) filterDateFrom = filters.dateFrom;
  if (filters.dateTo !== undefined) filterDateTo = filters.dateTo;
  if (filters.search !== undefined) filterSearch = filters.search;
}

export function resetFilters() {
  filterMember = 'All';
  filterStatus = 'All';
  filterVenue = 'All';
  filterDateFrom = '';
  filterDateTo = '';
  filterSearch = '';
}

export async function render() {
  const myGen = ++renderGen;
  const el = container();
  if (!el.querySelector('.shoots-filter-section')) {
    el.innerHTML = '<div class="page-loader"><div class="skeleton-card short"></div><div class="skeleton-card short"></div><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div></div>';
  }

  const [shootsRes, teamRes, mastersRes] = await Promise.all([
    supabase.from('shoots').select('*').order('date', { ascending: true }),
    supabase.from('team_members').select('id, name'),
    supabase.from('masters').select('*').eq('type', 'location').order('sort_order')
  ]);

  if (myGen !== renderGen) return;

  const shoots = shootsRes.data || [];
  teamCache = teamRes.data || [];
  venueCache = (mastersRes.data || []).map(m => m.label);
  const me = getMember();

  const filtered = shoots.filter(s => {
    if (filterMember !== 'All' && s.assignee_id !== filterMember) return false;
    if (filterStatus !== 'All') {
      const ts = s.type_statuses || {};
      const statuses = Object.keys(ts).length > 0 ? Object.values(ts) : [s.status];
      if (!statuses.includes(filterStatus)) return false;
    }
    if (filterVenue !== 'All') {
      if (s.location_type === 'outdoor') {
        if (filterVenue !== '__outdoor') return false;
      } else {
        if (s.location !== filterVenue) return false;
      }
    }
    if (filterDateFrom && s.date < filterDateFrom) return false;
    if (filterDateTo && s.date > filterDateTo) return false;
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      const assigneeName = getAssigneeName(s).toLowerCase();
      const haystack = [
        s.client, s.type, s.location, s.outdoor_venue, s.notes,
        s.status, assigneeName, s.external_assignee,
        ...(s.departments || [])
      ].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const activeFilterCount = [
    filterMember !== 'All',
    filterStatus !== 'All',
    filterVenue !== 'All',
    filterDateFrom || filterDateTo,
    filterSearch
  ].filter(Boolean).length;

  el.innerHTML = `
    <div class="shoots-filter-section">
      <div class="search-bar-wrap">
        <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" id="shoot-search" class="shoot-search" placeholder="Search function, assignee, venue…" value="${filterSearch}">
        ${activeFilterCount > 0 ? `<button id="clear-filters" class="clear-filters-btn">Clear (${activeFilterCount})</button>` : ''}
      </div>
      <div class="filter-dropdowns">
        <select id="filter-assignee" class="filter-select">
          <option value="All" ${filterMember === 'All' ? 'selected' : ''}>All Assignees</option>
          ${teamCache.map(m => `<option value="${m.id}" ${filterMember === m.id ? 'selected' : ''}>${m.name}</option>`).join('')}
        </select>
        <select id="filter-status" class="filter-select">
          <option value="All" ${filterStatus === 'All' ? 'selected' : ''}>All Status</option>
          ${STATUS_ORDER.map(s => `<option value="${s}" ${filterStatus === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="filter-dropdowns">
        <select id="filter-venue" class="filter-select">
          <option value="All" ${filterVenue === 'All' ? 'selected' : ''}>All Venues</option>
          ${venueCache.map(v => `<option value="${v}" ${filterVenue === v ? 'selected' : ''}>${v}</option>`).join('')}
          <option value="__outdoor" ${filterVenue === '__outdoor' ? 'selected' : ''}>Outdoor</option>
        </select>
        <input type="date" id="filter-date-from" class="filter-date" value="${filterDateFrom}">
        <input type="date" id="filter-date-to" class="filter-date" value="${filterDateTo}">
      </div>
    </div>
    <div id="shoots-content"></div>
  `;

  let searchTimeout;
  el.querySelector('#shoot-search').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => { filterSearch = e.target.value.trim(); render(); }, 300);
  });
  el.querySelector('#filter-assignee').addEventListener('change', (e) => { filterMember = e.target.value; render(); });
  el.querySelector('#filter-status').addEventListener('change', (e) => { filterStatus = e.target.value; render(); });
  el.querySelector('#filter-venue').addEventListener('change', (e) => { filterVenue = e.target.value; render(); });
  el.querySelector('#filter-date-from').addEventListener('change', (e) => { filterDateFrom = e.target.value; render(); });
  el.querySelector('#filter-date-to').addEventListener('change', (e) => { filterDateTo = e.target.value; render(); });
  el.querySelector('#clear-filters')?.addEventListener('click', () => { resetFilters(); render(); });

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
  const grouped = {};
  filtered.forEach(s => {
    if (!grouped[s.date]) grouped[s.date] = [];
    grouped[s.date].push(s);
  });
  const sortedDates = Object.keys(grouped).sort();
  const today = new Date().toISOString().slice(0, 10);
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

  el.querySelectorAll('.shoot-card[data-id]').forEach(card => {
    card.addEventListener('click', async (e) => {
      if (e.target.closest('.type-advance-btn')) return;
      const { data: shoot } = await supabase
        .from('shoots')
        .select('*')
        .eq('id', card.dataset.id)
        .maybeSingle();
      if (shoot) window.dispatchEvent(new CustomEvent('open-shoot', { detail: shoot }));
    });
  });

  el.querySelectorAll('.type-advance-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const shootId = btn.dataset.sid;
      const typeName = btn.dataset.type;
      const newStatus = btn.dataset.to;
      const shoot = allShoots.find(s => s.id === shootId);
      if (!shoot) return;
      const oldStatus = shoot.type_statuses[typeName];
      const updatedTS = { ...shoot.type_statuses, [typeName]: newStatus };
      const overallStatus = STATUS_ORDER[Math.min(...Object.values(updatedTS).map(st => STATUS_ORDER.indexOf(st)))];
      await supabase.from('shoots').update({ type_statuses: updatedTS, status: overallStatus }).eq('id', shootId);
      await logStatusChange(shootId, typeName, oldStatus, newStatus);
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
            <div class="shoot-title">${s.client || 'No function'}</div>
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
