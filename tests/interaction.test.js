"use strict";

// DOM-level interaction tests, not a substitute for browser rendering tests.
// Install linkedom as a development dependency, or set LLS_DOM_MODULE_PATH
// to an installed linkedom package. Production files have no dependencies.
// Set LLS_APP_HTML to exercise a generated standalone index.html instead.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { parseHTML } = require(process.env.LLS_DOM_MODULE_PATH || "linkedom");
const dist = path.join(__dirname, "../dist");
const appHtml = path.resolve(process.env.LLS_APP_HTML || path.join(dist, "index.html"));
const EXAMPLE = [1, 2, -1, 2, 1, -1, 3, -1, 3];
const POINTS = [[1, 0], [1, 1], [-1, -2], [-1, -3], [2, 3], [-1, 0]];

function app({ clipboardMode = "success" } = {}) {
  const { window, document } = parseHTML(fs.readFileSync(appHtml, "utf8"));
  for (const input of document.querySelectorAll('input[type="checkbox"], input[type="radio"]')) {
    input.checked = input.hasAttribute("checked");
  }
  for (const input of document.querySelectorAll("input")) input.select = () => {};
  window.HTMLInputElement.prototype.select = function () {};
  const svg = document.getElementById("plot");
  // The test viewport maps SVG units to CSS pixels 1:1. Real browser CTM
  // and layout behavior must be verified separately in a browser.
  svg.getScreenCTM = () => ({ inverse: () => ({}) });
  svg.createSVGPoint = () => ({ x: 0, y: 0, matrixTransform() { return { x: this.x, y: this.y }; } });
  const captures = new Set();
  svg.setPointerCapture = id => captures.add(id);
  svg.hasPointerCapture = id => captures.has(id);
  svg.releasePointerCapture = id => captures.delete(id);
  let clipboard = "", download = null, downloadBlob = null, selectedText = "";
  window.HTMLTextAreaElement.prototype.select = function () { selectedText = this.value; };
  window.HTMLAnchorElement.prototype.click = function () { download = { name: this.download, href: this.href }; };
  const context = vm.createContext({
    window, document, console, Blob,
    navigator: clipboardMode === "missing" ? {} : { clipboard: { async writeText(text) {
      if (clipboardMode === "denied") throw new Error("Clipboard permission denied.");
      clipboard = text;
    } } },
    URL: { createObjectURL(blob) { downloadBlob = blob; return "blob:lls-test"; }, revokeObjectURL() {} },
    setTimeout: () => 0, clearTimeout: () => {},
  });
  for (const [index, script] of [...document.querySelectorAll("script")].entries()) {
    const name = script.getAttribute("src");
    const source = name ? fs.readFileSync(path.resolve(path.dirname(appHtml), name), "utf8") : script.textContent;
    vm.runInContext(source, context, { filename: name || `inline-${index}.js` });
  }
  const $ = id => document.getElementById(id);
  function fire(element, name, props = {}) {
    const event = new window.Event(name, { bubbles: true, cancelable: true });
    Object.assign(event, props);
    element.dispatchEvent(event);
  }
  const click = id => fire($(id), "click");
  const points = () => [...$("vertices").querySelectorAll("tr")].map(row =>
    [...row.querySelectorAll("input")].map(input => Number(input.value)));
  const sequence = () => $("sequence").value.replace(/[\[\]]/g, "").split(/[,;]\s*/).filter(Boolean).map(Number);
  function draw(text) { $("sequence").value = text; fire($("sequence-form"), "submit"); }
  function edit(index, axis, text) {
    const input = $("vertices").querySelector(`[data-vertex="${index}"][data-axis="${axis}"]`);
    input.value = text; fire(input, "change");
  }
  return { window, document, $, svg, fire, click, points, sequence, draw, edit,
    clipboard: () => clipboard, download: () => download, downloadBlob: () => downloadBlob,
    selectedText: () => selectedText };
}

function drawPointList(a, text) {
  a.$("point-list").value = text;
  a.fire(a.$("point-list"), "input");
  a.fire(a.$("point-list-form"), "submit");
}

