import { supabase } from './supabase.js';
import { getMember } from './auth.js';

const STATUS_ORDER = ['Planned', 'Shot', 'edited', 'Posted'];
const REPORTS_MEMBER_FILTER_EXCLUDE = ['Pratik', 'Pratiksha', 'Harsh', 'Kanishk'];
let renderGen = 0;

// Default to current month
let dateFrom = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
let dateTo = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10);
let filterMemberId = 'All';
let showInactiveMembers = false;
let breakdownDeptFilter = '';
let breakdownTypeFilter = '';

const container = () => document.getElementById('page-reports');

function getPreviousPeriod(from, to) {
  const fromDate = new Date(from + 'T00:00:00');
  const toDate = new Date(to + 'T00:00:00');
  const durationMs = toDate - fromDate;
  const prevTo = new Date(fromDate.getTime() - 86400000);
  const prevFrom = new Date(prevTo.getTime() - durationMs);
  return { prevFrom: prevFrom.toISOString().slice(0, 10), prevTo: prevTo.toISOString().slice(0, 10) };
}

function trendBadge(current, previous) {
  if (!previous) return current > 0 ? `<span class="trend-badge trend-up">New</span>` : '';
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return `<span class="trend-badge trend-flat">No change</span>`;
  const cls = pct > 0 ? 'trend-up' : 'trend-down';
  const arrow = pct > 0 ? '↑' : '↓';
  return `<span class="trend-badge ${cls}">${arrow} ${Math.abs(pct)}% vs last period</span>`;
}

