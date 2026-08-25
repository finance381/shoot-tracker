import { supabase } from './supabase.js';
import { getMember } from './auth.js';
import { withTimeout } from './app.js';

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

const STATUS_ORDER = ['Planned', 'Shot', 'edited', 'Posted'];
// Scoped to the Shoots page tracker only — reuses existing site tokens (blue/purple
// brand accent/terracotta/sage) rather than the amber/plum pair used elsewhere (Reports,
// donuts), per the redesign mockup's own status legend (Planned/Shot/Edited/Posted).
const STATUS_COLOR = { Planned: 'var(--blue)', Shot: 'var(--primary)', edited: 'var(--terracotta)', Posted: 'var(--sage)' };
const STATUS_LABEL = { Planned: 'Planned', Shot: 'Shot', edited: 'Edited', Posted: 'Posted' };

const TYPE_ICON_META = {
  Photo: { color: 'var(--blue)', bg: 'var(--blue-soft)', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>' },
  Reel: { color: 'var(--primary)', bg: 'var(--primary-soft)', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="2.5"/><circle cx="12" cy="5.5" r="1.3"/><circle cx="17.5" cy="8.5" r="1.3"/><circle cx="17.5" cy="15.5" r="1.3"/><circle cx="12" cy="18.5" r="1.3"/><circle cx="6.5" cy="15.5" r="1.3"/><circle cx="6.5" cy="8.5" r="1.3"/></svg>' },
  'Sales Video': { color: 'var(--terracotta)', bg: 'var(--terracotta-soft)', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>' }
};
const DEFAULT_TYPE_ICON = { color: 'var(--stone)', bg: 'var(--sand)', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/></svg>' };
const CHECK_ICON = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

function renderStepper(shootId, typeName, currentStatus) {
  const idx = STATUS_ORDER.indexOf(currentStatus);
  return `
    <div class="stepper" data-sid="${shootId}" data-type="${typeName}">
      ${STATUS_ORDER.map((st, i) => `
        ${i > 0 ? `<div class="stepper-line ${i <= idx ? 'is-done' : ''}" style="--seg-color:${STATUS_COLOR[st]}"></div>` : ''}
        <button type="button" class="stepper-node ${i < idx ? 'is-done' : i === idx ? 'is-current' : 'is-upcoming'}" style="--node-color:${STATUS_COLOR[st]}" data-to="${st}" title="${STATUS_LABEL[st]}">
          <span class="stepper-dot">${i < idx ? CHECK_ICON : ''}</span>
          <span class="stepper-label">${STATUS_LABEL[st].toUpperCase()}</span>
        </button>
      `).join('')}
    </div>
  `;
}

const DEPARTMENTS = ['Decor', 'Catering', 'Entertainment', 'Venue'];

let filterMember = 'All';
let filterStatus = 'All';
let filterVenues = [];
let filterDepts = [];
let filterDateFrom = '';
let filterDateTo = '';
let filterSearch = '';
let filterDateDir = 'all';
let venueDropdownOpen = false;
let venueOutsideClickBound = false;
let deptDropdownOpen = false;
let deptOutsideClickBound = false;
let teamCache = [];
let venueCache = [];
let renderGen = 0;

function saveFilters() {
  try { sessionStorage.setItem('st_filters', JSON.stringify({ filterMember, filterStatus, filterVenues, filterDepts, filterDateFrom, filterDateTo, filterSearch, filterDateDir })); } catch {}
}
function restoreFilters() {
  try {
    const saved = JSON.parse(sessionStorage.getItem('st_filters'));
    if (!saved) return;
    filterMember = saved.filterMember || 'All';
    filterStatus = saved.filterStatus || 'All';
    filterVenues = Array.isArray(saved.filterVenues) ? saved.filterVenues : [];
    filterDepts = Array.isArray(saved.filterDepts) ? saved.filterDepts : [];
    filterDateFrom = saved.filterDateFrom || '';
    filterDateTo = saved.filterDateTo || '';
    filterSearch = saved.filterSearch || '';
    filterDateDir = ['all', 'upcoming', 'past'].includes(saved.filterDateDir) ? saved.filterDateDir : 'all';
  } catch {}
}
restoreFilters();

const container = () => document.getElementById('page-shoots');

// Allow external filter setting (from dashboard clicks)
export function setFilters(filters = {}) {
  if (filters.member !== undefined) filterMember = filters.member;
  if (filters.status !== undefined) filterStatus = filters.status;
  if (filters.venue !== undefined) filterVenues = Array.isArray(filters.venue) ? filters.venue : [filters.venue];
  if (filters.dateFrom !== undefined) filterDateFrom = filters.dateFrom;
  if (filters.dateTo !== undefined) filterDateTo = filters.dateTo;
  if (filters.search !== undefined) filterSearch = filters.search;
  saveFilters();
}

export function resetFilters() {
  filterMember = 'All';
  filterStatus = 'All';
  filterVenues = [];
  filterDepts = [];
  filterDateFrom = '';
  filterDateTo = '';
  filterSearch = '';
  filterDateDir = 'all';
  saveFilters();
}

export async function render() {
  saveFilters();
  const myGen = ++renderGen;
  const el = container();
  if (!el.querySelector('.shoots-filter-row')) {
    el.innerHTML = '<div class="page-loader"><div class="skeleton-card short"></div><div class="skeleton-card short"></div><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div></div>';
  }

  const [shootsRes, teamRes, mastersRes] = await Promise.all([
    supabase.from('shoots').select('*').order('date', { ascending: true }).order('time', { ascending: true, nullsFirst: false }).order('id', { ascending: true }),
    supabase.from('team_members').select('id, name, role'),
    supabase.from('masters').select('*').eq('type', 'location').order('sort_order')
  ]);

  // Only bail if a NEWER render has started AND completed data fetch
  if (myGen !== renderGen && el.querySelector('.shoots-filter-row')) return;

  const shoots = shootsRes.data || [];
  teamCache = teamRes.data || [];
  venueCache = (mastersRes.data || []).map(m => m.label);
  const me = getMember();

  const filtered = shoots.filter(s => {
    if (filterMember !== 'All' && s.assignee_id !== filterMember) return false;
    if (filterStatus === '__not_posted') {
      if (s.status === 'Posted') return false;
    } else if (filterStatus !== 'All') {
      const ts = s.type_statuses || {};
      const statuses = Object.keys(ts).length > 0 ? Object.values(ts) : [s.status];
      if (!statuses.includes(filterStatus)) return false;
    }
    if (filterVenues.length > 0) {
      const matches = filterVenues.some(v => v === '__outdoor'
        ? s.location_type === 'outdoor'
        : s.location_type !== 'outdoor' && s.location === v);
      if (!matches) return false;
    }
    if (filterDepts.length > 0) {
      const sDepts = (s.departments || []).map(d => String(d).toLowerCase());
      if (!filterDepts.some(d => sDepts.includes(d.toLowerCase()))) return false;
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
    filterVenues.length > 0,
    filterDepts.length > 0,
    filterDateFrom || filterDateTo,
    filterSearch
  ].filter(Boolean).length;

  el.innerHTML = `
    <div class="shoots-filter-row">
      <div class="search-bar-wrap">
        <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" id="shoot-search" class="shoot-search" placeholder="Search function, assignee, venue…" value="${filterSearch}">
      </div>
      <select id="filter-assignee" class="filter-select">
        <option value="All" ${filterMember === 'All' ? 'selected' : ''}>All Assignees</option>
        ${teamCache.filter(m => m.role === 'Photographer').map(m => `<option value="${m.id}" ${filterMember === m.id ? 'selected' : ''}>${m.name}</option>`).join('')}
      </select>
      <select id="filter-status" class="filter-select">
        <option value="All" ${filterStatus === 'All' ? 'selected' : ''}>All Status</option>
        ${STATUS_ORDER.map(s => `<option value="${s}" ${filterStatus === s ? 'selected' : ''}>${STATUS_LABEL[s]}</option>`).join('')}
      </select>
      <div class="venue-multiselect">
        <button type="button" id="filter-venue-btn" class="filter-select venue-select-btn">
          <span class="venue-select-label">${venueFilterLabel(filterVenues)}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        ${venueDropdownOpen ? `
          <div class="venue-dropdown-panel">
            ${venueCache.map(v => `
              <label class="venue-option">
                <input type="checkbox" value="${v}" ${filterVenues.includes(v) ? 'checked' : ''}>
                <span>${v}</span>
              </label>
            `).join('')}
            <label class="venue-option">
              <input type="checkbox" value="__outdoor" ${filterVenues.includes('__outdoor') ? 'checked' : ''}>
              <span>Outdoor</span>
            </label>
            ${filterVenues.length > 0 ? '<button type="button" class="venue-clear-btn" id="venue-clear-btn">Clear selection</button>' : ''}
          </div>
        ` : ''}
      </div>
      <div class="venue-multiselect dept-multiselect">
        <button type="button" id="filter-dept-btn" class="filter-select venue-select-btn">
          <span class="venue-select-label">${deptFilterLabel(filterDepts)}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        ${deptDropdownOpen ? `
          <div class="venue-dropdown-panel">
            ${DEPARTMENTS.map(d => `
              <label class="venue-option">
                <input type="checkbox" value="${d}" ${filterDepts.includes(d) ? 'checked' : ''}>
                <span>${d}</span>
              </label>
            `).join('')}
            ${filterDepts.length > 0 ? '<button type="button" class="venue-clear-btn" id="dept-clear-btn">Clear selection</button>' : ''}
          </div>
        ` : ''}
      </div>
      <div class="filter-date-field">
        <label>From</label>
        <input type="date" id="filter-date-from" class="filter-date" value="${filterDateFrom}">
      </div>
      <div class="filter-date-field">
        <label>To</label>
        <input type="date" id="filter-date-to" class="filter-date" value="${filterDateTo}">
      </div>
      <button type="button" id="clear-filters" class="filter-funnel-btn ${activeFilterCount > 0 ? 'has-active' : ''}" title="${activeFilterCount > 0 ? `Clear ${activeFilterCount} filter${activeFilterCount === 1 ? '' : 's'}` : 'Filters'}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
        ${activeFilterCount > 0 ? `<span class="filter-funnel-badge">${activeFilterCount}</span>` : ''}
      </button>
    </div>
    <div class="time-toggle">
      <button class="time-toggle-btn ${filterDateDir === 'all' ? 'active' : ''}" data-dir="all">All</button>
      <button class="time-toggle-btn ${filterDateDir === 'upcoming' ? 'active' : ''}" data-dir="upcoming">Upcoming</button>
      <button class="time-toggle-btn ${filterDateDir === 'past' ? 'active' : ''}" data-dir="past">Past</button>
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
  el.querySelector('#filter-venue-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    venueDropdownOpen = !venueDropdownOpen;
    render();
  });
  el.querySelectorAll('.venue-multiselect:not(.dept-multiselect) .venue-option input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const val = e.target.value;
      filterVenues = e.target.checked
        ? [...filterVenues, val]
        : filterVenues.filter(v => v !== val);
      render();
    });
  });
  el.querySelector('#venue-clear-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    filterVenues = [];
    render();
  });
  bindVenueOutsideClick();
  el.querySelector('#filter-dept-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    deptDropdownOpen = !deptDropdownOpen;
    render();
  });
  el.querySelectorAll('.dept-multiselect .venue-option input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const val = e.target.value;
      filterDepts = e.target.checked
        ? [...filterDepts, val]
        : filterDepts.filter(d => d !== val);
      render();
    });
  });
  el.querySelector('#dept-clear-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    filterDepts = [];
    render();
  });
  bindDeptOutsideClick();
  el.querySelector('#filter-date-from').addEventListener('change', (e) => { filterDateFrom = e.target.value; render(); });
  el.querySelector('#filter-date-to').addEventListener('change', (e) => { filterDateTo = e.target.value; render(); });
  el.querySelector('#clear-filters')?.addEventListener('click', () => { resetFilters(); render(); });
  el.querySelectorAll('.time-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => { filterDateDir = btn.dataset.dir; render(); });
  });

  renderDateGrouped(el.querySelector('#shoots-content'), filtered, shoots, me);
}

function venueFilterLabel(venues) {
  if (venues.length === 0) return 'All Venues';
  if (venues.length === 1) return venues[0] === '__outdoor' ? 'Outdoor' : venues[0];
  return `${venues.length} Venues`;
}

function deptFilterLabel(depts) {
  if (depts.length === 0) return 'All Departments';
  if (depts.length === 1) return depts[0];
  return `${depts.length} Departments`;
}

function bindVenueOutsideClick() {
  if (venueOutsideClickBound) return;
  venueOutsideClickBound = true;
  document.addEventListener('click', (e) => {
    if (!venueDropdownOpen) return;
    if (e.target.closest('.venue-multiselect:not(.dept-multiselect)')) return;
    venueDropdownOpen = false;
    render();
  });
}

function bindDeptOutsideClick() {
  if (deptOutsideClickBound) return;
  deptOutsideClickBound = true;
  document.addEventListener('click', (e) => {
    if (!deptDropdownOpen) return;
    if (e.target.closest('.dept-multiselect')) return;
    deptDropdownOpen = false;
    render();
  });
}

function computeDeptStatusSummary(shoots) {
  const counts = {};
  DEPARTMENTS.forEach(d => { counts[d] = { total: 0, Planned: 0, Shot: 0, edited: 0, Posted: 0 }; });
  shoots.forEach(s => {
    const depts = (s.departments || []).map(raw => DEPARTMENTS.find(d => d.toLowerCase() === String(raw).toLowerCase())).filter(Boolean);
    const overall = getOverallStatus(s);
    depts.forEach(d => {
      counts[d].total++;
      if (counts[d][overall] !== undefined) counts[d][overall]++;
    });
  });
  return counts;
}

function renderDeptSummary(counts) {
  const relevant = DEPARTMENTS.filter(d => counts[d].total > 0 && (filterDepts.length === 0 || filterDepts.includes(d)));
  if (relevant.length === 0) return '';
  return `
    <div class="dept-summary-row">
      ${relevant.map(d => {
        const c = counts[d];
        return `
          <div class="dept-summary-card">
            <div class="dept-summary-head">
              <span class="dept-summary-name">${d}</span>
              <span class="dept-summary-total">${c.total} shoot${c.total === 1 ? '' : 's'}</span>
            </div>
            <div class="dept-summary-breakdown">
              ${STATUS_ORDER.map(st => `
                <span class="dept-summary-stat"><span class="dept-summary-dot" style="background:${STATUS_COLOR[st]}"></span>${c[st]} ${STATUS_LABEL[st]}</span>
              `).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
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
  Object.keys(grouped).forEach(d => {
    grouped[d].sort((a, b) => {
      const ta = a.time || '99:99';
      const tb = b.time || '99:99';
      if (ta !== tb) return ta.localeCompare(tb);
      return (a.id || '').localeCompare(b.id || '');
    });
  });
  const sortedDates = Object.keys(grouped).sort();
  const today = new Date().toISOString().slice(0, 10);
  const upcomingDates = sortedDates.filter(d => d >= today);
  const pastDates = sortedDates.filter(d => d < today).reverse();

  if (filtered.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="emoji">📸</div>No shoots found</div>';
    return;
  }

  const dates = filterDateDir === 'past' ? pastDates
    : filterDateDir === 'upcoming' ? upcomingDates
    : sortedDates.slice().reverse();

  if (dates.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="emoji">📸</div>No shoots found</div>';
    return;
  }

  const visibleShoots = dates.flatMap(d => grouped[d]);
  el.innerHTML = renderDeptSummary(computeDeptStatusSummary(visibleShoots)) + renderDateGroups(dates, grouped, me);

  el.querySelectorAll('.shoot-card[data-id]').forEach(card => {
    card.addEventListener('click', async (e) => {
      if (e.target.closest('.type-status-row')) return;
      if (card.dataset.loading) return;
      card.dataset.loading = 'true';
      card.style.opacity = '0.6';
      try {
        const { data: shoot } = await withTimeout(supabase
          .from('shoots')
          .select('*')
          .eq('id', card.dataset.id)
          .maybeSingle());
        if (shoot) window.dispatchEvent(new CustomEvent('open-shoot', { detail: shoot }));
      } catch (err) {
        console.error('Failed to load shoot:', err);
        window.dispatchEvent(new CustomEvent('toast', { detail: 'Could not load shoot' }));
      } finally {
        card.dataset.loading = '';
        card.style.opacity = '';
      }
    });
  });

  // Stepper nodes — click any status stage to jump directly to it
  el.querySelectorAll('.stepper-node').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const stepper = btn.closest('.stepper');
      const shootId = stepper.dataset.sid;
      const typeName = stepper.dataset.type;
      const newStatus = btn.dataset.to;
      const shoot = allShoots.find(s => s.id === shootId);
      if (!shoot) return;
      const oldStatus = shoot.type_statuses[typeName];
      if (oldStatus === newStatus) return;

      stepper.querySelectorAll('.stepper-node').forEach(b => b.disabled = true);
      const updatedTS = { ...shoot.type_statuses, [typeName]: newStatus };
      const overallStatus = STATUS_ORDER[Math.min(...Object.values(updatedTS).map(st => STATUS_ORDER.indexOf(st)))];

      const { data: updated } = await supabase.from('shoots').update({
        type_statuses: updatedTS, status: overallStatus
      }).eq('id', shootId).select().single();

      await logStatusChange(shootId, typeName, oldStatus, newStatus);

      if (updated) {
        const teamMember = teamCache.find(t => t.id === updated.assignee_id);
        updated.assignee_name = teamMember?.name || '';
        import('./sheets-sync.js').then(({ syncShoot }) => syncShoot(updated, 'upsert'));
      }

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
          <div class="shoot-title-row">
            <span class="shoot-title">${s.client || 'No function'}</span>
            ${s.time ? `<span class="shoot-meta-inline"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${fmtTime(s.time)}</span>` : ''}
            ${loc ? `<span class="shoot-meta-sep">|</span><span class="shoot-meta-inline"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>${loc}</span>` : ''}
          </div>
          <div class="shoot-card-right">
            <span class="shoot-assignee">${s.external_assignee ? '' : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>'}${getAssigneeName(s)}</span>
            ${s.is_impromptu ? '<span class="tag tag-impromptu">Impromptu</span>' : ''}
            <span class="shoot-card-menu-btn" title="Open shoot">⋮</span>
          </div>
        </div>
        ${types.length > 0 ? `
          <div class="type-status-rows">
            ${types.map(t => {
              const tStatus = ts[t];
              const iconMeta = TYPE_ICON_META[t] || DEFAULT_TYPE_ICON;
              return `
                <div class="type-status-row">
                  <span class="type-icon-circle" style="background:${iconMeta.bg};color:${iconMeta.color}">${iconMeta.icon}</span>
                  <span class="type-name">${t}</span>
                  ${renderStepper(s.id, t, tStatus)}
                  <span class="type-current-label status-${tStatus}">${STATUS_LABEL[tStatus]}</span>
                </div>`;
            }).join('')}
          </div>
        ` : `
          <div class="type-status-rows">
            <div class="type-status-row">
              <span class="type-name">${s.type || '—'}</span>
              <span class="status-chip status-${s.status}">${STATUS_LABEL[s.status] || s.status}</span>
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
