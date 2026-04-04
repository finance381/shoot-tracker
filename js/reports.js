import { supabase } from './supabase.js';
import { getMember } from './auth.js';

const STATUS_ORDER = ['Planned', 'Shot', 'Editing', 'Posted'];
let renderGen = 0;

// Default to current month
let dateFrom = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
let dateTo = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10);
let filterMemberId = 'All';

const container = () => document.getElementById('page-reports');

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
      <div class="reports-presets">
        <button class="preset-btn" data-preset="this-month">This Month</button>
        <button class="preset-btn" data-preset="last-month">Last Month</button>
        ${quarters.map(q => `<button class="preset-btn" data-from="${q.from}" data-to="${q.to}">${q.label} ${year}</button>`).join('')}
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
          ${team.map(m => `<option value="${m.id}" ${filterMemberId === m.id ? 'selected' : ''}>${m.name}</option>`).join('')}
        </select>
      </div>
    </div>

    ${renderSummaryCards(shoots, filterMemberId)}
    ${renderMemberTable(shoots, team, logs, filterMemberId)}
    ${renderTurnaroundSection(allShoots, logs, team, filterMemberId)}
  `;

  // Date change handlers
  el.querySelector('#r-from').addEventListener('change', (e) => { dateFrom = e.target.value; render(); });
  el.querySelector('#r-to').addEventListener('change', (e) => { dateTo = e.target.value; render(); });
  el.querySelector('#r-member').addEventListener('change', (e) => { filterMemberId = e.target.value; render(); });

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
}

function getStatusCounts(shoots) {
  const counts = { Planned: 0, Shot: 0, Editing: 0, Posted: 0, total: 0 };
  shoots.forEach(s => {
    const ts = s.type_statuses || {};
    const statuses = Object.keys(ts).length > 0 ? Object.values(ts) : [s.status];
    // Use overall status for counting
    counts[s.status] = (counts[s.status] || 0) + 1;
    counts.total++;
  });
  return counts;
}

function renderSummaryCards(shoots, memberId) {
  const filtered = memberId === 'All' ? shoots : shoots.filter(s => s.assignee_id === memberId);
  const c = getStatusCounts(filtered);

  return `
    <div class="stats-grid" style="margin-top:16px">
      <div class="stat-card">
        <div class="stat-value">${c.total}</div>
        <div class="stat-label">Total Shoots</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${c.Shot || 0}</div>
        <div class="stat-label">Shot</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${c.Editing || 0}</div>
        <div class="stat-label">Editing</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${c.Posted || 0}</div>
        <div class="stat-label">Posted</div>
      </div>
    </div>
  `;
}

function renderMemberTable(shoots, team, logs, memberId) {
  const members = memberId === 'All' ? team : team.filter(m => m.id === memberId);

  const rows = members.map(m => {
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
      ? Math.round((counts.Posted / counts.total) * 100) + '%'
      : '—';

    return `
      <tr>
        <td class="report-name-cell">${m.name}</td>
        <td>${counts.total}</td>
        <td>${counts.Shot || 0}</td>
        <td>${counts.Editing || 0}</td>
        <td>${counts.Posted || 0}</td>
        <td>${completionRate}</td>
        <td>${avgTurnaround}</td>
      </tr>
    `;
  });

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
            <th>Editing</th>
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
              <td><strong>${totals.Editing || 0}</strong></td>
              <td><strong>${totals.Posted || 0}</strong></td>
              <td><strong>${totals.total > 0 ? Math.round((totals.Posted / totals.total) * 100) + '%' : '—'}</strong></td>
              <td>—</td>
            </tr>
          </tfoot>
        ` : ''}
      </table>
    </div>
  `;
}

function renderTurnaroundSection(allShoots, logs, team, memberId) {
  // Phase transitions turnaround
  const transitions = [
    { from: 'Planned', to: 'Shot', label: 'Planned → Shot' },
    { from: 'Shot', to: 'Editing', label: 'Shot → Editing' },
    { from: 'Editing', to: 'Posted', label: 'Editing → Posted' },
  ];

  const filteredShoots = memberId === 'All' ? allShoots : allShoots.filter(s => s.assignee_id === memberId);
  const shootIds = new Set(filteredShoots.filter(s => s.date >= dateFrom && s.date <= dateTo).map(s => s.id));
  const relevantLogs = logs.filter(l => shootIds.has(l.shoot_id));

  const rows = transitions.map(t => {
    // Find pairs: for each shoot, find the log entry for this transition
    const transLogs = relevantLogs.filter(l => l.from_status === t.from && l.to_status === t.to);

    if (transLogs.length === 0) return `
      <tr><td>${t.label}</td><td>—</td><td>—</td><td>0</td></tr>
    `;

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

    if (durations.length === 0) return `
      <tr><td>${t.label}</td><td>—</td><td>—</td><td>${transLogs.length}</td></tr>
    `;

    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    const fastest = Math.min(...durations);

    const fmtDays = (d) => d < 1 ? '<1d' : `${Math.round(d)}d`;

    return `
      <tr>
        <td>${t.label}</td>
        <td>${fmtDays(avg)}</td>
        <td>${fmtDays(fastest)}</td>
        <td>${transLogs.length}</td>
      </tr>
    `;
  });

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