export async function render() {
  const myGen = ++renderGen;
  const el = container();
  if (!el) return;

  if (!el.querySelector('.reports-filters')) {
    el.innerHTML = '<div class="page-loader"><div class="skeleton-card short"></div><div class="skeleton-card" style="height:200px"></div><div class="skeleton-card" style="height:300px"></div></div>';
  }

  const [shootsRes, teamRes, logsRes] = await Promise.all([
    supabase.from('shoots').select('*'),
    supabase.from('team_members').select('id, name'),
    supabase.from('audit_log').select('*').order('created_at', { ascending: true })
  ]);

  if (myGen !== renderGen) return;

  const allShoots = shootsRes.data || [];
  const team = teamRes.data || [];
  const allLogs = logsRes.data || [];

  // Filter shoots by date range
  const shoots = allShoots.filter(s => s.date >= dateFrom && s.date <= dateTo);
  const logs = allLogs.filter(l => {
    const shootDate = allShoots.find(s => s.id === l.shoot_id)?.date;
    return shootDate && shootDate >= dateFrom && shootDate <= dateTo;
  });

  // Previous equivalent period, for trend comparison — reuses allShoots, no new fetch
  const { prevFrom, prevTo } = getPreviousPeriod(dateFrom, dateTo);
  const prevShoots = allShoots.filter(s => s.date >= prevFrom && s.date <= prevTo);

  // Quarterly presets
  const year = new Date().getFullYear();
  const quarters = [
    { label: 'Q1', from: `${year}-01-01`, to: `${year}-03-31` },
    { label: 'Q2', from: `${year}-04-01`, to: `${year}-06-30` },
    { label: 'Q3', from: `${year}-07-01`, to: `${year}-09-30` },
    { label: 'Q4', from: `${year}-10-01`, to: `${year}-12-31` },
  ];

  el.innerHTML = `
    <div class="reports-filters">
      <div class="reports-presets-wrap">
        <button type="button" class="preset-scroll-btn preset-scroll-left" id="preset-scroll-left" aria-label="Scroll left">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="reports-presets" id="reports-presets-scroll">
          <button class="preset-btn" data-preset="this-month">This Month</button>
          <button class="preset-btn" data-preset="last-month">Last Month</button>
          ${quarters.map(q => `<button class="preset-btn" data-from="${q.from}" data-to="${q.to}">${q.label} ${year}</button>`).join('')}
        </div>
        <button type="button" class="preset-scroll-btn preset-scroll-right" id="preset-scroll-right" aria-label="Scroll right">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
      <div class="reports-date-row">
        <div class="form-group" style="margin-bottom:0;flex:1">
          <label>From</label>
          <input type="date" id="r-from" value="${dateFrom}">
        </div>
        <div class="form-group" style="margin-bottom:0;flex:1">
          <label>To</label>
          <input type="date" id="r-to" value="${dateTo}">
        </div>
      </div>
      <div class="form-group" style="margin-bottom:0">
        <label>Member</label>
        <select id="r-member">
          <option value="All">All Members</option>
          ${team.filter(m => !REPORTS_MEMBER_FILTER_EXCLUDE.includes(m.name)).map(m => `<option value="${m.id}" ${filterMemberId === m.id ? 'selected' : ''}>${m.name}</option>`).join('')}
        </select>
      </div>
    </div>

    ${renderSummaryCards(shoots, prevShoots, filterMemberId)}
    <div class="reports-overview-row">
      ${renderShootOverviewDonut(shoots, filterMemberId)}
      ${renderTopPerformers(shoots, team, filterMemberId)}
    </div>
    ${renderDepartmentBreakdown(shoots, filterMemberId)}
    ${renderMemberTable(shoots, team, logs, filterMemberId)}
    ${renderTurnaroundSection(allShoots, logs, team, filterMemberId)}
    ${renderBreakdownSection(shoots, allShoots, filterMemberId)}
  `;

  // Date change handlers
  el.querySelector('#r-from').addEventListener('change', (e) => { dateFrom = e.target.value; render(); });
  el.querySelector('#r-to').addEventListener('change', (e) => { dateTo = e.target.value; render(); });
  el.querySelector('#r-member').addEventListener('change', (e) => { filterMemberId = e.target.value; render(); });
  el.querySelector('#show-inactive-btn')?.addEventListener('click', () => { showInactiveMembers = !showInactiveMembers; render(); });
  wireBreakdownControls(shoots, allShoots, filterMemberId);

  // Preset buttons
  el.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.preset === 'this-month') {
        const now = new Date();
        dateFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
        dateTo = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
      } else if (btn.dataset.preset === 'last-month') {
        const now = new Date();
        dateFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
        dateTo = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);
      } else {
        dateFrom = btn.dataset.from;
        dateTo = btn.dataset.to;
      }
      render();
    });
  });

  // Preset row scroll arrows — the row already swipe-scrolls, but on mobile there's
  // no visual hint that it does, so add explicit prev/next buttons too.
  const presetsTrack = el.querySelector('#reports-presets-scroll');
  const scrollLeftBtn = el.querySelector('#preset-scroll-left');
  const scrollRightBtn = el.querySelector('#preset-scroll-right');
  const updatePresetArrows = () => {
    scrollLeftBtn.classList.toggle('is-disabled', presetsTrack.scrollLeft <= 4);
    scrollRightBtn.classList.toggle('is-disabled', presetsTrack.scrollLeft + presetsTrack.clientWidth >= presetsTrack.scrollWidth - 4);
  };
  scrollLeftBtn.addEventListener('click', () => presetsTrack.scrollBy({ left: -160, behavior: 'smooth' }));
  scrollRightBtn.addEventListener('click', () => presetsTrack.scrollBy({ left: 160, behavior: 'smooth' }));
  presetsTrack.addEventListener('scroll', updatePresetArrows);
  updatePresetArrows();
}

const PHASE_WEIGHT = { Planned: 0, Shot: 40, edited: 75, Posted: 100 };

function getShootCompletion(s) {
  const ts = s.type_statuses || {};
  const statuses = Object.keys(ts).length > 0 ? Object.values(ts) : [s.status];
  const total = statuses.reduce((sum, st) => sum + (PHASE_WEIGHT[st] || 0), 0);
  return Math.round(total / statuses.length);
}

function getStatusCounts(shoots) {
  const counts = { Planned: 0, Shot: 0, edited: 0, Posted: 0, total: 0, avgCompletion: 0 };
  shoots.forEach(s => {
    counts[s.status] = (counts[s.status] || 0) + 1;
    counts.total++;
  });
  if (counts.total > 0) {
    counts.avgCompletion = Math.round(shoots.reduce((sum, s) => sum + getShootCompletion(s), 0) / counts.total);
  }
  return counts;
}

