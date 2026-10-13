# JSON Tree

A local, in-browser viewer for inspecting, searching, editing and addressing parts of a JSON document.

## Language

**Document**:
The single JSON value currently loaded into the viewer.
_Avoid_: File, data, payload

**Node**:
Any value at a position in the Document: an object, array, or primitive (string, number, boolean, null). Selecting a Key or its value selects the same Node.
_Avoid_: Element, item, entry, field

**Key**:
The property name under which an object holds a child Node.
_Avoid_: Property name, field name

**Index**:
The numeric position at which an array holds a child Node.

**Path**:
The address of a Node from the root of the Document, rendered in one of several Path Formats.
_Avoid_: Object notation, selector, location

**Path Format**:
A syntax for writing a Path, such as JavaScript accessor (`data.users[0]["first-name"]`), JSONPath (`$.users[0]['first-name']`) or JSON Pointer (`/users/0/first-name`).
_Avoid_: Notation, style

**Baseline**:
The version of the Document as last loaded or saved, against which edits are measured.
_Avoid_: Original, snapshot

**Edited Node**:
A Node whose value differs from the Baseline, or an object/array whose children were removed relative to the Baseline.
_Avoid_: Dirty node, changed node
