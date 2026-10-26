"use strict";
const assert = require("node:assert/strict");
const { toTikz } = require("../dist/tikz.js");

const points = [[1,0],[1,1],[-1,-2],[-1,-3],[2,3],[-1,0]];
const sequence = [1,2,-1,2,1,-1,3,-1,3];
const before = JSON.stringify({ points, sequence });
const tex = toTikz(points, sequence);
assert.match(tex, /\\documentclass\[tikz,border=5pt\]\{standalone\}/);
assert.match(tex, /\\coordinate \(A5\) at \(-1,0\);/);
assert.equal((tex.match(/\\draw\[edge,directed\]/g) || []).length, 5);
assert.equal((tex.match(/\$a_\{/g) || []).length, 9);
assert.match(tex, /\$a_\{5\}=-1\$/);
assert.match(tex, /\\end\{document\}\n$/);
assert.equal(JSON.stringify({ points, sequence }), before, "Export must not mutate inputs.");

const noDecorations = toTikz(points, sequence, { showGrid: false, showLabels: false });
assert.doesNotMatch(noDecorations, / grid /);
assert.doesNotMatch(noDecorations, /\$a_\{/);
assert.doesNotMatch(noDecorations, /\$A_\{/);
assert.match(noDecorations, /\\coordinate \(A5\)/);

const vertexNames = output => [...output.matchAll(/\{\$A_\{(\d+)\}\$\}/g)].map(match => Number(match[1]));
assert.deepEqual(vertexNames(tex), [0, 1, 2, 3, 4, 5], "All vertex names are visible by default.");
const oddNames = toTikz(points, sequence, { showEvenPointLabels: false });
assert.deepEqual(vertexNames(oddNames), [1, 3, 5]);
assert.equal((oddNames.match(/\$a_\{/g) || []).length, 9, "Even vertex names and even LLS terms are independent.");
assert.equal((oddNames.match(/\\filldraw\[vertex\]/g) || []).length, 6, "Hiding names must preserve every point marker.");
assert.deepEqual(oddNames.match(/^  \\coordinate \(A.*$/gm), tex.match(/^  \\coordinate \(A.*$/gm));
assert.deepEqual(oddNames.match(/^  \\draw\[edge.*$/gm), tex.match(/^  \\draw\[edge.*$/gm));
assert.match(oddNames, /\{\$O\$\}/, "The origin label remains visible.");

const noPointNames = toTikz(points, sequence, { showPointLabels: false });
assert.deepEqual(vertexNames(noPointNames), []);
assert.equal((noPointNames.match(/\$a_\{/g) || []).length, 9, "LLS labels remain when vertex names are hidden.");
const onlyPointNames = toTikz(points, sequence, { showLabels: false, showPointLabels: true });
assert.deepEqual(vertexNames(onlyPointNames), [0, 1, 2, 3, 4, 5], "Explicit vertex visibility overrides the legacy default.");
assert.doesNotMatch(onlyPointNames, /\$a_\{/);
const onlyOddNames = toTikz(points, sequence, { showLabels: false, showPointLabels: true, showEvenPointLabels: false });
assert.deepEqual(vertexNames(onlyOddNames), [1, 3, 5]);
assert.doesNotMatch(onlyOddNames, /\$a_\{/);

const fractional = toTikz([[1,0],[1,.25],[-.5,1.125]], [.25,-1.2,1.25]);
assert.match(fractional, /\\coordinate \(A2\) at \(-0.5,1.125\);/);
assert.match(fractional, /\$a_\{1\}=-1.2\$/);
assert.match(fractional, /\$a_\{2\}=1.25\$/);
const straightAngle = toTikz([[1,0],[1,.25],[1,.75]], [.25,0,.5]);
assert.match(straightAngle, /\$a_\{1\}=0\$/);

const invalidLLS = toTikz([[1,0],[2,0],[3,1]], [0,null,2]);
assert.doesNotMatch(invalidLLS, /\$a_\{1\}/);
assert.match(invalidLLS, /% Signed LLS: \[0, undefined, 2\]/);
const duplicate = toTikz([[1,0],[1,0]], null);
assert.match(duplicate, /\\draw\[edge\] \(A0\) -- \(A1\);/);

const huge = toTikz([[1e100,0],[1e100,-1e100]], [-1e200]);
assert.match(huge, /uniform normalization/);
assert.match(huge, /\\coordinate \(A0\) at \(1,0\);/);
assert.match(huge, /\\coordinate \(A1\) at \(1,-1\);/);
assert.doesNotMatch(huge, /\(NaN|\(Infinity/);
const tiny = toTikz([[1e-100,0],[1e-100,1e-100]], [1e-200]);
assert.match(tiny, /\\coordinate \(A1\) at \(1,1\);/);
assert.match(tiny, /\\times 10\^\{-200\}/);
const exactInteger = toTikz([[9007199254740991,0],[9007199254740991,1]]);
assert.match(exactInteger, /% Original A0 = \(9007199254740991, 0\)/);
const exactDecimal = toTikz([[1,0],[1,0.10000000000000002]]);
assert.match(exactDecimal, /\\coordinate \(A1\) at \(1,0.10000000000000002\);/);

for (const badPoints of [[], [[1,0]], [[1,0],[Infinity,0]], [[1,0],[1,"\\input{secret}"]]]) {
  assert.throws(() => toTikz(badPoints), TypeError);
}
assert.throws(() => toTikz(points, [1]), TypeError);
assert.throws(() => toTikz([[1,0],[1,1]], [NaN]), TypeError);
assert.throws(() => toTikz(points, sequence, null), TypeError);
console.log("TikZ tests passed: geometry, independent vertex/LLS labels, even-indexed name filtering, signed/fractional labels, zero angles, normalization, validation, and nonmutation.");