const ICONS = {
  grid: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  percent: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>',
  edit: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>',
  check: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
};

function renderSummaryCards(shoots, prevShoots, memberId) {
  const filtered = memberId === 'All' ? shoots : shoots.filter(s => s.assignee_id === memberId);
  const prevFiltered = memberId === 'All' ? prevShoots : prevShoots.filter(s => s.assignee_id === memberId);
  const c = getStatusCounts(filtered);
  const p = getStatusCounts(prevFiltered);

  const cards = [
    { icon: ICONS.grid,    cls: 'stat-icon-terracotta', value: c.total,           label: 'Total Shoots',    trend: trendBadge(c.total, p.total) },
    { icon: ICONS.percent, cls: 'stat-icon-blue',        value: c.avgCompletion + '%', label: 'Avg Completion', trend: trendBadge(c.avgCompletion, p.avgCompletion) },
    { icon: ICONS.edit,    cls: 'stat-icon-plum',        value: c.edited || 0,     label: 'In Editing',      trend: trendBadge(c.edited || 0, p.edited || 0) },
    { icon: ICONS.check,   cls: 'stat-icon-sage',        value: c.Posted || 0,     label: 'Fully Posted',    trend: trendBadge(c.Posted || 0, p.Posted || 0) }
  ];

  return `
    <div class="stats-grid" style="margin-top:16px">
      ${cards.map(cd => `
        <div class="stat-card">
          <div class="stat-icon ${cd.cls}">${cd.icon}</div>
          <div class="stat-body">
            <div class="stat-value">${cd.value}</div>
            <div class="stat-label">${cd.label}</div>
            ${cd.trend}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderShootOverviewDonut(shoots, memberId) {
  const filtered = memberId === 'All' ? shoots : shoots.filter(s => s.assignee_id === memberId);
  const c = getStatusCounts(filtered);

  const STATUS_META = [
    { key: 'Posted',  label: 'Completed', color: 'var(--sage)' },
    { key: 'edited',  label: 'Editing',   color: 'var(--plum)' },
    { key: 'Shot',    label: 'Shot',      color: 'var(--amber)' },
    { key: 'Planned', label: 'Planned',   color: 'var(--blue)' }
  ];
  const total = c.total;
  const r = 45, C = 2 * Math.PI * r;
  let offset = 0;
  const segments = STATUS_META.map(m => {
    const count = c[m.key] || 0;
    const frac = total > 0 ? count / total : 0;
    const dash = frac * C;
    const seg = `<circle cx="60" cy="60" r="${r}" fill="none" stroke="${m.color}" stroke-width="14" stroke-dasharray="${dash} ${C - dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 60 60)"/>`;
    offset += dash;
    return seg;
  }).join('');
  const legend = STATUS_META.map(m => {
    const count = c[m.key] || 0;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return `
      <div class="donut-legend-row">
        <span class="donut-dot" style="background:${m.color}"></span>
        <span class="donut-legend-label">${m.label}</span>
        <span class="donut-legend-value">${count} (${pct}%)</span>
      </div>`;
  }).join('');

  return `
    <div class="donut-card reports-overview-card">
      <p class="section-title" style="margin-bottom:10px">Shoot Overview</p>
      <div class="donut-wrap">
        <svg class="donut-svg" viewBox="0 0 120 120" width="110" height="110">
          <circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--sand)" stroke-width="14"/>
          ${segments}
          <text x="60" y="56" text-anchor="middle" class="donut-center-value">${total}</text>
          <text x="60" y="72" text-anchor="middle" class="donut-center-label">Total Shoots</text>
        </svg>
        <div class="donut-legend">${legend}</div>
      </div>
    </div>
  `;
}

function renderTopPerformers(shoots, team, memberId) {
  if (memberId !== 'All') return '';

  const ranked = team.map(m => {
    const memberShoots = shoots.filter(s => s.assignee_id === m.id);
    const posted = memberShoots.filter(s => s.status === 'Posted').length;
    return { name: m.name, total: memberShoots.length, posted };
  }).filter(r => r.total > 0).sort((a, b) => b.posted - a.posted || b.total - a.total).slice(0, 5);

  return `
    <div class="top-performers-card reports-overview-card">
      <p class="section-title" style="margin-bottom:10px">Top Performers</p>
      ${ranked.length === 0
        ? '<div class="empty-state" style="padding:20px 0"><div class="emoji">🏆</div>No activity this period</div>'
        : ranked.map((r, i) => `
          <div class="top-performer-row">
            <span class="top-performer-rank">${i + 1}</span>
            <span class="top-performer-avatar">${r.name.charAt(0).toUpperCase()}</span>
            <div class="top-performer-info">
              <div class="top-performer-name">${r.name}</div>
              <div class="top-performer-meta">${r.total} shoot${r.total === 1 ? '' : 's'} · ${r.posted} posted</div>
            </div>
          </div>
        `).join('')}
    </div>
  `;
}

const DEPARTMENTS = ['Decor', 'Catering', 'Entertainment', 'Venue'];
const SHOOT_TYPE_META = [
  { key: 'Photo', color: 'var(--sage-ink)' },
  { key: 'Reel', color: 'var(--plum-ink)' },
  { key: 'Sales Video', color: 'var(--blue-ink)' }
];
const SHOOT_TYPES = SHOOT_TYPE_META.map(t => t.key);

function computeDeptTypeCounts(shoots, memberId) {
  const filtered = memberId === 'All' ? shoots : shoots.filter(s => s.assignee_id === memberId);
  const counts = {};
  DEPARTMENTS.forEach(d => { counts[d] = { Photo: 0, Reel: 0, 'Sales Video': 0, total: 0, shootCount: 0 }; });

  filtered.forEach(s => {
    const depts = (s.departments || []).map(raw => DEPARTMENTS.find(d => d.toLowerCase() === String(raw).toLowerCase())).filter(Boolean);
    const ts = s.type_statuses || {};
    Object.keys(ts).forEach(t => {
      if (!SHOOT_TYPES.includes(t)) return;
      depts.forEach(d => { counts[d][t]++; counts[d].total++; });
    });
    // A shoot happens once — count it once per department regardless of how many types it has.
    depts.forEach(d => { counts[d].shootCount++; });
  });

  const columnTotals = { Photo: 0, Reel: 0, 'Sales Video': 0, total: 0, shootCount: 0 };
  DEPARTMENTS.forEach(d => {
    SHOOT_TYPES.forEach(t => { columnTotals[t] += counts[d][t]; });
    columnTotals.total += counts[d].total;
    columnTotals.shootCount += counts[d].shootCount;
  });

  return { counts, columnTotals };
}

function renderDepartmentPieGrid(counts) {
  const r = 42, C = 2 * Math.PI * r;

  return `
    <div class="dept-pie-grid">
      ${DEPARTMENTS.map(d => {
        const c = counts[d];
        let offset = 0;
        const segments = c.total > 0 ? SHOOT_TYPE_META.map(t => {
          const count = c[t.key] || 0;
          if (count === 0) return '';
          const dash = (count / c.total) * C;
          const seg = `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${t.color}" stroke-width="14" stroke-dasharray="${dash} ${C - dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 50 50)"/>`;
          offset += dash;
          return seg;
        }).join('') : '';

        return `
          <div class="dept-pie-card">
            <svg viewBox="0 0 100 100" width="104" height="104" class="dept-pie-svg">
              <circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--sand)" stroke-width="14"/>
              ${segments}
              <text x="50" y="55" text-anchor="middle" class="dept-pie-value">${c.shootCount}</text>
            </svg>
            <p class="dept-pie-name">${d}</p>
            <div class="dept-pie-legend">
              ${SHOOT_TYPE_META.map(t => `
                <div class="dept-pie-legend-row">
                  <span class="donut-dot" style="background:${t.color}"></span>
                  <span class="dept-pie-legend-label">${t.key}</span>
                  <span class="dept-pie-legend-value">${c[t.key]}</span>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderDepartmentBreakdown(shoots, memberId) {
  const { counts } = computeDeptTypeCounts(shoots, memberId);
  return `
    <p class="section-title" style="margin-top:20px">By Department</p>
    ${renderDepartmentPieGrid(counts)}
  `;
}

