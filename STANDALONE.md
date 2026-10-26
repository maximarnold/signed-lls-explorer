# Signed LLS Explorer — standalone edition

An interactive editor for signed length–sine (LLS) sequences and directed
broken lines, with the origin fixed at `O = (0, 0)`.

## Open and share

1. Unzip `signed-lls-explorer-standalone.zip`.
2. Open the `Signed-LLS-Explorer` folder.
3. Double-click **`index.html`**, or open it with your browser.

The application is contained in that one HTML file. It needs no installation,
server, account, internet connection, or external JavaScript libraries. You can
send the ZIP to collaborators, or send just `index.html` when they only need to
run the app. The ZIP also includes the editable source and the checks used
during development.

Entered coordinates and sequences are processed in the browser. The app does
not upload them to a server. Edits last for the current page session; reloading
returns to the example. Save work by copying the vertices or LLS sequence to a
text file, or by downloading a TikZ document.

Some browsers restrict automatic copying from local files. If a Copy button
cannot access the clipboard, the app presents a selectable text field so you
can copy manually with your usual keyboard shortcut.

## Draw and edit a line

### From an LLS sequence

Enter an odd-length sequence and choose **Draw from LLS**, for example:

```text
[1; 2, -1, 2, 1, -1, 3, -1, 3]
```

The canonical construction starts at `A0 = (1, 0)` and `A1 = (1, a0)`. A
sequence with `2m + 1` terms produces `m + 1` edges and `m + 2` vertices.
Even-indexed edge terms must be nonzero. Zero odd-indexed angle terms represent
collinear consecutive vertices and are allowed.

### From a coordinate list

The **Vertex coordinates** field accepts a complete ordered list:

```text
[(1, 0), (1, 1), (-1, -2), (-1, -3), (2, 3), (-1, 0)]
```

It also accepts JSON-style `[x, y]` pairs, or one comma-, space-, or
tab-separated pair per line. Decimal numbers, scientific notation, and
fractions such as `3/2` work. Supply at least two vertices and choose **Draw
from coordinates**. Their positions and order are preserved, and the app
computes their signed LLS sequence.

**Use current vertices** reloads the plotted points into the field. An
unfinished coordinate-list draft is retained while you edit the plot.

### With the mouse and coordinate table

- **Move vertices:** drag a point, or edit its x/y coordinates in the table.
- **Add vertices:** click the plot to append points in traversal order.
- **New line:** start an empty line.
- **Append a vertex:** enter one additional coordinate pair.
- The remove button beside a point removes it from the sequence.
- **Fit view:** show the line and origin at equal scale on both axes.
- **Undo:** restore the previous geometry. Applying a whole list or drawing a
  concatenation is one Undo operation.

Pointer snapping is optional. Entered coordinates always retain their real
values. Geometry with repeated consecutive points or an edge through the
origin remains editable, with diagnostics where an LLS term is undefined.

## Labels and display

In **Display & editing**:

- **Show LLS labels** controls the edge and angle coefficient annotations.
- **Show vertex names** controls all `A0`, `A1`, … point names.
- **Show even-indexed names** controls `A0`, `A2`, `A4`, … when vertex
  names are enabled. Turn this off to show only the odd-indexed names.
- **Show lattice** controls the grid.
- **Snap pointer to integer lattice** controls mouse placement and dragging.

Hiding names does not remove points or change their coordinates. TikZ exports
follow the label and grid choices.

## Duals and concatenations

**Compute dual** calculates `b = dual(a)` for the current plotted LLS.
**Draw dual** draws its canonical representative.

Two concatenations are available:

```text
Draw LLS + dual:
[a0; a1, ..., a2n, -1, b0, b1, ..., b2m]

Draw LLS + reversed dual:
[a0; a1, ..., a2n, -1, b2m, b(2m-1), ..., b0]
```

Reversing the dual changes its coefficient order and preserves its signs.
The result becomes the active line, can be copied, and can be exported to
TikZ. Use **Undo** before trying the other operation on the same original
sequence. A dual containing a zero edge term is displayed with an explanation
and cannot be drawn as a valid LLS line.

The finite adjacency-dual rules follow Definition 5.15 of O. Karpenkov's
*Geometry of Continued Fractions*. That definition applies to positive
integers; for signed or other real values, the app applies the same formulas
as a formal extension. It reports exceptional inputs where applying the
operation twice does not restore the original sequence.

## TikZ export

Choose **Generate TikZ**, then copy the code or select **Download .tex**.
The result is a complete LaTeX document using the current coordinates and
display settings. Editing the geometry or changing those settings invalidates
an earlier export, so generate it again afterward.

Running the app requires only a browser. Compiling the exported document
requires a separate LaTeX installation with the `standalone` class, TikZ, and
its `arrows.meta` and `decorations.markings` libraries.

## Numerical precision

Calculations use JavaScript `Number` arithmetic. Decimal calculations may
display tiny rounding residuals, such as `2.2e-16` in place of a mathematical
zero. Large or poorly conditioned inputs can lose more precision; detected
construction failures are reported. The app keeps explicitly entered LLS
coefficients separately from reconstructed coordinates so that the dual's
exact endpoint comparisons are not changed by an inverse numerical round trip.

## Package contents

| Path | Purpose |
| --- | --- |
| `index.html` | Self-contained runnable app; all styles and scripts are embedded. |
| `dist/` | Editable modular HTML, CSS, and JavaScript source. |
| `examples/` | Paste-ready example LLS sequences and coordinate lists. |
| `tests/` | Mathematical, parsing, export, and DOM interaction checks. |
| `tools/build_standalone.py` | Rebuilds the standalone HTML and ZIP using Python's standard library. |
| `DEVELOPER.md` | Additional source and mathematical documentation. |
| `SHA256SUMS.txt` | SHA-256 digests for the included files. |

## Edit or rebuild

Edit the files in `dist/`, then rebuild from this folder with Python 3.10 or
later. The output directory must be an absolute path:

```sh
python3 tools/build_standalone.py --output-dir /absolute/path/to/export
```

The command writes `signed-lls-explorer-standalone.zip` and an extracted
`Signed-LLS-Explorer` folder. Rebuilding into the same output directory replaces
those generated outputs. Scripts are embedded at the end of the HTML body in
their original order, so the app can initialize after its interface exists.

Optional developer checks require Node.js:

```sh
node tests/forward.test.js
node tests/math.test.js
node tests/point_input.test.js
node tests/tikz.test.js
```

The DOM interaction checks also need the development-only `linkedom` package:

```sh
npm install --no-save --ignore-scripts linkedom
node tests/interaction.test.js
```

These automated DOM checks simulate SVG coordinate transforms; they do not
verify a browser's visual layout or native pointer-capture behavior. The app
itself has no dependency on Node.js, Python, or `linkedom`.
