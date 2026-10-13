# JSON Tree — Spec

Vocabulary: see `CONTEXT.md` (Document, Node, Key, Index, Path, Path Format, Baseline, Edited Node). Decisions: see `docs/adr/`.

## Goal

A local web app for looking at a JSON Document: see its shape, search it, edit it, and pinpoint any Node by its Path — especially clicking a Node and copying its Path.

## Constraints

- Vite + React + TypeScript, built as a static site (GitHub Pages–hostable). Nothing leaves the browser.
- One Document at a time. Target size: up to ~500KB. No virtualisation required.
- Strict JSON only (no comments, trailing commas, JSON5).
- Theme follows system light/dark preference.
- Parser and Path format/parse logic are pure modules, built test-first with Vitest.

## Behaviour

### Loading
- Paste, drag-and-drop a file, or file picker.
- Custom parser (ADR-0001): preserves each number's source text; duplicate Keys are a parse error.
- On parse error: editable raw text view showing the error's line and column; fix and retry. No raw view otherwise.

### Tree
- Each row shows Key/Index, a type badge, and for objects/arrays a child count.
- Collapsed containers show a preview, e.g. `users: Array(120)`, `address: {street, city, …}`.
- First 2 levels expanded on load.
- Arrays with more than 100 children are grouped into collapsible ranges `[0…99]`, `[100…199]`, …
- Keyboard: ↑↓ move selection, ←→ collapse/expand, Enter edit, Delete remove, Ctrl+Z / Ctrl+Y undo/redo, `/` or Ctrl+F focus search, Ctrl+Shift+C copy Path.

### Pinpointing
- Clicking a Key or its value selects that Node.
- Path bar shows the selected Node's Path as breadcrumbs; clicking a segment selects that ancestor. Copy button beside it.
- Path Format switcher: JavaScript accessor (default), JSONPath, JSON Pointer.
  - JS accessor: dot notation where the Key is a valid identifier, otherwise `["..."]`; Indexes as `[n]`. Root name editable, default `data`, remembered across sessions.
  - JSONPath: `$.a[0]['first-name']`.
  - JSON Pointer: RFC 6901 (`~0`, `~1` escaping).
- Each row: right-click menu and hover icon with "Copy Path" and "Copy value".
- Copy value: objects/arrays pretty-printed (2-space); strings as raw text; other primitives in JSON form.
- Jump to Path: typing/pasting a Path into the bar selects that Node. Format auto-detected: leading `$` → JSONPath, leading `/` → JSON Pointer, otherwise JS accessor (root name optional). If unresolved, report the deepest matched prefix and the failing segment, e.g. "matched up to `data.users[0]`; no Key `emial`".

### Search
- Plain-text, case-insensitive, over Keys and values (not Paths).
- Matches highlighted; ancestors of matches auto-expanded (including array ranges).
- Next/previous navigation with "N of M" counter; navigating selects the match.

### Editing
- Inline edit of primitive values keeps the Node's type (invalid input for the type is rejected inline).
- Type dropdown changes type: between primitives the value is carried over where sensible; to object/array the old value is discarded.
- Rename Key; a rename colliding with a sibling Key is rejected inline.
- Add Node: in arrays, after the selected Node; in objects, at the end with a Key prompt.
- Delete Node.
- Undo/redo for all edits.
- Edited Nodes are marked relative to the Baseline; undoing back to the Baseline value clears the mark. A container whose children were removed shows "N children removed". Document-level "unsaved changes" indicator.
- Not in scope: drag-to-reorder or move.

### Output and persistence
- Copy whole Document, download as `.json`, save in place via File System Access API where supported.
- Serialised with 2-space indent, original Key order, untouched numbers byte-identical.
- Saving resets the Baseline.
- Document and Baseline persist across reloads (browser storage); undo history does not; the file handle for save-in-place does not survive reload.
- Explicit "Close Document" action clears it.

## Slices

1. `issues/01-load-and-tree.md`
2. `issues/02-pinpointing.md`
3. `issues/03-search.md`
4. `issues/04-editing.md`
5. `issues/05-output-and-persistence.md`
