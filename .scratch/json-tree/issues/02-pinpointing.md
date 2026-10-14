# 02 — Path bar, Path Formats, copy and jump to Path

Status: done
Blocked by: 01

Spec: `../spec.md` (Pinpointing)

## Scope
- Path format functions, test-first, for JS accessor (editable root name, default `data`), JSONPath, JSON Pointer.
- Path parse functions, test-first, with format auto-detection and a "deepest matched prefix" result on failure.
- Path bar with breadcrumbs (click selects ancestor), copy button, format switcher; root name remembered.
- Row right-click menu and hover icon: Copy Path, Copy value (copy-value rules per spec).
- Ctrl+Shift+C copies the selected Node's Path.
- Jump to Path from the bar, expanding ancestors and array ranges.

## Done when
- Format/parse round-trips for Keys with spaces, hyphens, dots, quotes, `~` and `/`, empty-string Keys, numeric-string Keys in objects vs Indexes in arrays.
- Unresolved Paths report the matched prefix and the failing segment.