function renderMemberTable(shoots, team, logs, memberId) {
  const members = memberId === 'All' ? team : team.filter(m => m.id === memberId);

  const memberRows = members.map(m => {
    const memberShoots = shoots.filter(s => s.assignee_id === m.id);
    const counts = getStatusCounts(memberShoots);

    // Turnaround: average days from shoot date to Posted (using audit_log)
    const postedLogs = logs.filter(l =>
      l.to_status === 'Posted' &&
      memberShoots.some(s => s.id === l.shoot_id)
    );
    let avgTurnaround = '—';
    if (postedLogs.length > 0) {
      const days = postedLogs.map(l => {
        const shoot = memberShoots.find(s => s.id === l.shoot_id);
        if (!shoot) return null;
        const shootDate = new Date(shoot.date + 'T00:00:00');
        const postedDate = new Date(l.created_at);
        return (postedDate - shootDate) / (1000 * 60 * 60 * 24);
      }).filter(d => d !== null && d >= 0);

      if (days.length > 0) {
        const avg = days.reduce((a, b) => a + b, 0) / days.length;
        avgTurnaround = avg < 1 ? '<1 day' : `${Math.round(avg)}d`;
      }
    }

    const completionRate = counts.total > 0
      ? Math.round(memberShoots.reduce((sum, s) => sum + getShootCompletion(s), 0) / counts.total) + '%'
      : '—';

    const html = `
      <tr>
        <td class="report-name-cell">${m.name}</td>
        <td>${counts.total}</td>
        <td>${counts.Shot || 0}</td>
        <td>${counts.edited || 0}</td>
        <td>${counts.Posted || 0}</td>
        <td>${completionRate}</td>
        <td>${avgTurnaround}</td>
      </tr>
    `;
    return { total: counts.total, html };
  });

  const active = memberRows.filter(r => r.total > 0);
  const inactive = memberRows.filter(r => r.total === 0);
  const rows = active.map(r => r.html).concat(showInactiveMembers ? inactive.map(r => r.html) : []);

  // Totals row
  const allFiltered = memberId === 'All' ? shoots : shoots.filter(s => s.assignee_id === memberId);
  const totals = getStatusCounts(allFiltered);

  return `
    <p class="section-title" style="margin-top:20px">Member Breakdown</p>
    <div class="report-table-wrap">
      <table class="report-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Total</th>
            <th>Shot</th>
            <th>Edited</th>
            <th>Posted</th>
            <th>Done %</th>
            <th>Avg TAT</th>
          </tr>
        </thead>
        <tbody>
          ${rows.join('')}
        </tbody>
        ${members.length > 1 ? `
          <tfoot>
            <tr>
              <td><strong>Total</strong></td>
              <td><strong>${totals.total}</strong></td>
              <td><strong>${totals.Shot || 0}</strong></td>
              <td><strong>${totals.edited || 0}</strong></td>
              <td><strong>${totals.Posted || 0}</strong></td>
              <td><strong>${totals.total > 0 ? Math.round((totals.Posted / totals.total) * 100) + '%' : '—'}</strong></td>
              <td>—</td>
            </tr>
          </tfoot>
        ` : ''}
      </table>
    </div>
    ${inactive.length > 0 ? `<button class="show-inactive-btn" id="show-inactive-btn">${showInactiveMembers ? 'Hide' : 'Show'} ${inactive.length} inactive member${inactive.length === 1 ? '' : 's'}</button>` : ''}
  `;
}

