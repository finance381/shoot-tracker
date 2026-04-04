import { supabase } from './supabase.js';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

let viewMonth = new Date().getMonth();
let viewYear = new Date().getFullYear();
let renderGen = 0;

const container = () => document.getElementById('page-calendar');

export async function render() {
  const myGen = ++renderGen;
  const el = container();
  if (!el.querySelector('.cal-grid')) {
    el.innerHTML = '<div class="page-loader"><div class="skeleton-card short"></div><div class="skeleton-card" style="height:300px"></div></div>';
  }

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const startDate = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`;
  const endDate = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

  const [shootsRes, teamRes] = await Promise.all([
    supabase.from('shoots').select('*').gte('date', startDate).lte('date', endDate),
    supabase.from('team_members').select('id, name')
  ]);

  if (myGen !== renderGen) return;

  const all = shootsRes.data || [];
  const team = teamRes.data || [];
  const startDay = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
  const today = new Date().toISOString().slice(0, 10);

  let cells = '';
  for (let i = 0; i < startDay; i++) cells += '<div class="cal-cell empty"></div>';

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayS = all.filter(s => s.date === dateStr);
    const isToday = dateStr === today ? ' today' : '';
    const count = dayS.length;
    const dots = dayS.slice(0, 4).map(s => `<div class="cal-dot dot-${s.status}"></div>`).join('');

    cells += `
      <div class="cal-cell${isToday}${count > 0 ? ' has-shoots' : ''}" data-date="${dateStr}">
        <span class="cal-date">${d}</span>
        <div class="cal-dots">${dots}</div>
      </div>`;
  }

  el.innerHTML = `
    <div class="cal-nav">
      <button class="cal-nav-btn" id="cal-prev">‹</button>
      <span class="cal-month-label">${MONTHS[viewMonth]} ${viewYear}</span>
      <button class="cal-nav-btn" id="cal-next">›</button>
    </div>
    <div class="cal-grid">
      ${DAYS.map(d => `<div class="cal-day-header">${d}</div>`).join('')}
      ${cells}
    </div>
  `;

  el.querySelector('#cal-prev').addEventListener('click', () => {
    if (viewMonth === 0) { viewMonth = 11; viewYear--; } else viewMonth--;
    render();
  });
  el.querySelector('#cal-next').addEventListener('click', () => {
    if (viewMonth === 11) { viewMonth = 0; viewYear++; } else viewMonth++;
    render();
  });

  el.querySelectorAll('.cal-cell:not(.empty)').forEach(cell => {
    cell.addEventListener('click', () => {
      const date = cell.dataset.date;
      const dayS = all.filter(s => s.date === date);
      if (dayS.length === 0) {
        window.dispatchEvent(new CustomEvent('new-shoot', { detail: { date } }));
      } else {
        openDaySheet(date, dayS, team);
      }
    });
  });
}

// ===== DAY DETAIL SHEET =====
function openDaySheet(date, shoots, team) {
  // Remove any existing sheet
  document.getElementById('cal-day-sheet')?.remove();

  const d = new Date(date + 'T00:00:00');
  const heading = d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  const assigneeName = (s) => {
    if (s.external_assignee) return '📷 ' + s.external_assignee;
    return team.find(t => t.id === s.assignee_id)?.name || '—';
  };

  const overlay = document.createElement('div');
  overlay.id = 'cal-day-sheet';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="border-radius:20px 20px 0 0;">
      <div class="modal-header">
        <h2>${heading}</h2>
        <button class="btn-icon" id="day-sheet-close">✕</button>
      </div>
      <div class="modal-body" style="padding-top:8px;">
        ${shoots.map(s => {
          const ts = s.type_statuses || {};
          const types = Object.keys(ts).length > 0
            ? Object.entries(ts).map(([t, st]) => `<span class="tag tag-type">${t} <small style="opacity:.7">${st}</small></span>`).join('')
            : (s.type || '').split(',').map(t => `<span class="tag tag-type">${t.trim()}</span>`).join('');
          const loc = s.location_type === 'outdoor' ? (s.outdoor_venue || 'Outdoor') : (s.location || '');
          return `
            <div class="day-shoot-card border-${s.status}" data-sid="${s.id}">
              <div class="day-shoot-top">
                <div>
                  <div class="shoot-title">${s.client || 'No function'}</div>
                  <div class="shoot-meta">${s.time ? fmtTime(s.time) : 'No time'}${loc ? ' · ' + loc : ''}</div>
                </div>
                <span class="shoot-assignee">${assigneeName(s)}</span>
              </div>
              <div class="tag-row" style="margin-top:6px">
                ${types}
                ${s.is_impromptu ? '<span class="tag tag-impromptu">Impromptu</span>' : ''}
                ${s.departments?.length ? s.departments.map(dd => `<span class="tag tag-dept">${dd}</span>`).join('') : ''}
              </div>
            </div>`;
        }).join('')}
        <button class="day-add-btn" id="day-add-shoot">+ Add shoot for this day</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('#day-sheet-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  // Click shoot card → open edit modal with fresh data
  overlay.querySelectorAll('.day-shoot-card').forEach(card => {
    card.addEventListener('click', async () => {
      const { data: shoot } = await supabase
        .from('shoots')
        .select('*')
        .eq('id', card.dataset.sid)
        .maybeSingle();
      if (shoot) {
        close();
        window.dispatchEvent(new CustomEvent('open-shoot', { detail: shoot }));
      }
    });
  });

  // Add shoot button
  overlay.querySelector('#day-add-shoot').addEventListener('click', () => {
    close();
    window.dispatchEvent(new CustomEvent('new-shoot', { detail: { date } }));
  });
}

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hr = parseInt(h);
  return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
}