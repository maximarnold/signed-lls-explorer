"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {analyzeVertices, adjacencyDual} = require("../dist/lls_math.js");
const {signedLLSToVertices} = require("../dist/signed_lls.js");

const EXAMPLE = [1, 2, -1, 2, 1, -1, 3, -1, 3];
const POINTS = [[1, 0], [1, 1], [-1, -2], [-1, -3], [2, 3], [-1, 0]];
function near(a, b, tolerance = 2e-12) {
  assert.equal(a.length, b.length);
  a.forEach((v, i) => assert.ok(v === b[i] || Math.abs(v - b[i]) <= tolerance * Math.max(Math.abs(v), Math.abs(b[i])), `${v} != ${b[i]} at ${i}`));
}

test("inverse reproduces the original signed example and preserves its vertices", () => {
  const copy = POINTS.map(p => [...p]);
  const result = analyzeVertices(copy);
  assert.deepEqual(result.sequence, EXAMPLE);
  assert.equal(result.valid, true);
  assert.equal(result.nondegenerate, true);
  assert.deepEqual(copy, POINTS);
});

test("inverse accepts arbitrary initial vertices and real coordinates", () => {
  assert.deepEqual(analyzeVertices([[2, 1], [3, 4], [5, 2]]).sequence, [5, -4 / 35, -14]);
  assert.deepEqual(analyzeVertices([[.5, 0], [.5, 2], [-.5, 1]]).sequence, [1, -4 / 3, 1.5]);
});

test("forward/inverse round trips include signs, short lines, and fractional terms", () => {
  for (const a of [[1], [-2], [2, -3, 4, 1, -2], [.5, -1.5, 2.5, -2, 1.5], EXAMPLE]) {
    near(analyzeVertices(signedLLSToVertices(a)).sequence, a);
  }
});

test("orientation reversal and scaling have the determinant-prescribed effects", () => {
  near(analyzeVertices([...POINTS].reverse()).sequence, [...EXAMPLE].reverse().map(v => -v));
  near(analyzeVertices(POINTS.map(p => p.map(v => v * 2))).sequence, EXAMPLE.map((v, i) => i % 2 ? v / 4 : v * 4));
});

test("zero-angle collinearity is representable and marked nondegenerate=false", () => {
  const result = analyzeVertices([[1, 0], [1, 1], [1, 2]]);
  assert.deepEqual(result.sequence, [1, 0, 1]);
  assert.equal(result.valid, true);
  assert.equal(result.nondegenerate, false);
  assert.equal(result.issues[0].kind, "collinear");
});

test("undefined origin edges and duplicate vertices remain explicit", () => {
  const originEdge = analyzeVertices([[1, 1], [2, 2], [1, 2]]);
  assert.deepEqual(originEdge.sequence, [0, null, 2]);
  assert.equal(originEdge.valid, false);
  assert.equal(originEdge.issues[0].kind, "origin-edge");
  const repeated = analyzeVertices([[1, 0], [1, 0], [1, 1]]);
  assert.deepEqual(repeated.sequence, [0, null, 1]);
  assert.equal(repeated.issues[0].kind, "duplicate-vertices");
});

test("insufficient, nonfinite, and overflowing geometry is reported", () => {
  assert.equal(analyzeVertices([[1, 0]]).issues[0].kind, "insufficient-vertices");
  assert.equal(analyzeVertices([[1, 0], [Infinity, 1]]).issues[0].kind, "invalid-coordinate");
  assert.equal(analyzeVertices([[1, 0], Array(2)]).issues[0].kind, "invalid-coordinate");
  const overflow = analyzeVertices([[1e308, 0], [0, 1e308]]);
  assert.deepEqual(overflow.sequence, [null]);
  assert.equal(overflow.valid, false);
  assert.equal(overflow.issues[0].kind, "numeric-overflow");
});

test("small and large coordinate scales do not overflow the angle denominator unnecessarily", () => {
  for (const scale of [1e-90, 1e90]) {
    const result = analyzeVertices(POINTS.slice(0, 3).map(p => p.map(v => v * scale)));
    assert.equal(result.valid, true);
    near(result.sequence, [scale * scale, 2 / (scale * scale), -scale * scale]);
  }
});