function renderTurnaroundSection(allShoots, logs, team, memberId) {
  // Phase transitions turnaround
  const transitions = [
    { from: 'Planned', to: 'Shot', label: 'Planned → Shot' },
    { from: 'Shot', to: 'edited', label: 'Shot → Edited' },
    { from: 'edited', to: 'Posted', label: 'Edited → Posted' },
  ];

  const filteredShoots = memberId === 'All' ? allShoots : allShoots.filter(s => s.assignee_id === memberId);
  const shootIds = new Set(filteredShoots.filter(s => s.date >= dateFrom && s.date <= dateTo).map(s => s.id));
  const relevantLogs = logs.filter(l => shootIds.has(l.shoot_id));

  const fmtDays = (d) => d < 1 ? '<1d' : `${Math.round(d)}d`;

  const data = transitions.map(t => {
    // Find pairs: for each shoot, find the log entry for this transition
    const transLogs = relevantLogs.filter(l => l.from_status === t.from && l.to_status === t.to);
    if (transLogs.length === 0) return { label: t.label, avg: null, fastest: null, count: 0 };

    // For each transition, find the previous status log to calculate duration
    const durations = [];
    transLogs.forEach(log => {
      // Find when it entered the 'from' status
      const shoot = filteredShoots.find(s => s.id === log.shoot_id);
      if (!shoot) return;

      let enteredFrom;
      if (t.from === 'Planned') {
        // Entered "Planned" at shoot creation
        enteredFrom = new Date(shoot.date + 'T00:00:00');
      } else {
        // Find the log where it transitioned TO the from-status
        const prevLog = relevantLogs.find(l =>
          l.shoot_id === log.shoot_id &&
          l.to_status === t.from &&
          l.type_name === log.type_name &&
          new Date(l.created_at) < new Date(log.created_at)
        );
        if (prevLog) enteredFrom = new Date(prevLog.created_at);
        else enteredFrom = new Date(shoot.date + 'T00:00:00');
      }

      const exitedAt = new Date(log.created_at);
      const days = (exitedAt - enteredFrom) / (1000 * 60 * 60 * 24);
      if (days >= 0) durations.push(days);
    });

    if (durations.length === 0) return { label: t.label, avg: null, fastest: null, count: transLogs.length };

    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    const fastest = Math.min(...durations);
    return { label: t.label, avg, fastest, count: transLogs.length };
  });

  const maxAvg = Math.max(0.001, ...data.map(d => d.avg || 0));

  const rows = data.map(d => `
    <tr>
      <td>${d.label}</td>
      <td>
        <div class="tat-cell">
          <span>${d.avg != null ? fmtDays(d.avg) : '—'}</span>
          <div class="tat-bar-track"><div class="tat-bar-fill" style="width:${d.avg != null ? (d.avg / maxAvg) * 100 : 0}%"></div></div>
        </div>
      </td>
      <td>${d.fastest != null ? fmtDays(d.fastest) : '—'}</td>
      <td>${d.count}</td>
    </tr>
  `);

  return `
    <p class="section-title" style="margin-top:24px">Turnaround Times</p>
    <div class="report-table-wrap">
      <table class="report-table">
        <thead>
          <tr>
            <th>Phase</th>
            <th>Avg</th>
            <th>Fastest</th>
            <th>Count</th>
          </tr>
        </thead>
        <tbody>${rows.join('')}</tbody>
      </table>
    </div>
  `;
}

