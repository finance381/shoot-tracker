// Shared per-department status helpers.
//
// type_statuses shape: { [typeName]: { [department]: status } }.
// Legacy rows may still have { [typeName]: status } (a plain string) — every
// reader here normalizes that against the shoot's current departments so old
// data keeps working without a data migration. The first write to any (type,
// dept) leaf upgrades that type's value to the nested object form.

export const STATUS_ORDER = ['Planned', 'Shot', 'edited', 'Posted'];
export const STATUS_LABEL = { Planned: 'Planned', Shot: 'Shot', edited: 'Edited', Posted: 'Posted' };
export const STATUS_COLOR = { Planned: 'var(--blue)', Shot: 'var(--primary)', edited: 'var(--terracotta)', Posted: 'var(--sage)' };

// { dept: status } for one type, normalizing a legacy flat string value
// against the shoot's departments.
export function getDeptStatuses(shoot, type) {
  const raw = (shoot.type_statuses || {})[type];
  const depts = (shoot.departments && shoot.departments.length) ? shoot.departments : [undefined];
  if (raw == null) return {};
  if (typeof raw === 'string') {
    const out = {};
    depts.forEach(d => { out[d] = raw; });
    return out;
  }
  return raw;
}

// Single status for a type: a specific department's value if `dept` is given,
// otherwise the least-advanced-wins rollup across all its departments.
export function getTypeStatus(shoot, type, dept) {
  const statuses = getDeptStatuses(shoot, type);
  if (dept !== undefined) return statuses[dept];
  const values = Object.values(statuses);
  if (!values.length) return undefined;
  return STATUS_ORDER[Math.min(...values.map(st => STATUS_ORDER.indexOf(st)))];
}

// Least-advanced-wins across every (type, dept) leaf on the shoot. Pass `dept`
// to scope the rollup to just that department's own deliverables.
export function getOverallStatus(shoot, dept) {
  const ts = shoot.type_statuses || {};
  const types = Object.keys(ts);
  if (!types.length) return shoot.status;
  const allValues = dept !== undefined
    ? types.map(t => getTypeStatus(shoot, t, dept)).filter(v => v !== undefined)
    : types.flatMap(t => Object.values(getDeptStatuses(shoot, t)));
  if (!allValues.length) return shoot.status;
  return STATUS_ORDER[Math.min(...allValues.map(st => STATUS_ORDER.indexOf(st)))];
}

// Returns a new type_statuses object with one (type, dept) leaf updated,
// upgrading that type's value from a legacy flat string first if needed.
export function setDeptStatus(typeStatuses, type, dept, status, shoot) {
  const current = { ...(typeStatuses || {}) };
  const existing = current[type];
  let statuses;
  if (existing == null) {
    statuses = {};
  } else if (typeof existing === 'string') {
    statuses = {};
    const depts = (shoot?.departments && shoot.departments.length) ? shoot.departments : [dept];
    depts.forEach(d => { statuses[d] = existing; });
  } else {
    statuses = { ...existing };
  }
  statuses[dept] = status;
  current[type] = statuses;
  return current;
}
