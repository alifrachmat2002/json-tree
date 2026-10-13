# 03 — Search

Status: ready
Blocked by: 01

Spec: `../spec.md` (Search)

## Scope
- Case-insensitive plain-text search over Keys and values.
- Highlight matches; auto-expand ancestors, including array ranges.
- Next/previous with "N of M" counter; navigating selects the match.
- `/` and Ctrl+F focus the search input.

## Done when
- Matching logic is unit-tested (Keys, string values, numbers by source text, booleans/null).
- Searching a ~500KB Document stays responsive while typing.
