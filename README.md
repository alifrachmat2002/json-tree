# JSON Tree

A local, in-browser viewer for inspecting, searching, editing and addressing parts of a JSON document. Nothing leaves your browser.

## Features

- **Load** by pasting, drag-and-drop, or file picker. Parse errors show the line and column in an editable raw view.
- **Tree view** with type badges, child counts, collapsed previews, and grouped ranges for large arrays.
- **Pinpointing**: click any node to see its path as breadcrumbs and copy it as a JavaScript accessor, JSONPath, or JSON Pointer. Paste a path to jump to its node.
- **Search** keys and values (case-insensitive) with highlighting and next/previous navigation.
- **Editing**: change values and types, rename keys, add and delete nodes, with undo/redo and markers for nodes edited since the last save.
- **Output**: copy the document, download as `.json`, or save in place (File System Access API where supported). Numbers are preserved byte-for-byte; key order is kept.
- **Persistence**: the document survives reloads via browser storage.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| ↑ / ↓ | Move selection |
| ← / → | Collapse / expand |
| Enter | Edit |
| Delete | Remove node |
| Ctrl+Z / Ctrl+Y | Undo / redo |
| `/` or Ctrl+F | Focus search |
| Ctrl+Shift+C | Copy path |

## Development

Requires Node.js.

```sh
npm install
npm run dev        # start the dev server
npm test           # run unit tests (Vitest)
npm run typecheck  # type-check only
npm run build      # type-check and build a static site into dist/
```

Built with Vite, React and TypeScript. The output in `dist/` is a static site that can be hosted anywhere, for example GitHub Pages.

## Project docs

- [CONTEXT.md](CONTEXT.md): domain vocabulary (Document, Node, Path, Baseline, ...)
- [docs/adr/](docs/adr/): architecture decisions
- [.scratch/json-tree/spec.md](.scratch/json-tree/spec.md): full spec