test("default, canonical real input, dual, and explicit Draw dual", () => {
  const a = app();
  assert.deepEqual(a.points(), POINTS);
  assert.deepEqual(a.sequence(), EXAMPLE);
  a.click("compute-dual");
  assert.equal(a.$("dual-output").value, "[1; 2, -1, 3, -1, 1, 2, -1, 3]");
  assert.deepEqual(a.points(), POINTS, "Computing dual must not replace the original line.");
  a.draw("[0.2;1.2,1]");
  assert.deepEqual(a.sequence(), [.2, 1.2, 1], "Keep canonical input, avoiding a noisy determinant round trip.");
  a.click("compute-dual");
  assert.equal(a.$("dual-output").value, "[2.2; -0.8, 1]");
  a.click("draw-dual");
  assert.deepEqual(a.sequence(), [2.2, -.8, 1]);
  a.click("undo");
  assert.deepEqual(a.sequence(), [.2, 1.2, 1]);
});

test("manual edits preserve arbitrary coordinates and recompute LLS", () => {
  const a = app();
  a.click("compute-dual"); a.click("generate-tikz");
  a.edit(0, 0, "3/2");
  assert.deepEqual(a.points()[0], [1.5, 0]);
  assert.equal(a.sequence()[0], 1.5);
  assert.equal(a.$("dual-result").hidden, true);
  assert.equal(a.$("tikz-result").hidden, true);
  a.$("append-x").value = "-2.5"; a.$("append-y").value = "1/2";
  a.fire(a.$("append-form"), "submit");
  assert.deepEqual(a.points().at(-1), [-2.5, .5]);
  assert.equal(a.points().length, 7);
  assert.equal(a.sequence().length, 11);
  a.fire(a.document.querySelector('button[aria-label="Remove A₆"]'), "click");
  assert.equal(a.points().length, 6);
  a.click("undo");
  assert.deepEqual(a.points().at(-1), [-2.5, .5]);
});

test("undefined geometry stays editable, while zero angle terms remain supported", () => {
  const a = app();
  a.draw("[1;0,2]");
  assert.deepEqual(a.points(), [[1,0],[1,1],[1,3]]);
  assert.deepEqual(a.sequence(), [1,0,2]);
  assert.match(a.$("geometry-diagnostics").textContent, /collinear/);
  a.edit(1, 1, "0");
  assert.equal(a.points().length, 3);
  assert.equal(a.$("compute-dual").disabled, true);
  assert.equal(a.$("draw-combination").disabled, true);
  assert.equal(a.$("draw-reversed-combination").disabled, true);
  assert.match(a.$("geometry-diagnostics").textContent, /coincide/);
  assert.match(a.$("sequence-terms").textContent, /undefined/);
  a.click("generate-tikz");
  assert.match(a.$("tikz-output").value, /Signed LLS: \[0, undefined, 3\]/);
  a.edit(1, 1, "1");
  assert.deepEqual(a.sequence(), [1,0,2]);
});

test("invalid drafts and nonfinite fractions do not change geometry", () => {
  const a = app();
  a.draw("[1,2]");
  assert.equal(a.$("error-message").hidden, false);
  assert.deepEqual(a.points(), POINTS);
  a.edit(0, 0, "1/1e309");
  assert.equal(a.$("coordinate-error").hidden, false);
  a.click("copy");
  assert.deepEqual(JSON.parse(a.clipboard()), POINTS, "Invalid coordinate draft must not change committed geometry.");
});

test("numerically collapsed canonical input does not replace a usable line", () => {
  const a = app();
  a.draw("[1,10000000000000000,1]");
  assert.equal(a.$("error-message").hidden, false);
  assert.match(a.$("error-message").textContent, /precision/);
  assert.deepEqual(a.points(), POINTS);
});

