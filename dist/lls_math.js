"use strict";

/**
 * Signed LLS mathematics, with O fixed at (0, 0).
 * Source conventions: Karpenkov, Geometry of Continued Fractions,
 * Definition 15.7 (p. 182) and the finite cases of Definition 5.15 (p. 65).
 *
 * Definition 5.15 is a theorem-backed duality for positive integers.
 * Applying its endpoint formulas to other real coefficients is a formal
 * extension; the result can contain zero edges or fail to be involutive.
 */
var LLSMath = (() => {
  const cleanZero = value => Object.is(value, -0) ? 0 : value;

  function determinant(u, v) {
    if ([u[0], u[1], v[0], v[1]].every(Number.isSafeInteger)) {
      return Number(BigInt(u[0]) * BigInt(v[1]) - BigInt(u[1]) * BigInt(v[0]));
    }
    return cleanZero(u[0] * v[1] - u[1] * v[0]);
  }

  function angleNumerator(previous, current, next) {
    if ([...previous, ...current, ...next].every(Number.isSafeInteger)) {
      // Subtract after conversion: differences of two safe coordinates can
      // themselves exceed the safe-integer range, even when the final
      // determinant is a small exact integer.
      const ux = BigInt(previous[0]) - BigInt(current[0]);
      const uy = BigInt(previous[1]) - BigInt(current[1]);
      const vx = BigInt(next[0]) - BigInt(current[0]);
      const vy = BigInt(next[1]) - BigInt(current[1]);
      return Number(ux * vy - uy * vx);
    }
    return determinant(
      [previous[0] - current[0], previous[1] - current[1]],
      [next[0] - current[0], next[1] - current[1]]
    );
  }

  function issue(kind, message, details = {}) {
    return { kind, message, ...details };
  }

  // Avoid overflowing or underflowing the product of two otherwise usable
  // edge determinants when the final angle coefficient is representable.
  function divideByProduct(numerator, a, b) {
    const product = a * b;
    if (Number.isFinite(product) && product !== 0) return numerator / product;
    return Math.abs(a) >= Math.abs(b)
      ? (numerator / a) / b
      : (numerator / b) / a;
  }

  /**
   * Analyze an ordered list of [x, y] vertices without modifying it.
   * Returns {sequence, edges, issues, valid, nondegenerate}.
   *
   * valid means every edge determinant is nonzero and all LLS coefficients
   * can be computed as finite Numbers. A straight interior vertex gives an
   * angle term of 0: valid=true, nondegenerate=false. Undefined coefficients
   * are null. Invalid editable geometry is reported, never silently removed.
   */
  function analyzeVertices(points) {
    const issues = [];
    if (!Array.isArray(points) || points.length < 2) {
      return {
        sequence: [], edges: [], valid: false, nondegenerate: false,
        issues: [issue("insufficient-vertices", "Add at least two vertices to compute an LLS sequence.")]
      };
    }

    const edgeCount = points.length - 1;
    const sequence = Array(2 * edgeCount - 1).fill(null);
    const edges = Array(edgeCount).fill(null);
    for (let k = 0; k < points.length; k++) {
      const p = points[k];
      if (!Array.isArray(p) || p.length !== 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
        issues.push(issue("invalid-coordinate", `Vertex A${k} needs two finite coordinates.`, {
          index: k, vertexIndex: k
        }));
      }
    }
    if (issues.length) return {sequence, edges, issues, valid: false, nondegenerate: false};

    let valid = true;
    let nondegenerate = true;
    for (let k = 0; k < edgeCount; k++) {
      const p = points[k], q = points[k + 1];
      const d = determinant(p, q);
      const details = {index: k, edgeIndex: k, coefficientIndex: 2 * k};
      if (!Number.isFinite(d)) {
        valid = false;
        issues.push(issue("numeric-overflow", `Edge A${k} → A${k + 1} exceeds the numerical range for its determinant.`, details));
        continue;
      }
      edges[k] = sequence[2 * k] = d;
      if (d === 0) {
        valid = false;
        if (p[0] === q[0] && p[1] === q[1]) {
          issues.push(issue("duplicate-vertices", `A${k} and A${k + 1} coincide. Move a vertex or remove the repeated point.`, details));
        } else {
          issues.push(issue("origin-edge", `The supporting line of A${k} → A${k + 1} passes through O. Its edge term a${2 * k} is 0, so this is not a valid LLS edge.`, details));
        }
      }
    }

    for (let k = 1; k < points.length - 1; k++) {
      const before = edges[k - 1], after = edges[k];
      if (before === null || after === null || before === 0 || after === 0) continue;
      const numerator = angleNumerator(points[k - 1], points[k], points[k + 1]);
      const value = cleanZero(divideByProduct(numerator, before, after));
      const details = {index: k, vertexIndex: k, coefficientIndex: 2 * k - 1};
      if (!Number.isFinite(numerator) || !Number.isFinite(value)) {
        valid = false;
        issues.push(issue("numeric-overflow", `The signed angle term at A${k} exceeds the numerical range.`, details));
        continue;
      }
      sequence[2 * k - 1] = value;
      if (value === 0) {
        nondegenerate = false;
        issues.push(issue("collinear", `A${k - 1}, A${k}, and A${k + 1} are collinear; the signed angle term a${2 * k - 1} is 0.`, details));
      }
    }

    return {sequence, edges, issues, valid, nondegenerate: valid && nondegenerate};
  }

  function assertFiniteOddSequence(a) {
    if (!Array.isArray(a) || a.length === 0 || a.length % 2 === 0) {
      throw new TypeError("The sequence must be a nonempty array of odd length.");
    }
    for (let i = 0; i < a.length; i++) {
      if (!Number.isFinite(a[i])) throw new TypeError(`Coefficient a${i} must be a finite number.`);
      if (i % 2 === 0 && a[i] === 0) {
        throw new RangeError(`Edge coefficient a${i} must be nonzero before computing its adjacency dual.`);
      }
    }
  }

  // The endpoint rules themselves are algebraically meaningful even if their
  // output has a zero edge, so this internal operation also supports that
  // output when checking the formal double dual.
  function formalDual(a) {
    if (a.length === 1) {
      return a[0] === 1 || a[0] === 2 ? [a[0]] : [1, a[0] - 2, 1];
    }
    const result = a.slice(1, -1).reverse();
    const first = a[0], last = a[a.length - 1];
    if (last === 1) result[0] += 1;
    else result.unshift(1, last - 1);
    if (first === 1) result[result.length - 1] += 1;
    else result.push(first - 1, 1);
    return result.map(cleanZero);
  }

  function approximatelySame(a, b) {
    return a.length === b.length && a.every((value, i) => {
      const other = b[i];
      return value === other || Math.abs(value - other) <= 32 * Number.EPSILON * Math.max(Math.abs(value), Math.abs(other));
    });
  }

  /**
   * Finite adjacency dual from Definition 5.15, with a formal real extension.
   * Endpoint comparisons to 1 are exact, as required by the piecewise rules.
   *
   * Input: odd finite array, nonzero even-indexed (edge) coefficients. Zero
   * odd-indexed coefficients are accepted as straight-vertex formal terms.
   * Output: {sequence, domain, warnings, canDraw, nondegenerate, isInvolutive}.
   * isInvolutive checks the algebraic double dual to floating-point tolerance;
   * it does not assert that a degenerate intermediate result is drawable.
   */
  function adjacencyDual(a) {
    assertFiniteOddSequence(a);
    const sequence = formalDual(a);
    if (sequence.some(value => !Number.isFinite(value))) {
      throw new RangeError("The dual sequence exceeds JavaScript Number arithmetic.");
    }
    const domain = a.every(value => Number.isInteger(value) && value > 0)
      ? "positive-integer" : "formal-real";
    const warnings = [];
    const zeroEdges = sequence.map((value, i) => value === 0 && i % 2 === 0 ? i : -1).filter(i => i >= 0);
    const zeroAngles = sequence.map((value, i) => value === 0 && i % 2 === 1 ? i : -1).filter(i => i >= 0);
    const canDraw = zeroEdges.length === 0;
    const isInvolutive = approximatelySame(formalDual(sequence), a);

    if (domain === "formal-real") {
      warnings.push("Definition 5.15 is stated for positive integers. Here its finite endpoint formulas are applied formally to real or signed coefficients.");
    }
    if (!canDraw) {
      warnings.push(`The formal dual has zero edge ${zeroEdges.length === 1 ? "term" : "terms"} ${zeroEdges.map(i => "a" + i).join(", ")}; it cannot define a broken line with this LLS sequence.`);
    }
    if (zeroAngles.length) {
      warnings.push(`The dual has zero angle ${zeroAngles.length === 1 ? "term" : "terms"} ${zeroAngles.map(i => "a" + i).join(", ")}, corresponding to collinear consecutive vertices.`);
    }
    if (!isInvolutive) {
      warnings.push("For this input, applying the formal endpoint rules twice does not recover the original sequence; the signed real extension is not a duality on all inputs.");
    }
    return {sequence, domain, warnings, canDraw, nondegenerate: canDraw && zeroAngles.length === 0, isInvolutive};
  }

  function formatNumber(value, precision = 12) {
    if (value === null || !Number.isFinite(value)) return "undefined";
    if (value === 0) return "0";
    return Number.isSafeInteger(value) ? String(value) : Number(value.toPrecision(precision)).toString();
  }

  return Object.freeze({determinant, analyzeVertices, adjacencyDual, formatNumber});
})();

if (typeof module !== "undefined" && module.exports) module.exports = LLSMath;
