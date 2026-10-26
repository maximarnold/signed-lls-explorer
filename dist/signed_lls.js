"use strict";

/**
 * Reconstruct a broken line from a signed LLS sequence.
 *
 * Origin: O = (0, 0).
 * Initial vertices: A0 = (1, 0), A1 = (1, a[0]).
 *
 * For a = [a0, ..., a_(2m)], returns m + 2 vertices:
 * [A0, A1, ..., A_(m+1)]. There are m + 1 edges.
 * All coefficients must be finite JavaScript numbers. Even-indexed edge
 * terms must be nonzero. A zero odd-indexed angle term gives three
 * consecutive collinear vertices and is permitted for editable polylines.
 *
 * Recurrence, starting with d0 = (0, 1):
 *   d_k     = d_(k-1) + a_(2k-1) * A_k
 *   A_(k+1) = A_k + a_(2k) * d_k
 *
 * Uses ordinary Number arithmetic. Large integer calculations can lose
 * exactness; noninteger coefficients are subject to floating-point rounding.
 * Input is not modified. Each returned vertex is a separate [x, y] array.
 *
 * @param {number[]} a Nonempty signed LLS sequence of odd length.
 * @returns {number[][]} Vertices in traversal order, including both endpoints.
 *
 * @example
 * signedLLSToVertices([1, 2, -1, 2, 1, -1, 3, -1, 3]);
 * // [[1, 0], [1, 1], [-1, -2], [-1, -3], [2, 3], [-1, 0]]
 */
function signedLLSToVertices(a) {
  if (!Array.isArray(a) || a.length === 0 || a.length % 2 === 0) {
    throw new TypeError("The LLS sequence must be a nonempty array of odd length.");
  }
  for (let i = 0; i < a.length; i++) {
    if (!Number.isFinite(a[i])) {
      throw new TypeError("Every LLS coefficient must be a finite number.");
    }
    if (i % 2 === 0 && a[i] === 0) {
      throw new TypeError(`Edge term a${i} must be nonzero.`);
    }
  }

  let x = 1, y = a[0];           // Current vertex A1.
  let dx = 0, dy = 1;           // Initial direction d0.
  const vertices = [[1, 0], [x, y]];

  for (let i = 1; i < a.length; i += 2) {
    // Use the odd-indexed term to update the direction at the current vertex.
    dx += a[i] * x;
    dy += a[i] * y;

    // Use the following even-indexed term to construct the next vertex.
    x += a[i + 1] * dx;
    y += a[i + 1] * dy;

    if (![x, y, dx, dy].every(Number.isFinite)) {
      throw new RangeError("The construction overflowed JavaScript Number arithmetic.");
    }
    vertices.push([x, y]);
  }

  return vertices;
}

// Browser: load this file with a normal script tag, then call the function.
// Node.js (CommonJS): const { signedLLSToVertices } = require("./signed_lls.js");
if (typeof module !== "undefined" && module.exports) {
  module.exports = { signedLLSToVertices };
}