// ========== SHOOT BREAKDOWN (department × type matrix) ==========

const BREAKDOWN_STATUSES = ['Planned', 'Shot', 'edited', 'Posted'];
const BREAKDOWN_STATUS_META = [
  { key: 'Planned', label: 'Planned', color: 'var(--blue-ink)' },
  { key: 'Shot', label: 'Shot', color: 'var(--amber-ink)' },
  { key: 'edited', label: 'Edited', color: 'var(--plum-ink)' },
  { key: 'Posted', label: 'Posted', color: 'var(--sage-ink)' }
];
const NO_DEPT_LABEL = '(No dept)';

function emptyBreakdownCounts() {
  return { Planned: 0, Shot: 0, edited: 0, Posted: 0, total: 0 };
}

// Discover the full set of department/type values from the whole dataset (not just the
// current filtered slice) so the local dropdowns stay stable as the date/member filters change.
function getBreakdownOptions(allShoots) {
  const deptSet = new Set();
  const typeSet = new Set();
  allShoots.forEach(s => {
    const depts = Array.isArray(s.departments) && s.departments.length ? s.departments : [NO_DEPT_LABEL];
    depts.forEach(d => deptSet.add(d));
    (s.type || '').split(',').map(t => t.trim()).filter(Boolean).forEach(t => typeSet.add(t));
  });
  return { depts: Array.from(deptSet).sort(), types: Array.from(typeSet).sort() };
}