test("safe integer coordinates retain small determinants despite large cancelling products", () => {
  const a = [1, 100000000, 1, 1, 1];
  const points = signedLLSToVertices(a);
  assert.deepEqual(points, [[1, 0], [1, 1], [100000001, 100000002], [300000002, 300000005]]);
  const result = analyzeVertices(points);
  assert.equal(result.valid, true);
  assert.deepEqual(result.sequence, a);
});

test("angle differences are exact even when safe coordinates differ by more than the safe range", () => {
  const n = Number.MAX_SAFE_INTEGER;
  const points = [[-n, -n + 1], [n - 1, n - 2], [-n + 2, -n + 3]];
  assert.ok(points.flat().every(Number.isSafeInteger));
  assert.ok(!Number.isSafeInteger(points[0][0] - points[1][0]));
  const result = analyzeVertices(points);
  assert.equal(result.valid, true);
  assert.equal(result.nondegenerate, true);
  assert.deepEqual(result.sequence, [1, -4, 1]);
});

test("all finite Definition 5.15 endpoint cases and special singletons", () => {
  const cases = [
    [[1], [1]],
    [[2], [2]],
    [[5], [1, 3, 1]],
    [[1, 3, 1], [5]],
    [[1, 2, 3, 4, 1], [5, 3, 3]],
    [[3, 2, 4, 5, 1], [6, 4, 2, 2, 1]],
    [[1, 2, 3, 4, 5], [1, 4, 4, 3, 3]],
    [[3, 2, 4, 5, 6], [1, 5, 5, 4, 2, 2, 1]],
    [[3, 4, 1], [5, 2, 1]],
    [[1, 4, 3], [1, 2, 5]],
    [[3, 4, 5], [1, 4, 4, 2, 1]]
  ];
  for (const [a, expected] of cases) {
    const result = adjacencyDual(a);
    assert.deepEqual(result.sequence, expected);
    assert.equal(result.domain, "positive-integer");
    assert.equal(result.canDraw, true);
    assert.equal(result.isInvolutive, true);
    assert.deepEqual(adjacencyDual(expected).sequence, a);
  }
});

test("the original signed example has the formal real dual requested", () => {
  const expected = [1, 2, -1, 3, -1, 1, 2, -1, 3];
  const result = adjacencyDual(EXAMPLE);
  assert.deepEqual(result.sequence, expected);
  assert.equal(result.domain, "formal-real");
  assert.equal(result.canDraw, true);
  assert.equal(result.isInvolutive, true);
  assert.deepEqual(adjacencyDual(expected).sequence, EXAMPLE);
});

test("fractional coefficients use the same algebraic endpoint rules", () => {
  const a = [.5, 1.25, 2.5];
  assert.deepEqual(adjacencyDual(a).sequence, [1, 1.5, 1.25, -.5, 1]);
  assert.equal(adjacencyDual(a).isInvolutive, true);
  near(adjacencyDual(adjacencyDual(a).sequence).sequence, a);
});

test("signed exceptional collisions are not falsely described as an involution", () => {
  const result = adjacencyDual([1, -1, 1]);
  assert.deepEqual(result.sequence, [1]);
  assert.equal(result.isInvolutive, false);
  assert.ok(result.warnings.some(s => s.includes("does not recover")));
  assert.equal(adjacencyDual([1, 0, 3]).isInvolutive, false);
});

test("formal duals with zero edges are shown but cannot be drawn as LLS lines", () => {
  const result = adjacencyDual([1, -1, 3]);
  assert.deepEqual(result.sequence, [1, 2, 0]);
  assert.equal(result.canDraw, false);
  assert.ok(result.warnings.some(s => s.includes("zero edge")));
  assert.throws(() => adjacencyDual(result.sequence), RangeError);
});

test("invalid dual inputs and malformed sparse arrays are rejected", () => {
  for (const a of [[], [1, 2], [1, NaN, 2], [Infinity], [1, "2", 3], Array(1)]) {
    assert.throws(() => adjacencyDual(a), TypeError);
  }
  assert.throws(() => adjacencyDual([0]), RangeError);
  assert.throws(() => adjacencyDual([1, 2, 0]), RangeError);
});
