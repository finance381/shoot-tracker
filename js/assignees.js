// One place that answers "who is on this shoot?".
//
// assignee_ids is the full list; assignee_id is kept in step as the first
// person so older rows, the Sheets sync and anything still reading the single
// column keep working. Rows written before the column existed only have
// assignee_id, so every read falls back to it.

export function assigneeIds(s) {
  const list = Array.isArray(s?.assignee_ids) ? s.assignee_ids.filter(Boolean) : [];
  if (list.length) return list;
  return s?.assignee_id ? [s.assignee_id] : [];
}

export function isAssigned(s, memberId) {
  if (!memberId) return false;
  return assigneeIds(s).includes(memberId);
}

// Team members first, then the external name, so the people in the app read
// before the one who is only a label.
export function assigneeNames(s, team = []) {
  const names = assigneeIds(s)
    .map(id => team.find(t => t.id === id)?.name)
    .filter(Boolean);
  if (s?.external_assignee) names.push('📷 ' + s.external_assignee);
  return names;
}

export function assigneeLabel(s, team = [], empty = '—') {
  const names = assigneeNames(s, team);
  return names.length ? names.join(', ') : empty;
}