function computeBreakdownMatrix(filteredShoots) {
  const matrix = {};
  const columnTotals = {};
  const grandTotals = emptyBreakdownCounts();

  filteredShoots.forEach(s => {
    const depts = Array.isArray(s.departments) && s.departments.length ? s.departments : [NO_DEPT_LABEL];
    const types = (s.type || '').split(',').map(t => t.trim()).filter(Boolean);
    const ts = s.type_statuses || {};
    types.forEach(t => {
      const status = ts[t] || 'Planned';
      if (!BREAKDOWN_STATUSES.includes(status)) return;
      // Incremented once per (dept, type) instance — not once per shoot — so the grand
      // total and column totals always equal the sum of the matrix cells they roll up.
      depts.forEach(d => {
        if (!matrix[d]) matrix[d] = {};
        if (!matrix[d][t]) matrix[d][t] = emptyBreakdownCounts();
        matrix[d][t][status]++;
        matrix[d][t].total++;

        if (!columnTotals[t]) columnTotals[t] = emptyBreakdownCounts();
        columnTotals[t][status]++;
        columnTotals[t].total++;

        grandTotals[status]++;
        grandTotals.total++;
      });
    });
  });

  return { matrix, columnTotals, grandTotals };
}

function renderBreakdownBar(cell, dept, type) {
  const c = cell || emptyBreakdownCounts();
  if (c.total === 0) {
    return `<div class="breakdown-bar-wrap"><div class="breakdown-bar breakdown-bar-empty"></div><span class="breakdown-bar-count breakdown-bar-count-zero">0</span></div>`;
  }
  const segs = BREAKDOWN_STATUS_META.map(m => c[m.key] > 0
    ? `<div class="breakdown-bar-seg" style="width:${(c[m.key] / c.total) * 100}%;background:${m.color}"></div>`
    : ''
  ).join('');
  const tooltip = `${type} · ${dept} · ${c.total} slots — ${c.Planned} Planned, ${c.Shot} Shot, ${c.edited} Edited, ${c.Posted} Posted`;
  return `<div class="breakdown-bar-wrap" title="${tooltip}"><div class="breakdown-bar">${segs}</div><span class="breakdown-bar-count">${c.total}</span></div>`;
}

function renderBreakdownHeader(grandTotals) {
  return `
    <div class="breakdown-header-row">
      <p class="section-title" style="margin:0">Shoot Breakdown</p>
      <span class="breakdown-totals-line">Total ${grandTotals.total} shoot slots · ${grandTotals.Planned} Planned · ${grandTotals.Shot} Shot · ${grandTotals.edited} Edited · ${grandTotals.Posted} Posted</span>
    </div>
  `;
}

function renderBreakdownControls(allDepts, allTypes) {
  return `
    <div class="breakdown-controls-row">
      <select id="breakdown-dept-select" class="filter-select">
        <option value="">All Departments</option>
        ${allDepts.map(d => `<option value="${d}" ${breakdownDeptFilter === d ? 'selected' : ''}>${d}</option>`).join('')}
      </select>
      <select id="breakdown-type-select" class="filter-select">
        <option value="">All Types</option>
        ${allTypes.map(t => `<option value="${t}" ${breakdownTypeFilter === t ? 'selected' : ''}>${t}</option>`).join('')}
      </select>
      <div class="breakdown-legend">
        ${BREAKDOWN_STATUS_META.map(m => `<span class="breakdown-legend-item"><span class="donut-dot" style="background:${m.color}"></span>${m.label}</span>`).join('')}
      </div>
    </div>
  `;
}

