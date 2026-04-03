import { supabase } from './supabase.js';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

let viewMonth = new Date().getMonth();
let viewYear = new Date().getFullYear();

const container = () => document.getElementById('page-calendar');

export async function render() {
  const el = container();
  if (!el.querySelector('.cal-grid')) {
    el.innerHTML = '<div class="page-loader"><div class="skeleton-card short"></div><div class="skeleton-card" style="height:300px"></div></div>';
  }
  const { data: shoots } = await supabase.from('shoots').select('id, date, status, type, client');
  const all = shoots || [];

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const startDay = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7; // Mon=0
  const today = new Date().toISOString().slice(0, 10);

  let cells = '';
  for (let i = 0; i < startDay; i++) cells += '<div class="cal-cell empty"></div>';

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayS = all.filter(s => s.date === dateStr);
    const isToday = dateStr === today ? ' today' : '';
    const dots = dayS.slice(0, 4).map(s => `<div class="cal-dot dot-${s.status}"></div>`).join('');

    cells += `
      <div class="cal-cell${isToday}" data-date="${dateStr}">
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
      window.dispatchEvent(new CustomEvent('new-shoot', { detail: { date: cell.dataset.date } }));
    });
  });
}