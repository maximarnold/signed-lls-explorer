# Automated checks

From the repository root, run the dependency-free checks with Node.js:

```sh
node tests/forward.test.js
node tests/math.test.js
node tests/point_input.test.js
node tests/tikz.test.js
```

For DOM interactions, install `linkedom` as described in the
[developer guide](../DEVELOPER.md), then run `node tests/interaction.test.js`.
These checks simulate SVG coordinate transforms; they do not verify browser
visual layout or native pointer-capture behavior. The app itself needs no
Node.js dependencies.