function renderBreakdownMatrixTable(rowDepts, colTypes, matrix, columnTotals, grandTotals) {
  return `
    <div class="breakdown-matrix-wrap">
      <table class="breakdown-matrix-table">
        <thead>
          <tr>
            <th></th>
            ${colTypes.map(t => `<th>${t}</th>`).join('')}
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${rowDepts.map(d => {
            const rowTotal = colTypes.reduce((sum, t) => sum + ((matrix[d] && matrix[d][t]?.total) || 0), 0);
            return `
              <tr>
                <td class="breakdown-dept-name">${d}</td>
                ${colTypes.map(t => `<td>${renderBreakdownBar(matrix[d] && matrix[d][t], d, t)}</td>`).join('')}
                <td class="breakdown-row-total">${rowTotal}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td>Column total</td>
            ${colTypes.map(t => `<td>${(columnTotals[t] && columnTotals[t].total) || 0} shoots</td>`).join('')}
            <td>${grandTotals.total}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

function renderBreakdownStackedList(rowDepts, colTypes, matrix) {
  return `
    <div class="breakdown-stacked">
      ${rowDepts.map(d => {
        const rowTotal = colTypes.reduce((sum, t) => sum + ((matrix[d] && matrix[d][t]?.total) || 0), 0);
        return `
          <div class="breakdown-stacked-dept">
            <p class="breakdown-stacked-dept-name">${d} <span>(${rowTotal} slot${rowTotal === 1 ? '' : 's'})</span></p>
            ${colTypes.map(t => `
              <div class="breakdown-stacked-row">
                <span class="breakdown-stacked-type-label">${t}</span>
                ${renderBreakdownBar(matrix[d] && matrix[d][t], d, t)}
              </div>
            `).join('')}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderBreakdownInner(filteredShoots, allShoots) {
  const { depts: allDepts, types: allTypes } = getBreakdownOptions(allShoots);
  const { matrix, columnTotals, grandTotals } = computeBreakdownMatrix(filteredShoots);

  if (filteredShoots.length === 0) {
    return `
      <div class="breakdown-card">
        ${renderBreakdownHeader(grandTotals)}
        ${renderBreakdownControls(allDepts, allTypes)}
        <div class="empty-state" style="padding:30px 0"><div class="emoji">📊</div>No shoots in the selected filters.</div>
      </div>
    `;
  }

  const rowDepts = breakdownDeptFilter ? [breakdownDeptFilter] : allDepts;
  const colTypes = breakdownTypeFilter ? [breakdownTypeFilter] : allTypes;

  return `
    <div class="breakdown-card">
      ${renderBreakdownHeader(grandTotals)}
      ${renderBreakdownControls(allDepts, allTypes)}
      ${renderBreakdownMatrixTable(rowDepts, colTypes, matrix, columnTotals, grandTotals)}
      ${renderBreakdownStackedList(rowDepts, colTypes, matrix)}
    </div>
  `;
}

function renderBreakdownSection(shoots, allShoots, memberId) {
  const filtered = memberId === 'All' ? shoots : shoots.filter(s => s.assignee_id === memberId);
  return `<div id="reports-breakdown">${renderBreakdownInner(filtered, allShoots)}</div>`;
}

function updateBreakdown(shoots, allShoots, memberId) {
  const wrap = document.getElementById('reports-breakdown');
  if (!wrap) return;
  const filtered = memberId === 'All' ? shoots : shoots.filter(s => s.assignee_id === memberId);
  wrap.innerHTML = renderBreakdownInner(filtered, allShoots);
  wireBreakdownControls(shoots, allShoots, memberId);
}

function wireBreakdownControls(shoots, allShoots, memberId) {
  const wrap = document.getElementById('reports-breakdown');
  if (!wrap) return;
  wrap.querySelector('#breakdown-dept-select')?.addEventListener('change', (e) => {
    breakdownDeptFilter = e.target.value;
    updateBreakdown(shoots, allShoots, memberId);
  });
  wrap.querySelector('#breakdown-type-select')?.addEventListener('change', (e) => {
    breakdownTypeFilter = e.target.value;
    updateBreakdown(shoots, allShoots, memberId);
  });
}
