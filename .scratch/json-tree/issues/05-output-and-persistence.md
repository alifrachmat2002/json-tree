# 05 — Export and persistence

Status: ready
Blocked by: 01, 04

Spec: `../spec.md` (Output and persistence)

## Scope
- Serialiser (test-first): 2-space indent, original Key order, number source text preserved.
- Copy Document, download `.json`, save in place via File System Access API where supported (hidden otherwise).
- Saving resets the Baseline.
- Persist Document + Baseline in browser storage across reloads (not undo history, not file handle); cope with storage being unavailable.
- "Close Document" action.

## Done when
- Parse → serialise round-trip of a 2-space-indented Document is byte-identical.
- After reload the Document and its Edited Node markers are restored.
