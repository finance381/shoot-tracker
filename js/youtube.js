import { supabase } from './supabase.js';
import { getMember, isAdmin } from './auth.js';

const container = () => document.getElementById('page-youtube');

const SALES_VIDEO = 'Sales Video';
const STATUS_LABEL = { Planned: 'Planned', Shot: 'Shot', edited: 'Edited', Posted: 'Posted' };
const DEPARTMENTS = ['Decor', 'Catering', 'Entertainment', 'Venue'];

// One list of states, shown in full by the dropdown and as quick tabs for the
// three headline ones. A sales video that is "Posted" in the edit pipeline is
// exactly what "Ready to post" means here.
const FILTERS = [
  { key: 'all',     label: 'All Status',    tab: 'All' },
  { key: 'Planned', label: 'Planned' },
  { key: 'Shot',    label: 'Shot' },
  { key: 'edited',  label: 'Edited' },
  { key: 'ready',   label: 'Ready to post', tab: 'Ready to post' },
  { key: 'posted',  label: 'On YouTube',    tab: 'On YouTube' }
];
const PIPELINE_KEYS = ['Planned', 'Shot', 'edited'];

const VIDEO_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>';

let rows = [];
let teamCache = [];
let venueCache = [];

// The tabs and the status dropdown are independent: changing one must never
// move the other. They simply narrow the list together.
let ytView = 'all';
let filterStatus = 'all';
let filterSearch = '';
let filterVenues = [];
let filterDepts = [];
let filterDateFrom = '';
let filterDateTo = '';
let venueDropdownOpen = false;
let deptDropdownOpen = false;
let outsideClickBound = false;
let renderGen = 0;

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

function youtubeId(url) {
  if (!url) return '';
  const m = String(url).match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/
  );
  return m ? m[1] : '';
}

function fmtWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
       + ' · ' + d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function fmtShootDate(d) {
  if (!d) return '';
  const x = new Date(d + 'T00:00:00');
  return isNaN(x) ? d : x.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function renderLocation(s) {
  if (s.location_type === 'outdoor') return s.outdoor_venue || 'Outdoor';
  return s.location || '';
}

const memberName = (id) => teamCache.find(t => t.id === id)?.name || '';

// Only people who can open this tab could have posted a video.
const canPostToYouTube = (m) =>
  m?.is_admin === true || (Array.isArray(m?.tab_access) && m.tab_access.includes('youtube'));

export function classifyRows(shoots, byShoot) {
  return (shoots || [])
    .filter(s => s.type_statuses && SALES_VIDEO in s.type_statuses)
    .map(s => {
      const rec = byShoot[s.id] || null;
      const videoStatus = s.type_statuses[SALES_VIDEO];
      const onYouTube = !!rec?.posted_at;
      return { shoot: s, rec, videoStatus, onYouTube, ready: videoStatus === 'Posted' && !onYouTube };
    });
}

const venueLabel = (v) => v.length === 0 ? 'All Venues'
  : v.length === 1 ? (v[0] === '__outdoor' ? 'Outdoor' : v[0]) : `${v.length} Venues`;
const deptLabel = (d) => d.length === 0 ? 'All Departments'
  : d.length === 1 ? d[0] : `${d.length} Departments`;

function bindOutsideClick() {
  if (outsideClickBound) return;
  outsideClickBound = true;
  document.addEventListener('click', (e) => {
    if (!container()?.classList.contains('active')) return;
    let changed = false;
    if (venueDropdownOpen && !e.target.closest('.venue-multiselect:not(.dept-multiselect)')) {
      venueDropdownOpen = false; changed = true;
    }
    if (deptDropdownOpen && !e.target.closest('.dept-multiselect')) {
      deptDropdownOpen = false; changed = true;
    }
    if (changed) render();
  });
}

export async function render() {
  const myGen = ++renderGen;
  const el = container();
  if (!el.querySelector('.shoots-filter-row')) {
    el.innerHTML = '<div class="page-loader"><div class="skeleton-card short"></div><div class="skeleton-card"></div><div class="skeleton-card"></div></div>';
  }

  const [shootsRes, vidsRes, teamRes, mastersRes] = await Promise.all([
    supabase.from('shoots')
      .select('id, client, date, time, type_statuses, location, location_type, outdoor_venue, departments')
      .order('date', { ascending: false }),
    supabase.from('youtube_videos').select('*'),
    supabase.from('team_members').select('id, name, is_admin, tab_access'),
    supabase.from('masters').select('*').eq('type', 'location').order('sort_order')
  ]);

  if (myGen !== renderGen && el.querySelector('.shoots-filter-row')) return;

  if (vidsRes.error) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="emoji">📺</div>
        <p style="font-weight:700;margin-bottom:6px">YouTube table not set up yet</p>
        <p style="font-size:13px;color:var(--stone);max-width:430px;margin:0 auto">
          Run <code>supabase/sql/youtube_videos.sql</code> in the Supabase SQL editor, then reload.
        </p>
        <p style="font-size:12px;color:var(--stone);margin-top:10px">${esc(vidsRes.error.message)}</p>
      </div>`;
    return;
  }

  teamCache = teamRes.data || [];
  venueCache = (mastersRes.data || []).map(m => m.label);

  const byShoot = {};
  (vidsRes.data || []).forEach(v => { if (v.shoot_id) byShoot[v.shoot_id] = v; });
  rows = classifyRows(shootsRes.data, byShoot);

  const q = filterSearch.toLowerCase();
  const list = rows.filter(r => {
    const s = r.shoot;
    // tab
    if (ytView === 'ready'  && !r.ready) return false;
    if (ytView === 'posted' && !r.onYouTube) return false;
    // status dropdown
    if (filterStatus === 'ready'  && !r.ready) return false;
    if (filterStatus === 'posted' && !r.onYouTube) return false;
    if (PIPELINE_KEYS.includes(filterStatus) && r.videoStatus !== filterStatus) return false;
    if (filterVenues.length > 0) {
      const ok = filterVenues.some(v => v === '__outdoor'
        ? s.location_type === 'outdoor'
        : s.location_type !== 'outdoor' && s.location === v);
      if (!ok) return false;
    }
    if (filterDepts.length > 0) {
      const sd = (s.departments || []).map(d => String(d).toLowerCase());
      if (!filterDepts.some(d => sd.includes(d.toLowerCase()))) return false;
    }
    if (filterDateFrom && s.date < filterDateFrom) return false;
    if (filterDateTo && s.date > filterDateTo) return false;
    if (q) {
      const hay = [s.client, renderLocation(s), r.videoStatus, memberName(r.rec?.posted_by), r.rec?.notes]
        .filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const counts = {
    all:    rows.length,
    ready:  rows.filter(r => r.ready).length,
    posted: rows.filter(r => r.onYouTube).length
  };
  const tabs = FILTERS.filter(f => f.tab);
  // The view toggle is a view, not a filter — same as Shoots' All/Upcoming/Past.
  const activeFilterCount = [
    filterStatus !== 'all', filterVenues.length > 0, filterDepts.length > 0,
    filterDateFrom || filterDateTo, filterSearch
  ].filter(Boolean).length;

  el.innerHTML = `
    <div class="shoots-filter-row">
      <div class="search-bar-wrap">
        <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" id="yt-search" class="shoot-search" placeholder="Search function, venue, person…" value="${esc(filterSearch)}">
      </div>
      <select id="yt-filter-status" class="filter-select">
        ${FILTERS.map(f => `<option value="${f.key}" ${filterStatus === f.key ? 'selected' : ''}>${f.label}</option>`).join('')}
      </select>
      <div class="venue-multiselect">
        <button type="button" id="yt-venue-btn" class="filter-select venue-select-btn">
          <span class="venue-select-label">${esc(venueLabel(filterVenues))}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        ${venueDropdownOpen ? `
          <div class="venue-dropdown-panel">
            ${venueCache.map(v => `
              <label class="venue-option">
                <input type="checkbox" value="${esc(v)}" ${filterVenues.includes(v) ? 'checked' : ''}>
                <span>${esc(v)}</span>
              </label>`).join('')}
            <label class="venue-option">
              <input type="checkbox" value="__outdoor" ${filterVenues.includes('__outdoor') ? 'checked' : ''}>
              <span>Outdoor</span>
            </label>
            ${filterVenues.length > 0 ? '<button type="button" class="venue-clear-btn" id="yt-venue-clear">Clear selection</button>' : ''}
          </div>` : ''}
      </div>
      <div class="venue-multiselect dept-multiselect">
        <button type="button" id="yt-dept-btn" class="filter-select venue-select-btn">
          <span class="venue-select-label">${esc(deptLabel(filterDepts))}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        ${deptDropdownOpen ? `
          <div class="venue-dropdown-panel">
            ${DEPARTMENTS.map(d => `
              <label class="venue-option">
                <input type="checkbox" value="${d}" ${filterDepts.includes(d) ? 'checked' : ''}>
                <span>${d}</span>
              </label>`).join('')}
            ${filterDepts.length > 0 ? '<button type="button" class="venue-clear-btn" id="yt-dept-clear">Clear selection</button>' : ''}
          </div>` : ''}
      </div>
      <div class="filter-date-field">
        <label>From</label>
        <input type="date" id="yt-date-from" class="filter-date" value="${filterDateFrom}">
      </div>
      <div class="filter-date-field">
        <label>To</label>
        <input type="date" id="yt-date-to" class="filter-date" value="${filterDateTo}">
      </div>
      <button type="button" id="yt-clear-filters" class="filter-funnel-btn ${activeFilterCount > 0 ? 'has-active' : ''}" title="${activeFilterCount > 0 ? 'Clear filters' : 'Filters'}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
        ${activeFilterCount > 0 ? `<span class="filter-funnel-badge">${activeFilterCount}</span>` : ''}
      </button>
    </div>

    <div class="time-toggle">
      ${tabs.map(f => `
        <button class="time-toggle-btn ${ytView === f.key ? 'active' : ''}" data-view="${f.key}">
          ${f.tab} <span class="yt-view-count">${counts[f.key]}</span>
        </button>`).join('')}
    </div>

    ${list.length === 0 ? `
      <div class="empty-state">
        <div class="emoji">📺</div>
        ${ytView === 'ready' ? 'Nothing waiting — everything edited is already on YouTube'
          : ytView === 'posted' ? 'Nothing posted to YouTube yet'
          : 'Nothing matches these filters'}
      </div>` : list.map(r => renderCard(r)).join('')}
  `;

  bindHandlers(el);
}

function renderCard(r) {
  const s = r.shoot, rec = r.rec;
  const loc = renderLocation(s);
  const by = memberName(rec?.posted_by);
  const vid = youtubeId(rec?.url);

  return `
    <div class="shoot-card border-${r.onYouTube ? 'Posted' : r.videoStatus}" data-sid="${s.id}">
      <div class="shoot-info">
        <div class="shoot-card-top">
          <div class="shoot-title-row">
            <span class="shoot-title">${esc(s.client || 'No function')}</span>
            <span class="shoot-meta-inline"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${esc(fmtShootDate(s.date))}</span>
            ${loc ? `<span class="shoot-meta-sep">|</span><span class="shoot-meta-inline"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>${esc(loc)}</span>` : ''}
          </div>
          <div class="shoot-card-right">
            ${r.onYouTube
              ? '<span class="tag yt-tag-live">On YouTube</span>'
              : r.ready
                ? '<span class="tag yt-tag-ready">Ready to post</span>'
                : `<span class="tag yt-tag-wait">${STATUS_LABEL[r.videoStatus]}</span>`}
            ${vid ? `<a class="yt-open" href="${esc(rec.url)}" target="_blank" rel="noopener noreferrer" title="Open on YouTube">↗</a>` : ''}
          </div>
        </div>

        <div class="type-status-rows">
          <div class="type-status-row yt-status-row">
            <span class="type-icon-circle" style="background:var(--terracotta-soft);color:var(--terracotta)">${VIDEO_ICON}</span>
            <span class="type-name">Sales Video</span>
            <span class="yt-row-meta">
              <span class="yt-meta-item"><em>Posted on</em>${esc(fmtWhen(rec?.posted_at))}</span>
              <span class="yt-meta-item"><em>Posted by</em>${by ? esc(by) : '—'}</span>
            </span>
            ${r.onYouTube
              ? '<button type="button" class="btn-secondary yt-act" data-act="edit">Details</button>'
              : '<button type="button" class="btn-primary yt-act" data-act="post">Posted on YouTube</button>'}
          </div>
          ${rec?.notes ? `<div class="type-last-editor">${esc(rec.notes)}</div>` : ''}
        </div>
      </div>
    </div>`;
}

function bindHandlers(el) {
  let t;
  el.querySelector('#yt-search').addEventListener('input', (e) => {
    clearTimeout(t);
    t = setTimeout(() => { filterSearch = e.target.value.trim(); render(); }, 250);
  });
  // Dropdown and the toggle drive the same state, so they can never disagree.
  el.querySelector('#yt-filter-status').addEventListener('change', (e) => { filterStatus = e.target.value; render(); });
  el.querySelector('#yt-date-from').addEventListener('change', (e) => { filterDateFrom = e.target.value; render(); });
  el.querySelector('#yt-date-to').addEventListener('change', (e) => { filterDateTo = e.target.value; render(); });

  el.querySelector('#yt-venue-btn')?.addEventListener('click', (e) => {
    e.stopPropagation(); venueDropdownOpen = !venueDropdownOpen; render();
  });
  el.querySelectorAll('.venue-multiselect:not(.dept-multiselect) .venue-option input').forEach(cb => {
    cb.addEventListener('change', (e) => {
      filterVenues = e.target.checked
        ? [...filterVenues, e.target.value]
        : filterVenues.filter(v => v !== e.target.value);
      render();
    });
  });
  el.querySelector('#yt-venue-clear')?.addEventListener('click', (e) => { e.stopPropagation(); filterVenues = []; render(); });

  el.querySelector('#yt-dept-btn')?.addEventListener('click', (e) => {
    e.stopPropagation(); deptDropdownOpen = !deptDropdownOpen; render();
  });
  el.querySelectorAll('.dept-multiselect .venue-option input').forEach(cb => {
    cb.addEventListener('change', (e) => {
      filterDepts = e.target.checked
        ? [...filterDepts, e.target.value]
        : filterDepts.filter(d => d !== e.target.value);
      render();
    });
  });
  el.querySelector('#yt-dept-clear')?.addEventListener('click', (e) => { e.stopPropagation(); filterDepts = []; render(); });

  el.querySelector('#yt-clear-filters').addEventListener('click', () => {
    filterSearch = ''; filterStatus = 'all'; filterVenues = []; filterDepts = [];
    filterDateFrom = ''; filterDateTo = '';
    render();
  });

  el.querySelectorAll('.time-toggle-btn').forEach(b => {
    b.addEventListener('click', () => { ytView = b.dataset.view; render(); });
  });

  el.querySelectorAll('.shoot-card[data-sid]').forEach(card => {
    const r = rows.find(x => x.shoot.id === card.dataset.sid);
    card.querySelector('[data-act]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openPostModal(r, { markNow: e.target.dataset.act === 'post' });
    });
  });

  bindOutsideClick();
}

function openPostModal(r, { markNow }) {
  const me = getMember();
  const rec = r.rec;
  const s = r.shoot;

  const pad = (n) => String(n).padStart(2, '0');
  const toLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const postedValue = rec?.posted_at && !isNaN(new Date(rec.posted_at))
    ? toLocal(new Date(rec.posted_at)) : toLocal(new Date());
  const byValue = rec?.posted_by || me?.id || '';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="border-radius:20px 20px 0 0;">
      <div class="modal-header">
        <h2>${markNow ? 'Posted on YouTube' : 'YouTube details'}</h2>
        <button class="btn-icon" id="yt-x">✕</button>
      </div>
      <div class="modal-body">
        <div class="yt-modal-fn">
          <span class="yt-modal-fn-name">${esc(s.client || 'No function')}</span>
          <span class="yt-modal-fn-date">${esc(fmtShootDate(s.date))} · Sales Video</span>
        </div>
        <div class="form-group">
          <label>Posted on *</label>
          <input type="datetime-local" id="yt-m-when" value="${postedValue}">
        </div>
        <div class="form-group">
          <label>Posted by *</label>
          ${isAdmin() ? `
            <select id="yt-m-by">
              <option value="">Select person…</option>
              ${teamCache.filter(canPostToYouTube).map(t =>
                `<option value="${t.id}" ${byValue === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
            </select>` : `
            <input type="text" id="yt-m-by-display" value="${esc(memberName(byValue) || me?.name || '')}" disabled>
            <input type="hidden" id="yt-m-by" value="${esc(byValue)}">`}
        </div>
        <div class="form-group">
          <label>YouTube link</label>
          <input type="url" id="yt-m-url" value="${esc(rec?.url || '')}" placeholder="https://youtu.be/…">
        </div>
        <div class="form-group">
          <label>Notes</label>
          <textarea id="yt-m-notes" rows="2" placeholder="Optional">${esc(rec?.notes || '')}</textarea>
        </div>
        <div id="yt-m-err" class="auth-error hidden"></div>
      </div>
      <div class="modal-footer">
        ${rec?.posted_at ? '<button class="btn-danger" id="yt-m-undo">Unmark</button>' : ''}
        <span class="spacer"></span>
        <button class="btn-secondary" id="yt-m-cancel">Cancel</button>
        <button class="btn-primary" id="yt-m-save">${markNow ? 'Mark as posted' : 'Save'}</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('#yt-x').addEventListener('click', close);
  overlay.querySelector('#yt-m-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  const errEl = overlay.querySelector('#yt-m-err');
  const fail = (m) => { errEl.textContent = m; errEl.classList.remove('hidden'); };

  overlay.querySelector('#yt-m-save').addEventListener('click', async () => {
    const whenRaw = overlay.querySelector('#yt-m-when').value;
    const by = overlay.querySelector('#yt-m-by').value;
    const url = overlay.querySelector('#yt-m-url').value.trim();
    if (!whenRaw) return fail('Pick when it was posted');
    if (!by) return fail('Pick who posted it');
    if (url && !youtubeId(url)) return fail('That does not look like a YouTube link');

    const btn = overlay.querySelector('#yt-m-save');
    btn.disabled = true; btn.textContent = 'Saving…';

    const payload = {
      shoot_id: s.id,
      title: s.client || 'Sales Video',
      url: url || null,
      posted_at: new Date(whenRaw).toISOString(),
      posted_by: by,
      status: 'Live',
      notes: overlay.querySelector('#yt-m-notes').value.trim() || null,
      updated_at: new Date().toISOString()
    };

    const { error } = rec
      ? await supabase.from('youtube_videos').update(payload).eq('shoot_id', s.id)
      : await supabase.from('youtube_videos').insert(payload);

    if (error) {
      btn.disabled = false; btn.textContent = markNow ? 'Mark as posted' : 'Save';
      return fail(error.message);
    }
    close();
    window.dispatchEvent(new CustomEvent('toast', { detail: markNow ? 'Marked as posted on YouTube' : 'Saved' }));
    render();
  });

  overlay.querySelector('#yt-m-undo')?.addEventListener('click', async () => {
    if (!confirm('Unmark this video as posted on YouTube?')) return;
    const { error } = await supabase.from('youtube_videos').delete().eq('shoot_id', s.id);
    if (error) return fail(error.message);
    close();
    window.dispatchEvent(new CustomEvent('toast', { detail: 'Unmarked' }));
    render();
  });
}
