"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {parseNumber, parsePoints} = require("../dist/point_input.js");

test("shared numeric parser retains decimal, fraction, exponent, and signed-zero behavior", () => {
  assert.equal(parseNumber(" −3 / 2 "), -1.5);
  assert.equal(parseNumber("+.25E+2"), 25);
  assert.equal(parseNumber("2e-3/-4"), -.0005);
  assert.equal(parseNumber("1."), 1);
  assert.equal(Object.is(parseNumber("-0"), -0), false);
  for (const value of ["1/0", "0/0", "1/1e309", "1e309/1", "Infinity", "NaN", "2+3", "1/2/3", "", "--1"]) {
    assert.throws(() => parseNumber(value), Error, value);
  }
});

test("complete JSON, parenthesized, and bare pair lists preserve order and coordinates", () => {
  const expected = [[1, 0], [1, 1], [-1, -2]];
  for (const value of [
    "[[1,0],[1,1],[-1,-2]]",
    "[(1,0), (1,1), (-1,-2)]",
    "(1,0), (1,1), (-1,-2)",
    "[1,0]; [1,1]; [-1,-2]",
    "(1 0)\n[1 1]\n(-1 -2)",
    JSON.stringify(expected, null, 2)
  ]) assert.deepEqual(parsePoints(value), expected, value);
});

test("spreadsheet columns and one pair per line or semicolon are supported", () => {
  const expected = [[1.5, .25], [-2, .003], [0, -4]];
  for (const value of [
    "1.5,.25\n-2,3e-3\n0,-4",
    "1.5\t.25\r\n-2\t3e-3\r\n0\t-4",
    "1.5 .25; -2 3e-3; 0 -4",
    "\n1.5,.25\n\n-2,3e-3; 0,-4\n"
  ]) assert.deepEqual(parsePoints(value), expected, value);
});

test("fractions and Unicode minus work inside both list styles", () => {
  const expected = [[1.5, -.25], [2, .003]];
  assert.deepEqual(parsePoints("[(3 / 2, −1/4), (4/2, 3e-3)]"), expected);
  assert.deepEqual(parsePoints("3 / 2 −1/4\n4/2 3e-3"), expected);
});

test("finite duplicates, origin vertices, and tiny coordinates are not rejected as geometry", () => {
  const expected = [[0, 0], [0, 0], [1e-100, -1e100]];
  assert.deepEqual(parsePoints(JSON.stringify(expected)), expected);
});

test("pair counts and complete input syntax are validated without guessing", () => {
  for (const value of [
    "", "[]", "[1,0]", "1,0", "(1,0)",
    "1,0,1,1", "1 0 1 1", "[[1,0,2],[1,1]]", "[(1),(1,1)]",
    "[[1,0],[1,1]", "[(1,0],(1,1)]", "[[1,0],[1,1])",
    "[[1,0],[1,1]] junk", "junk (1,0), (1,1)",
    "(1,0)(1,1)", "(1,0),", "[(1,0),(1,1),]",
    "[(1,0),,(1,1)]", "[(1,0), [1,1]]]", "(1,0), alert(1)",
    "((1,0),(1,1))", "(1,,0),(1,1)"
  ]) assert.throws(() => parsePoints(value), Error, value);
});

test("numeric errors identify the offending pair and coordinate", () => {
  assert.throws(() => parsePoints("[(1,0),(1/0,2)]"), /Pair 2, x:.*denominator zero/);
  assert.throws(() => parsePoints("1,0\n2,1/1e309"), /Pair 2, y:.*both be finite/);
  assert.throws(() => parsePoints("[(1,0),(Infinity,2)]"), /Pair 2, x:/);
  assert.throws(() => parsePoints("[(1,0),(2,NaN)]"), /Pair 2, y:/);
});
