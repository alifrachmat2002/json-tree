# 04 — Editing, Edited Node markers, undo/redo

Status: ready
Blocked by: 01

Spec: `../spec.md` (Editing)

## Scope
- Inline value edit (type-preserving, invalid input rejected), Enter to edit.
- Type dropdown with carry-over rules.
- Rename Key with sibling-collision rejection.
- Add Node (after selection in arrays; end of object with Key prompt); Delete Node (Delete key).
- Undo/redo (Ctrl+Z / Ctrl+Y) across all edit operations.
- Edited Node markers vs Baseline, "N children removed" on containers, Document-level "unsaved changes" indicator.

## Done when
- Edit operations and Edited Node detection are unit-tested, including undo back to the Baseline clearing markers.
- Editing a number Node replaces its source text; untouched number Nodes keep theirs.
