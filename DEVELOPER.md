# Signed LLS Explorer

A buildless browser app for constructing and editing directed broken lines
relative to the fixed origin `O = (0, 0)`.

## Using the app

- **Draw from LLS** constructs the canonical representative starting at
  `A0 = (1, 0)` and `A1 = (1, a0)`. A sequence of `2m + 1` terms specifies
  `m + 1` edges and `m + 2` vertices. Decimal and fraction inputs are accepted.
- **Vertex coordinates**, directly below the LLS input, accepts a complete
  ordered list such as `[(1, 0), (1, 1), (-1, -2)]`, JSON-style `[x, y]` pairs,
  or one `x, y` / `x y` pair per line or semicolon. Decimal, fraction, and
  scientific notation inputs are supported. **Draw from coordinates** replaces
  the line with at least two supplied vertices, preserves their coordinate
  frame, computes the signed LLS, and is one Undo operation. Invalid syntax
  leaves the current geometry untouched; finite degenerate geometry remains
  editable with the existing diagnostics.
- The coordinate-list field mirrors the current vertices until edited. An
  unapplied list stays in place while the plot changes. **Use current vertices**
  discards that draft and reloads the plotted coordinates without altering
  geometry. The existing vertex Copy output can be pasted into this field.
- **Move vertices** allows pointer dragging. **Add vertices** appends clicked
  positions in traversal order. **New line** starts an empty editable line.
- Coordinate fields support real numbers and fractions. Commit with Enter or
  by leaving the field. The append form and remove buttons change the sequence
  of vertices. Pointer snapping is optional; manual coordinates are not snapped.
- **Undo** restores geometry and its construction mode. **Fit view** adjusts
  the equal-scale coordinate viewport. Dragging preserves the viewport.
- **Show vertex names** controls the labels A0, A1, and so on. **Show even-indexed
  names** can hide only A0, A2, A4, and so on while odd-indexed names remain.
  These controls are independent of LLS annotations and apply to both the plot
  and TikZ export. Point markers, coordinates, and the origin remain present.
- **Compute dual** applies the finite endpoint rules of Definition 5.15.
  Computing the dual preserves the current geometry. **Draw dual** explicitly
  constructs its canonical representative, when its edge terms are nonzero.
- **Draw LLS + dual** computes `b = dual(a)` from the current plotted LLS and
  draws the canonical line for `[...a, -1, ...b]`. The inserted `-1` is an
  angle term. The complete combination is shown with a copy button; it also
  becomes the current sequence for editing and TikZ export. **Undo** restores
  the previous geometry. If the dual has a zero edge term or the construction
  exceeds usable numerical precision, the combination is shown with an
  explanation and the previous geometry is preserved.
- **Draw LLS + reversed dual** computes the same `b = dual(a)`, reverses its
  coefficient order without changing signs, and draws the canonical line for
  `[...a, -1, ...b.slice().reverse()]`. It shares the combination output, Copy,
  Undo, and TikZ workflow. Both concatenation buttons always act on the current
  plotted LLS; use Undo before comparing the two operations on the same input.
  The reversed version can have a different endpoint from the ordinary
  combination, and its endpoint is computed by the full recurrence.
- **Generate TikZ** creates a complete standalone LaTeX document on demand.
  Copy or download the `.tex` file. It uses the current vertices, labels, and
  grid options; editing invalidates an earlier export.

## Mathematical conventions

For consecutive vertices, the signed edge terms are

`a[2k] = det(A[k], A[k+1])`.

At an interior vertex, the signed angle term is

`a[2k-1] = det(A[k-1]-A[k], A[k+1]-A[k]) / (a[2k-2] * a[2k])`.

Point edits preserve the supplied coordinates. Supporting lines through the
origin give zero edge determinants and undefined neighboring angle terms;
these geometries remain editable, with diagnostics. Collinear triples with
nonzero edge determinants have a finite zero angle term and remain supported.

The forward recurrence starts with `d0 = (0, 1)` and uses

`d[k] = d[k-1] + a[2k-1] * A[k]`,

`A[k+1] = A[k] + a[2k] * d[k]`.

Canonical input coefficients are retained separately from floating-point
inverse calculations. This matters because the adjacency-dual endpoint
rules distinguish an endpoint exactly equal to `1`.

The source is O. Karpenkov, *Geometry of Continued Fractions*, Definition 15.7
(p. 182) and Definition 5.15 (p. 65). Definition 5.15
establishes the adjacency dual for positive integers. For other real or signed
terms, the app applies the same finite formulas as a formal extension. It
reports zero-edge results and cases where applying the operation twice does
not recover the original sequence.

## Files

- `dist/signed_lls.js`: forward construction.
- `dist/lls_math.js`: inverse calculation and adjacency dual.
- `dist/point_input.js`: shared number and bulk coordinate-list parsing.
- `dist/tikz.js`: standalone TikZ document generation.
- `dist/app.js`, `dist/index.html`, `dist/style.css`: browser interface.
- `tests/`: mathematical, export, and DOM interaction regressions.

Production has no external runtime dependencies or network requests beyond
loading these static files. Serve the repository root with GitHub Pages, or serve `dist/` directly during development.

## Standalone distribution

Run `python3 tools/build_standalone.py --output-dir /absolute/output/path` to
create `signed-lls-explorer-standalone.zip`. The archive includes a self-contained
`index.html`, the editable static source, tests, examples, and collaborator
instructions. Its top-level HTML file runs directly in a browser without a
server, account, installation, or internet connection. See `STANDALONE.md`.

When a browser blocks automatic clipboard access, Copy buttons show a selected
text area for manual copying. Downloading TikZ remains a local browser action.

## Validation

Run the pure tests with Node:

```sh
node tests/forward.test.js
node tests/math.test.js
node tests/point_input.test.js
node tests/tikz.test.js
```

The interaction test uses the development-only `linkedom` package:

```sh
npm install --no-save --ignore-scripts linkedom
node tests/interaction.test.js
```

Alternatively set `LLS_DOM_MODULE_PATH` to an already-installed `linkedom`
package. These tests dispatch DOM events for coordinate edits, click/drag,
undo, dual and combination actions, and TikZ copy/download. They simulate the
SVG coordinate transform and do not verify actual browser layout or
pointer-capture behavior.

Generated documents require a LaTeX installation containing `standalone`,
`tikz`, `arrows.meta`, and `decorations.markings`. Compilation could not be
tested in the creation environment because the installed TeX formats and
packages were unavailable.
