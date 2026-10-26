"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { signedLLSToVertices } = require("../dist/signed_lls.js");
const { analyzeVertices } = require("../dist/lls_math.js");

test("editable collinear vertices reconstruct from a zero angle term", () => {
  const points = signedLLSToVertices([1, 0, 2]);
  assert.deepEqual(points, [[1, 0], [1, 1], [1, 3]]);
  const inverse = analyzeVertices(points);
  assert.deepEqual(inverse.sequence, [1, 0, 2]);
  assert.equal(inverse.valid, true);
  assert.equal(inverse.nondegenerate, false);
});

test("real signed reconstruction keeps its initial vertices and all coefficients", () => {
  const input = [-0.5, 0, -2, 1.25, 4];
  const points = signedLLSToVertices(input);
  assert.deepEqual(points.slice(0, 2), [[1, 0], [1, -0.5]]);
  assert.equal(points.length, 4);
  assert.deepEqual(analyzeVertices(points).sequence, input);
});

test("zero edges, malformed arrays, and numerical overflow are rejected", () => {
  for (const input of [[0], [1, 2, 0], [1, 2], [1, NaN, 2], Array(1)]) {
    assert.throws(() => signedLLSToVertices(input), TypeError);
  }
  assert.throws(() => signedLLSToVertices([1, 1e308, 2]), RangeError);
});
