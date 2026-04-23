import { supabase } from './supabase.js';
import { getMember } from './auth.js';

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
  const pending  = shoots.filter(s => s.status !== 'Posted');
  const posted   = shoots.filter(s => s.status === 'Posted');
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
        `<span class="tag tag-type">${t} <small style="opacity:.7">${st}</small></span>`
      ).join('');
    } else if (s.type) {
      tags += s.type.split(',').map(t => `<span class="tag tag-type">${t.trim()}</span>`).join('');
    }
    if (s.departments?.length) tags += s.departments.map(d => `<span class="tag tag-dept">${d}</span>`).join('');
    if (s.is_impromptu) tags += '<span class="tag tag-impromptu">Impromptu</span>';
    if (s.location_type === 'outdoor') tags += '<span class="tag tag-outdoor">Outdoor</span>';
    return tags ? `<div class="tag-row">${tags}</div>` : '';
  };

  el.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card stat-clickable" data-action="this-week">
        <div class="stat-value">${thisWeek.length}</div>
        <div class="stat-label">This week</div>
      </div>
      <div class="stat-card stat-clickable" data-action="pending">
        <div class="stat-value">${pending.length}</div>
        <div class="stat-label">Pending post</div>
      </div>
      <div class="stat-card stat-clickable" data-action="posted">
        <div class="stat-value">${posted.length}</div>
        <div class="stat-label">Posted total</div>
      </div>
      <div class="stat-card stat-clickable" data-action="all">
        <div class="stat-value">${shoots.length}</div>
        <div class="stat-label">All shoots</div>
      </div>
    </div>

    <p class="section-title">Upcoming shoots</p>
    ${upcoming.length === 0
      ? '<div class="empty-state"><div class="emoji">🎯</div>No upcoming shoots</div>'
      : upcoming.map(s => `
        <div class="shoot-card ${me && s.assignee_id === me.id ? 'shoot-mine' : ''} border-${s.status}" data-id="${s.id}">
          <div class="shoot-info">
            <div class="shoot-title">${s.client || 'No function'}</div>
            <div class="shoot-meta">${s.date}${s.time ? ' at ' + fmtTime(s.time) : ''}${renderLocation(s) ? ' · ' + renderLocation(s) : ''}</div>
            ${renderTags(s)}
          </div>
          <span class="shoot-assignee">${getAssignee(s)}</span>
        </div>
      `).join('')}
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
      } else if (action === 'posted') {
        filters = { status: 'Posted' };
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
        const { data: shoot } = await supabase
          .from('shoots')
          .select('*')
          .eq('id', card.dataset.id)
          .maybeSingle();
        if (shoot) window.dispatchEvent(new CustomEvent('open-shoot', { detail: shoot }));
      } catch (err) {
        window.dispatchEvent(new CustomEvent('toast', { detail: 'Could not load shoot' }));
      } finally {
        card.dataset.loading = '';
        card.style.opacity = '';
      }
    });
  });
}

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hr = parseInt(h);
  return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
}
