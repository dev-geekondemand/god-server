// Returns { field, oldValue, newValue } for every field in `fields` that is
// present in `updates` and whose value actually differs from `oldObj`.
function diffFields(oldObj, updates, fields) {
  const changes = [];
  for (const field of fields) {
    if (!(field in updates)) continue;
    const oldValue = oldObj?.[field] ?? null;
    const newValue = updates[field] ?? null;
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changes.push({ field, oldValue, newValue });
    }
  }
  return changes;
}

module.exports = { diffFields };
