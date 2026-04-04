// ===== GOOGLE SHEETS SYNC =====
// Paste your deployed Google Apps Script web app URL below.
// Leave empty to disable syncing.
const SHEET_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbyYky9sMM9u9Hn4qZfT7QAJBDmfOVtJVoJ15CxjxU1PP5aZQ94QztZLlOgvZCyyHb8Dbw/exec';

export async function syncShoot(shoot, action = 'upsert') {
  if (!SHEET_WEBHOOK_URL) return;
  try {
    const payload = {
      action,
      shoot: {
        id: shoot.id,
        date: shoot.date,
        time: shoot.time || '',
        type: shoot.type || '',
        function: shoot.client || '',
        assignee: shoot.assignee_name || '',
        external_assignee: shoot.external_assignee || '',
        location: shoot.location_type === 'outdoor' ? (shoot.outdoor_venue || 'Outdoor') : (shoot.location || ''),
        location_type: shoot.location_type || 'indoor',
        departments: (shoot.departments || []).join(', '),
        status: shoot.status || '',
        type_statuses: JSON.stringify(shoot.type_statuses || {}),
        is_impromptu: shoot.is_impromptu ? 'Yes' : 'No',
        notes: shoot.notes || '',
        created_at: shoot.created_at || ''
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
