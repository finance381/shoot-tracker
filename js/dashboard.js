import { supabase } from './supabase.js';
import { getMember } from './auth.js';
import { withTimeout } from './app.js';
import { openDayDetail } from './calendar.js';

const container = () => document.getElementById('page-dashboard');
let renderGen = 0;

export async function render() {
  const myGen = ++renderGen;
  const el = container();
  if (!el.querySelector('.stats-grid')) {
    el.innerHTML = '<div class="page-loader"><div class="skeleton-grid"><div class="skeleton-card stat"></div><div class="skeleton-card stat"></div><div class="skeleton-card stat"></div><div class="skeleton-card stat"></div></div><div class="skeleton-card"></div><div class="skeleton-card"></div></div>';
  }
  const today = new Date().toISOString().slice(0, 10);
  const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const [shootsRes, teamRes] = await Promise.all([
    supabase.from('shoots').select('*'),
    supabase.from('team_members').select('id, name')
  ]);

  if (myGen !== renderGen && el.querySelector('.stats-grid')) return;

  const shoots = shootsRes.data || [];
  const team = teamRes.data || [];

  const thisWeek = shoots.filter(s => s.date >= today && s.date <= weekEnd);
  const pendingShoots = shoots.filter(s => s.status !== 'Posted');
  let pendingItems = 0;
  shoots.forEach(s => {
    const ts = s.type_statuses || {};
    Object.values(ts).forEach(st => { if (st !== 'Posted') pendingItems++; });
  });
  const posted   = shoots.filter(s => s.status === 'Posted');
  const postedByType = { Photo: 0, Reel: 0, 'Sales Video': 0 };
  shoots.forEach(s => {
    const ts = s.type_statuses || {};
    Object.entries(ts).forEach(([t, st]) => {
      if (st === 'Posted' && t in postedByType) postedByType[t]++;
    });
  });
  const upcoming = shoots
    .filter(s => s.date >= today && s.status !== 'Posted')
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''))
    .slice(0, 5);

  const me = getMember();
  const assigneeName = (id) => team.find(t => t.id === id)?.name || '—';
  const getAssignee = (s) => s.external_assignee ? '📷 ' + s.external_assignee : assigneeName(s.assignee_id);

  const renderLocation = (s) => {
    if (s.location_type === 'outdoor') return s.outdoor_venue || 'Outdoor';
    return s.location || '';
  };

  const renderTags = (s) => {
    let tags = '';
    const ts = s.type_statuses || {};
    if (Object.keys(ts).length > 0) {
      tags += Object.entries(ts).map(([t, st]) =>
        `<span class="tag tag-type status-${st}">${t} <small style="opacity:.7">${st}</small></span>`
      ).join('');
    } else if (s.type) {
      tags += s.type.split(',').map(t => `<span class="tag tag-type">${t.trim()}</span>`).join('');
    }
    if (s.departments?.length) tags += s.departments.map(d => `<span class="tag tag-dept">${d}</span>`).join('');
    if (s.is_impromptu) tags += '<span class="tag tag-impromptu">Impromptu</span>';
    if (s.location_type === 'outdoor') tags += '<span class="tag tag-outdoor">Outdoor</span>';
    return tags ? `<div class="tag-row">${tags}</div>` : '';
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const now = new Date();
  const todayLabel = now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', weekday: 'short' });

  el.innerHTML = `
    <div class="greet-row">
      <div>
        <h1 class="greet-title">${greeting}, ${me?.name || 'there'}</h1>
        <p class="greet-sub">Here's what's happening with your shoots today.</p>
      </div>
      <span class="date-pill"><svg class="date-pill-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> ${todayLabel}</span>
    </div>

    <div class="stats-grid">
      <div class="stat-card stat-clickable" data-action="this-week">
        <div class="stat-icon stat-icon-rose"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>
        <div class="stat-body">
          <div class="stat-value">${thisWeek.length}</div>
          <div class="stat-label">This week</div>
        </div>
      </div>
      <div class="stat-card stat-clickable" data-action="pending">
        <div class="stat-icon stat-icon-amber"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg></div>
        <div class="stat-body">
          <div class="stat-value">${pendingItems}</div>
          <div class="stat-label">Pending post</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon stat-icon-sage"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></div>
        <div class="stat-body">
          <div class="stat-value">${postedByType['Photo']}</div>
          <div class="stat-label">Photos posted</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon stat-icon-plum"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="18" rx="2"/><line x1="7" y1="3" x2="7" y2="21"/><line x1="17" y1="3" x2="17" y2="21"/><line x1="2" y1="8" x2="7" y2="8"/><line x1="2" y1="16" x2="7" y2="16"/><line x1="17" y1="8" x2="22" y2="8"/><line x1="17" y1="16" x2="22" y2="16"/></svg></div>
        <div class="stat-body">
          <div class="stat-value">${postedByType['Reel']}</div>
          <div class="stat-label">Reels posted</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon stat-icon-blue"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="14" height="14" rx="2"/><path d="M16 10l6-3v10l-6-3z"/></svg></div>
        <div class="stat-body">
          <div class="stat-value">${postedByType['Sales Video']}</div>
          <div class="stat-label">Videos posted</div>
        </div>
      </div>
      <div class="stat-card stat-clickable" data-action="all">
        <div class="stat-icon stat-icon-terracotta"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg></div>
        <div class="stat-body">
          <div class="stat-value">${shoots.length}</div>
          <div class="stat-label">All shoots</div>
        </div>
      </div>
    </div>

    <div class="dash-columns">
      <div class="dash-main">
        <div class="section-title-row">
          <p class="section-title" style="margin-bottom:0">Upcoming shoots</p>
          <button class="view-link-btn" id="view-calendar-btn">📅 View Calendar</button>
        </div>
        ${upcoming.length === 0
          ? '<div class="empty-state"><div class="emoji">🎯</div>No upcoming shoots</div>'
          : upcoming.map(s => `
            <div class="shoot-card ${me && s.assignee_id === me.id ? 'shoot-mine' : ''} border-${s.status}" data-id="${s.id}">
              <div class="shoot-info">
                <div class="shoot-card-top">
                  <div>
                    <div class="shoot-title">${s.client || 'No function'}</div>
                    <div class="shoot-meta">${s.date}${s.time ? ' at ' + fmtTime(s.time) : ''}${renderLocation(s) ? ' · ' + renderLocation(s) : ''}</div>
                  </div>
                  <span class="shoot-assignee">${getAssignee(s)}</span>
                </div>
                ${renderTags(s)}
              </div>
            </div>
          `).join('')}
        ${upcoming.length > 0 ? `<button class="view-all-link" id="view-all-shoots-btn">View All Upcoming Shoots ⌄</button>` : ''}
      </div>

      <div class="dash-side home-mini-cal">
        <div class="mini-cal-card" id="mini-cal-card">
          <p class="section-title" style="margin-bottom:10px">Calendar</p>
          ${renderMiniCalendar(shoots, now)}
        </div>
      </div>
    </div>
  `;

  // Clickable stat cards — navigate to shoots with filters
  el.querySelectorAll('.stat-clickable').forEach(card => {
    card.addEventListener('click', () => {
      const action = card.dataset.action;
      let filters = {};

      if (action === 'this-week') {
        filters = { dateFrom: today, dateTo: weekEnd };
      } else if (action === 'pending') {
        filters = { status: '__not_posted' };
      }
      // 'all' = no filters

      window.dispatchEvent(new CustomEvent('navigate-shoots', { detail: filters }));
    });
  });

  // Shoot card clicks — fetch fresh data
  el.querySelectorAll('.shoot-card[data-id]').forEach(card => {
    card.addEventListener('click', async () => {
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
        window.dispatchEvent(new CustomEvent('toast', { detail: 'Could not load shoot' }));
      } finally {
        card.dataset.loading = '';
        card.style.opacity = '';
      }
    });
  });

  // "View Calendar" / "View All Upcoming Shoots" — forward to existing nav tabs
  el.querySelector('#view-calendar-btn')?.addEventListener('click', () => {
    document.querySelector('.nav-tab[data-page="calendar"]')?.click();
  });
  el.querySelector('#view-all-shoots-btn')?.addEventListener('click', () => {
    document.querySelector('.nav-tab[data-page="shoots"]')?.click();
  });

  // Mini calendar day cells — open the day-detail sheet in place, stay on Home
  el.querySelectorAll('.mini-cal-cell[data-date]').forEach(cell => {
    cell.addEventListener('click', () => {
      const date = cell.dataset.date;
      if (!date) return;
      const dayShoots = shoots.filter(s => s.date === date);
      openDayDetail(date, dayShoots, team);
    });
  });
}

function renderMiniCalendar(shoots, now) {
  const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthLabel = now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDay = (new Date(year, month, 1).getDay() + 6) % 7;
  const todayStr = now.toISOString().slice(0, 10);

  let cells = '';
  for (let i = 0; i < startDay; i++) cells += '<div class="cal-cell empty"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayShoots = shoots.filter(s => s.date === dateStr);
    const isToday = dateStr === todayStr ? ' today' : '';
    const dots = dayShoots.slice(0, 3).map(s => `<div class="cal-dot dot-${s.status}"></div>`).join('');
    cells += `<div class="cal-cell mini-cal-cell${isToday}" data-date="${dateStr}"><span class="cal-date">${d}</span><div class="cal-dots">${dots}</div></div>`;
  }

  return `
    <div class="cal-month-label" style="font-size:14px;margin-bottom:10px">${monthLabel}</div>
    <div class="cal-grid mini-cal-grid">
      ${DAYS.map(d => `<div class="cal-day-header">${d}</div>`).join('')}
      ${cells}
    </div>
  `;
}

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hr = parseInt(h);
  return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
}
