# 01 — Load a Document and render the tree

Status: done

Spec: `../spec.md` (Constraints, Loading, Tree)

## Scope
- Scaffold Vite + React + TypeScript + Vitest; theme follows system preference.
- Custom JSON parser (ADR-0001), test-first: Node model with number source text preserved; duplicate Keys and any non-strict syntax are errors with line/column.
- Load via paste, drag-and-drop, file picker.
- Parse error view: editable raw text with line/column, retry.
- Tree: type badges, child counts, collapsed previews, 2 levels expanded, array range grouping above 100.
- Selection model and keyboard navigation (↑↓ ←→).

## Done when
- Parser tests cover: all JSON types, nesting, escapes/unicode, big integers and `1.0` keeping source text, duplicate Key error, trailing comma / comment errors with correct line/column.
- A ~500KB Document loads and navigates without noticeable lag.
