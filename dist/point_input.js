"use strict";

/** Parse finite numeric values and complete ordered lists of vertex pairs. */
var LLSPointInput = (() => {
  function parseNumber(text) {
    const s = String(text).trim().replace(/−/g, "-").replace(/\s*\/\s*/g, "/");
    const numeric = "[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?";
    if (!new RegExp("^" + numeric + "(?:/" + numeric + ")?$", "i").test(s)) {
      throw new Error("Use a finite number or a fraction such as 1/2.");
    }
    const parts = s.split("/").map(Number);
    if (!parts.every(Number.isFinite)) {
      throw new Error("The numerator and denominator must both be finite.");
    }
    const n = parts[0] / (parts.length === 2 ? parts[1] : 1);
    if (!Number.isFinite(n)) {
      throw new Error("Use finite values; a fraction cannot have denominator zero.");
    }
    return n === 0 ? 0 : n;
  }

  function parsePair(body, index) {
    const value = body.trim().replace(/\s*\/\s*/g, "/");
    const parts = value.includes(",") ? value.split(",").map(s => s.trim()) : value.split(/\s+/);
    if (parts.length !== 2 || parts.some(s => !s)) {
      throw new Error(`Pair ${index} must contain exactly two coordinates, x and y.`);
    }
    return parts.map((part, axis) => {
      try { return parseNumber(part); }
      catch (error) { throw new Error(`Pair ${index}, ${axis === 0 ? "x" : "y"}: ${error.message}`); }
    });
  }

  function parseGrouped(text) {
    const points = [];
    let pos = 0;
    const skipSpace = () => { while (pos < text.length && /\s/.test(text[pos])) pos++; };
    const afterFirst = text.slice(1).trimStart()[0];
    const wrapped = text[0] === "[" && (afterFirst === "[" || afterFirst === "(");
    if (wrapped) { pos++; skipSpace(); }

    while (pos < text.length) {
      const open = text[pos], close = open === "[" ? "]" : ")";
      if (open !== "[" && open !== "(") {
        throw new Error(`Expected coordinate pair ${points.length + 1} in brackets or parentheses.`);
      }
      const start = ++pos;
      while (pos < text.length && !/[()[\]]/.test(text[pos])) pos++;
      if (text[pos] !== close) {
        throw new Error(`Pair ${points.length + 1} has a missing or mismatched closing bracket.`);
      }
      points.push(parsePair(text.slice(start, pos), points.length + 1));
      pos++;
      const beforeSpace = pos;
      skipSpace();
      const hadSpace = pos > beforeSpace;

      if (wrapped && text[pos] === "]") {
        pos++;
        skipSpace();
        if (pos !== text.length) throw new Error("Unexpected text after the coordinate list.");
        return points;
      }
      if (pos === text.length) {
        if (wrapped) throw new Error("The coordinate list is missing its closing square bracket.");
        return points;
      }
      if (text[pos] === "," || text[pos] === ";") {
        pos++;
        skipSpace();
        if (pos === text.length || (wrapped && text[pos] === "]")) {
          throw new Error("Expected another coordinate pair after the separator.");
        }
      } else if (!hadSpace || (text[pos] !== "[" && text[pos] !== "(")) {
        throw new Error("Separate coordinate pairs with a comma, semicolon, or whitespace.");
      }
    }
    return points;
  }

  /**
   * Accept [[x,y], ...], [(x,y), ...], bare bracketed pairs, or one x,y / x y
   * pair per line or semicolon. Values may be decimal, scientific, or p/q.
   * Every character is validated. Geometry validity is left to the editor.
   */
  function parsePoints(text) {
    const source = String(text).trim();
    if (!source) throw new Error("Enter at least two coordinate pairs, for example [(1, 0), (1, 1)].");
    const points = source[0] === "[" || source[0] === "("
      ? parseGrouped(source)
      : source.split(/\r\n?|\n|;/).map(row => row.trim()).filter(Boolean)
        .map((row, index) => parsePair(row, index + 1));
    if (points.length < 2) throw new Error("Enter at least two coordinate pairs to draw a broken line.");
    return points;
  }

  return Object.freeze({parseNumber, parsePoints});
})();

if (typeof module !== "undefined" && module.exports) module.exports = LLSPointInput;
