# Custom parser that preserves number text and rejects duplicate Keys

We parse Documents with our own JSON parser instead of `JSON.parse`. It keeps each number's original source text, so a value like `12345678901234567890` or `1.0` that the user never edited is written back byte-identical (apart from re-indentation) rather than being rounded or normalised. The same parser rejects duplicate Keys within an object as a parse error, because `JSON.parse` silently keeps the last one, and a duplicate Key would make a Path ambiguous.

## Consequences

- Nodes cannot be plain JS values. A number Node carries its source text, and editing that Node is the only thing that replaces the text.
- String values and Keys likewise carry their source text (including escapes such as `\/` or `é`); an edited or renamed one is re-encoded canonically.
- Export goes through our own serialiser, not `JSON.stringify`.