test("click to append and pointer drag use stable coordinates and undo", () => {
  const a = app();
  a.click("new-line");
  assert.equal(a.points().length, 0);
  assert.equal(a.$("generate-tikz").disabled, true);
  // New-line viewport has center (0,0), scale 66, SVG center (380,310).
  a.fire(a.svg, "pointerdown", { button: 0, pointerId: 1, clientX: 446, clientY: 310 });
  assert.deepEqual(a.points(), [[1,0]]);
  assert.equal(a.$("generate-tikz").disabled, true);
  a.fire(a.svg, "pointerdown", { button: 0, pointerId: 1, clientX: 446, clientY: 244 });
  assert.deepEqual(a.points(), [[1,0],[1,1]]);
  assert.deepEqual(a.sequence(), [1]);
  const move = a.document.querySelector('input[name="edit-mode"][value="move"]');
  move.checked = true; a.fire(move, "change");
  const dot = a.svg.querySelector('.vertex-dot[data-point-index="0"]');
  a.fire(dot, "pointerdown", { button: 0, pointerId: 3, clientX: 446, clientY: 310 });
  a.fire(a.svg, "pointermove", { button: 0, pointerId: 3, clientX: 512, clientY: 310 });
  a.fire(a.svg, "pointerup", { button: 0, pointerId: 3, clientX: 512, clientY: 310 });
  assert.deepEqual(a.points(), [[2,0],[1,1]]);
  assert.deepEqual(a.sequence(), [2]);
  a.click("undo");
  assert.deepEqual(a.points(), [[1,0],[1,1]]);
  a.$("snap").checked = false;
  const dot2 = a.svg.querySelector('.vertex-dot[data-point-index="1"]');
  a.fire(dot2, "pointerdown", { button: 0, pointerId: 4, clientX: 446, clientY: 244 });
  a.fire(a.svg, "pointermove", { button: 0, pointerId: 4, clientX: 462.5, clientY: 227.5 });
  a.fire(a.svg, "pointerup", { button: 0, pointerId: 4, clientX: 462.5, clientY: 227.5 });
  assert.deepEqual(a.points(), [[1,0],[1.25,1.25]]);
});

