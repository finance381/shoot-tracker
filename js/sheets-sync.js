// ===== GOOGLE SHEETS SYNC =====
// Paste your deployed Google Apps Script web app URL below.
const SHEET_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbyYky9sMM9u9Hn4qZfT7QAJBDmfOVtJVoJ15CxjxU1PP5aZQ94QztZLlOgvZCyyHb8Dbw/exec';

export async function syncShoot(shoot, action = 'upsert') {
  if (!SHEET_WEBHOOK_URL) return;
  try {
    const d = shoot.date ? new Date(shoot.date + 'T00:00:00') : null;
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    const venue = shoot.location_type === 'outdoor'
      ? (shoot.outdoor_venue || 'Outdoor')
      : (shoot.location || '');

    const payload = {
      action,
      shoot: {
        id: shoot.id,
        month: d ? monthNames[d.getMonth()] : '',
        date: d ? d.getDate() : '',
        venue: venue,
        time: shoot.time ? formatTime(shoot.time) : '',
        category: (shoot.departments || []).join(' + '),
        sales_person: shoot.requested_by || '',
        photographer: shoot.assignee_name || '',
        remark: [shoot.client, shoot.notes].filter(Boolean).join(' — '),
        status: shoot.status || '',
        type_statuses: shoot.type_statuses || {}
      }
    };

    await fetch(SHEET_WEBHOOK_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.warn('Sheet sync failed:', err);
  }
}

function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hr = parseInt(h);
  return `${hr % 12 || 12}:${m.padStart(2, '0')} ${hr >= 12 ? 'PM' : 'AM'}`;
}

export async function syncFullDump(shoots) {
  if (!SHEET_WEBHOOK_URL) return;
  try {
    await fetch(SHEET_WEBHOOK_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'full_sync', shoots })
    });
  } catch (err) {
    console.warn('Sheet full sync failed:', err);
  }
}