test("TikZ is generated on demand, copied/downloaded, and invalidated by display changes", async () => {
  const a = app();
  assert.equal(a.$("tikz-result").hidden, true);
  a.click("generate-tikz");
  const tex = a.$("tikz-output").value;
  assert.match(tex, /\\coordinate \(A5\) at \(-1,0\)/);
  a.click("copy-tikz");
  await Promise.resolve();
  assert.equal(a.clipboard(), tex);
  a.click("download-tikz");
  assert.equal(a.download().name, "lls_broken_line.tex");
  assert.equal(await a.downloadBlob().text(), tex);
  a.$("labels").checked = false; a.fire(a.$("labels"), "change");
  assert.equal(a.$("tikz-result").hidden, true);
  a.click("generate-tikz");
  assert.doesNotMatch(a.$("tikz-output").value, /\$a_\{/);
});

test("degenerate formal dual is shown with drawing disabled", () => {
  const a = app();
  a.draw("[1;-1,3]");
  a.click("compute-dual");
  assert.equal(a.$("dual-output").value, "[1; 2, 0]");
  assert.equal(a.$("draw-dual").disabled, true);
  assert.match(a.$("dual-warnings").textContent, /zero edge/);
});

test("LLS plus dual draws the concatenated sequence, supports copy/TikZ, and undoes once", async () => {
  const a = app();
  const combined = [1, 2, -1, 2, 1, -1, 3, -1, 3, -1, 1, 2, -1, 3, -1, 1, 2, -1, 3];
  const text = "[1; 2, -1, 2, 1, -1, 3, -1, 3, -1, 1, 2, -1, 3, -1, 1, 2, -1, 3]";
  const points = [...POINTS, [-1, -1], [1, 2], [0, -1], [2, 3], [-1, 0]];
  assert.equal(a.$("combination-result").hidden, true);
  assert.equal(a.$("draw-combination").disabled, false);
  a.click("compute-dual"); a.click("generate-tikz");
  a.click("draw-combination");
  assert.deepEqual(a.sequence(), combined);
  assert.deepEqual(a.points(), points);
  assert.equal(a.$("combination-result").hidden, false);
  assert.equal(a.$("combination-output").value, text);
  assert.equal(a.$("dual-result").hidden, true);
  assert.equal(a.$("tikz-result").hidden, true);
  a.click("copy-combination");
  await Promise.resolve();
  assert.equal(a.clipboard(), text);
  a.click("generate-tikz");
  assert.ok(a.$("tikz-output").value.includes("% Signed LLS: [" + combined.join(", ") + "]"));
  assert.match(a.$("tikz-output").value, /\\coordinate \(A10\) at \(-1,0\)/);
  a.click("undo");
  assert.deepEqual(a.points(), POINTS);
  assert.deepEqual(a.sequence(), EXAMPLE);
  assert.equal(a.$("combination-result").hidden, true);
  assert.equal(a.$("undo").disabled, true, "A combination is exactly one undoable change.");
});

test("LLS plus dual handles singleton duals and retains exact real input coefficients", () => {
  const a = app();
  a.draw("[5]");
  a.click("draw-combination");
  assert.deepEqual(a.sequence(), [5, -1, 1, 3, 1]);
  assert.deepEqual(a.points(), [[1, 0], [1, 5], [0, 1], [-1, 0]]);
  a.draw("[0.2;1.2,1]");
  assert.equal(a.$("combination-result").hidden, true);
  a.click("draw-combination");
  assert.deepEqual(a.sequence(), [.2, 1.2, 1, -1, 2.2, -.8, 1]);
  assert.equal(a.$("combination-output").value, "[0.2; 1.2, 1, -1, 2.2, -0.8, 1]");
  a.click("generate-tikz");
  assert.match(a.$("tikz-output").value, /Signed LLS: \[0\.2, 1\.2, 1, -1, 2\.2, -0\.8, 1\]/);
});

test("a zero-edge dual shows the combination but preserves geometry and undo history", () => {
  const a = app();
  a.draw("[1;-1,3]");
  const before = a.points();
  a.click("draw-combination");
  assert.equal(a.$("combination-result").hidden, false);
  assert.equal(a.$("combination-output").value, "[1; -1, 3, -1, 1, 2, 0]");
  assert.match(a.$("combination-status").textContent, /zero edge/);
  assert.match(a.$("combination-status").textContent, /not changed/);
  assert.deepEqual(a.points(), before);
  assert.deepEqual(a.sequence(), [1, -1, 3]);
  a.click("undo");
  assert.deepEqual(a.points(), POINTS, "A failed combination must not add an Undo snapshot.");
  assert.equal(a.$("combination-result").hidden, true);
});

test("LLS plus dual uses freshly edited geometry and edits invalidate its result", () => {
  const a = app();
  a.draw("[1]");
  a.click("compute-dual");
  a.edit(0, 0, "2");
  assert.deepEqual(a.sequence(), [2]);
  assert.equal(a.$("draw-combination").disabled, false);
  a.click("draw-combination");
  assert.deepEqual(a.sequence(), [2, -1, 2]);
  assert.deepEqual(a.points(), [[1, 0], [1, 2], [-1, 0]]);
  a.click("undo");
  assert.deepEqual(a.points(), [[2, 0], [1, 1]], "Undo restores the user's actual coordinates.");
  a.click("draw-combination");
  a.edit(0, 0, "2");
  assert.equal(a.$("combination-result").hidden, true);
  assert.equal(a.$("combination-output").value, "");
});

test("LLS plus reversed dual draws the requested order and supports copy, TikZ, and one Undo", async () => {
  const a = app();
  const combined = [1, 2, -1, 2, 1, -1, 3, -1, 3, -1, 3, -1, 2, 1, -1, 3, -1, 2, 1];
  const text = "[1; 2, -1, 2, 1, -1, 3, -1, 3, -1, 3, -1, 2, 1, -1, 3, -1, 2, 1]";
  const points = [...POINTS, [-1, -3], [1, 1], [-1, -2], [0, 1], [-1, 0]];
  assert.equal(a.$("draw-reversed-combination").disabled, false);
  a.click("compute-dual"); a.click("generate-tikz");
  a.click("draw-reversed-combination");
  assert.deepEqual(a.sequence(), combined);
  assert.deepEqual(a.points(), points);
  assert.equal(a.$("combination-result").hidden, false);
  assert.equal(a.$("combination-output").value, text);
  assert.match(a.$("combination-status").textContent, /reversed dual/);
  assert.equal(a.$("dual-result").hidden, true);
  assert.equal(a.$("tikz-result").hidden, true);
  a.click("copy-combination");
  await Promise.resolve();
  assert.equal(a.clipboard(), text);
  a.click("generate-tikz");
  assert.ok(a.$("tikz-output").value.includes("% Signed LLS: [" + combined.join(", ") + "]"));
  assert.match(a.$("tikz-output").value, /\\coordinate \(A6\) at \(-1,-3\)/);
  a.click("undo");
  assert.deepEqual(a.points(), POINTS);
  assert.deepEqual(a.sequence(), EXAMPLE);
  assert.equal(a.$("combination-result").hidden, true);
  assert.equal(a.$("undo").disabled, true);
  a.click("draw-combination");
  assert.deepEqual(a.sequence(), [1, 2, -1, 2, 1, -1, 3, -1, 3, -1, 1, 2, -1, 3, -1, 1, 2, -1, 3],
    "The ordinary combination keeps the dual in its original order.");
});

test("reversed-dual concatenation preserves real coefficients and its actual endpoint", () => {
  const a = app();
  a.draw("[0.2;1.2,1]");
  a.click("draw-reversed-combination");
  assert.deepEqual(a.sequence(), [.2, 1.2, 1, -1, 1, -.8, 2.2]);
  assert.equal(a.$("combination-output").value, "[0.2; 1.2, 1, -1, 1, -0.8, 2.2]");
  const last = a.points().at(-1);
  // Exact rational recurrence gives (-389/125, -864/625), not (-1, 0).
  assert.ok(Math.abs(last[0] + 3.112) < 1e-12);
  assert.ok(Math.abs(last[1] + 1.3824) < 1e-12);
});

test("a reversed dual with a zero edge preserves geometry and Undo history", () => {
  const a = app();
  a.draw("[1;-1,3]");
  const before = a.points();
  a.click("draw-reversed-combination");
  assert.equal(a.$("combination-result").hidden, false);
  assert.equal(a.$("combination-output").value, "[1; -1, 3, -1, 0, 2, 1]");
  assert.match(a.$("combination-status").textContent, /zero edge/);
  assert.match(a.$("combination-status").textContent, /not changed/);
  assert.deepEqual(a.points(), before);
  assert.deepEqual(a.sequence(), [1, -1, 3]);
  a.click("undo");
  assert.deepEqual(a.points(), POINTS);
  assert.equal(a.$("undo").disabled, true);
});

test("reversed-dual concatenation uses fresh edited LLS and clears stale results", () => {
  const a = app();
  a.draw("[1;2,3]");
  a.click("compute-dual");
  a.edit(0, 0, "2");
  assert.deepEqual(a.sequence(), [2, 2.5, 3]);
  a.click("draw-reversed-combination");
  assert.deepEqual(a.sequence(), [2, 2.5, 3, -1, 1, 1, 2.5, 2, 1]);
  a.click("undo");
  assert.deepEqual(a.points(), [[2, 0], [1, 1], [7, 10]], "Undo restores the edited coordinate frame.");
  a.click("draw-reversed-combination");
  a.edit(0, 0, "2");
  assert.equal(a.$("combination-result").hidden, true);
  assert.equal(a.$("combination-output").value, "");
});

test("bulk coordinate input preserves the supplied frame, recomputes LLS, and undoes once", () => {
  const a = app();
  assert.deepEqual(JSON.parse(a.$("point-list").value), POINTS);
  drawPointList(a, "[(3/2, 0), (1, 1), (7, 1e1)]");
  const imported = [[1.5, 0], [1, 1], [7, 10]];
  assert.deepEqual(a.points(), imported, "Bulk coordinates are preserved even while lattice snapping is on.");
  assert.deepEqual(a.sequence(), [1.5, 7 / 3, 3]);
  assert.deepEqual(JSON.parse(a.$("point-list").value), imported);
  assert.equal(a.$("point-list-error").hidden, true);
  assert.equal(a.$("point-list").getAttribute("aria-invalid"), null);
  a.click("undo");
  assert.deepEqual(a.points(), POINTS);
  assert.deepEqual(a.sequence(), EXAMPLE);
  assert.deepEqual(JSON.parse(a.$("point-list").value), POINTS);
  assert.equal(a.$("undo").disabled, true, "Importing the whole list is exactly one undoable change.");
});

test("malformed bulk input retains its draft without changing geometry, exports, or Undo", () => {
  const a = app();
  a.click("compute-dual"); a.click("generate-tikz");
  const tex = a.$("tikz-output").value;
  const invalid = "[(1, 0), (2, 3, 4)]";
  drawPointList(a, invalid);
  assert.equal(a.$("point-list-error").hidden, false);
  assert.match(a.$("point-list-error").textContent, /not applied/);
  assert.equal(a.$("point-list").getAttribute("aria-invalid"), "true");
  assert.equal(a.$("point-list").value, invalid);
  assert.deepEqual(a.points(), POINTS);
  assert.deepEqual(a.sequence(), EXAMPLE);
  assert.equal(a.$("dual-result").hidden, false);
  assert.equal(a.$("tikz-output").value, tex);
  assert.equal(a.$("undo").disabled, true);
  a.click("use-current-points");
  assert.deepEqual(JSON.parse(a.$("point-list").value), POINTS);
  assert.equal(a.$("point-list-error").hidden, true);
  assert.equal(a.$("point-list").getAttribute("aria-invalid"), null);
  assert.equal(a.$("undo").disabled, true);
});

test("coordinate-list drafts survive geometry edits until the user reloads current vertices", () => {
  const a = app();
  a.edit(0, 0, "2");
  assert.deepEqual(JSON.parse(a.$("point-list").value), a.points());
  const draft = "[(9, 0), (9, 1)]";
  a.$("point-list").value = draft;
  a.fire(a.$("point-list"), "input");
  a.edit(0, 0, "3");
  const edited = a.points();
  assert.equal(a.$("point-list").value, draft);
  assert.match(a.$("point-list-status").textContent, /draft/i);
  a.click("use-current-points");
  assert.deepEqual(a.points(), edited);
  assert.deepEqual(JSON.parse(a.$("point-list").value), edited);
  a.click("undo");
  assert.deepEqual(a.points()[0], [2, 0], "Reloading the coordinate list must not add an Undo snapshot.");
  assert.deepEqual(JSON.parse(a.$("point-list").value), a.points());
  a.draw("[1]");
  assert.deepEqual(JSON.parse(a.$("point-list").value), [[1, 0], [1, 1]]);
});

test("copied vertex lists round-trip through bulk input and invalidate stale tool output", async () => {
  const a = app();
  a.click("copy");
  await Promise.resolve();
  const copied = a.clipboard();
  a.click("draw-combination");
  a.click("compute-dual"); a.click("generate-tikz");
  assert.equal(a.$("combination-result").hidden, false);
  assert.equal(a.$("dual-result").hidden, false);
  assert.equal(a.$("tikz-result").hidden, false);
  drawPointList(a, copied);
  assert.deepEqual(a.points(), POINTS);
  assert.deepEqual(a.sequence(), EXAMPLE);
  assert.equal(a.$("combination-result").hidden, true);
  assert.equal(a.$("dual-result").hidden, true);
  assert.equal(a.$("tikz-result").hidden, true);
  const extended = [...JSON.parse(copied), [-2, 1]];
  drawPointList(a, JSON.stringify(extended));
  assert.deepEqual(a.points(), extended);
  assert.equal(a.sequence().length, 11, "The list may add more vertices than the original line.");
});

test("bulk input retains finite degenerate geometry for editing and reports its LLS diagnostics", () => {
  const a = app();
  const imported = [[2, 0], [2, 0], [1, 1]];
  drawPointList(a, "2, 0\n2, 0\n1, 1");
  assert.deepEqual(a.points(), imported);
  assert.deepEqual(JSON.parse(a.$("point-list").value), imported);
  assert.equal(a.$("point-list-error").hidden, true);
  assert.match(a.$("geometry-diagnostics").textContent, /coincide/);
  assert.equal(a.$("compute-dual").disabled, true);
  a.edit(1, 1, "1");
  assert.equal(a.$("compute-dual").disabled, false);
  assert.deepEqual(JSON.parse(a.$("point-list").value), a.points());
});

test("vertex-name controls hide even or all names without changing geometry or LLS labels", () => {
  const a = app();
  const names = () => [...a.svg.querySelectorAll(".point-label")].map(node => node.textContent);
  const llsLabels = () => [...a.svg.querySelectorAll(".lls-tag text")].map(node => node.textContent);
  const allNames = ["A₀", "A₁", "A₂", "A₃", "A₄", "A₅"];
  const initialLLS = llsLabels();
  assert.deepEqual(names(), allNames);
  assert.equal(a.$("even-point-labels").disabled, false);
  a.$("even-point-labels").checked = false;
  a.fire(a.$("even-point-labels"), "change");
  assert.deepEqual(names(), ["A₁", "A₃", "A₅"]);
  assert.deepEqual(llsLabels(), initialLLS);
  assert.equal(a.svg.querySelectorAll(".vertex-dot").length, POINTS.length);
  assert.ok([...a.svg.querySelectorAll(".vertex-label")].some(node => node.textContent === "O"));
  a.$("point-labels").checked = false;
  a.fire(a.$("point-labels"), "change");
  assert.deepEqual(names(), []);
  assert.equal(a.$("even-point-labels").disabled, true);
  assert.deepEqual(llsLabels(), initialLLS);
  a.$("point-labels").checked = true;
  a.fire(a.$("point-labels"), "change");
  assert.equal(a.$("even-point-labels").disabled, false);
  assert.equal(a.$("even-point-labels").checked, false, "Re-enabling names preserves the even-name choice.");
  assert.deepEqual(names(), ["A₁", "A₃", "A₅"]);
  a.$("even-point-labels").checked = true;
  a.fire(a.$("even-point-labels"), "change");
  assert.deepEqual(names(), allNames);
  assert.deepEqual(a.points(), POINTS);
  assert.deepEqual(a.sequence(), EXAMPLE);
  assert.equal(a.$("undo").disabled, true, "Display changes must not create geometry history.");
});

test("TikZ follows independent point-name filters and invalidates an older export", () => {
  const a = app();
  a.click("generate-tikz");
  a.$("even-point-labels").checked = false;
  a.fire(a.$("even-point-labels"), "change");
  assert.equal(a.$("tikz-result").hidden, true);
  a.click("generate-tikz");
  let tex = a.$("tikz-output").value;
  for (const i of [0, 2, 4]) assert.ok(!tex.includes(`$A_{${i}}$`));
  for (const i of [1, 3, 5]) assert.ok(tex.includes(`$A_{${i}}$`));
  for (let i = 0; i < POINTS.length; i++) assert.ok(tex.includes(`\\coordinate (A${i})`));
  assert.match(tex, /\$a_\{0\}=/);
  a.$("point-labels").checked = false;
  a.fire(a.$("point-labels"), "change");
  assert.equal(a.$("tikz-result").hidden, true);
  a.click("generate-tikz");
  tex = a.$("tikz-output").value;
  assert.doesNotMatch(tex, /\$A_\{/);
  assert.match(tex, /\$a_\{0\}=/);
  a.$("labels").checked = false;
  a.fire(a.$("labels"), "change");
  a.$("point-labels").checked = true;
  a.fire(a.$("point-labels"), "change");
  a.click("generate-tikz");
  tex = a.$("tikz-output").value;
  assert.doesNotMatch(tex, /\$a_\{/);
  assert.ok(tex.includes("$A_{1}$"));
  assert.ok(!tex.includes("$A_{0}$"));
});

test("blocked or missing clipboard APIs expose selectable manual-copy text", async () => {
  // Let clipboard promises cross the host/VM boundary and finish their handlers.
  const settleClipboard = () => new Promise(resolve => setImmediate(resolve));
  for (const clipboardMode of ["denied", "missing"]) {
    const a = app({ clipboardMode });
    assert.equal(a.$("manual-copy").hidden, true);
    a.click("copy");
    await settleClipboard();
    assert.equal(a.$("manual-copy").hidden, false);
    const verticesText = JSON.stringify(POINTS, null, 2);
    assert.equal(a.$("manual-copy-text").value, verticesText);
    assert.equal(a.selectedText(), verticesText);
    assert.deepEqual(a.points(), POINTS);
    assert.deepEqual(a.sequence(), EXAMPLE);
    assert.equal(a.$("undo").disabled, true);
    a.click("close-manual-copy");
    assert.equal(a.$("manual-copy").hidden, true);
    a.click("generate-tikz");
    const tex = a.$("tikz-output").value;
    a.click("copy-tikz");
    await settleClipboard();
    assert.equal(a.$("manual-copy").hidden, false);
    assert.equal(a.$("manual-copy-text").value, tex);
    assert.equal(a.selectedText(), tex);
  }
  const available = app();
  available.$("manual-copy").hidden = false;
  available.click("copy");
  await settleClipboard();
  assert.equal(available.clipboard(), JSON.stringify(POINTS, null, 2));
  assert.equal(available.$("manual-copy").hidden, true, "Successful copy closes an older manual-copy panel.");
});
