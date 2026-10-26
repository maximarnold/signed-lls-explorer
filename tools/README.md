# Build the standalone package

From the repository root, use Python 3.10 or later:

```sh
python3 tools/build_standalone.py --output-dir /absolute/path/to/export
```

This writes the standalone ZIP and an extracted `Signed-LLS-Explorer` folder.
After editing `dist/`, replace the root `index.html` with the generated HTML
and update the ZIP in [downloads](../downloads/). Reusing an output directory
replaces its generated package. The [offline guide](../STANDALONE.md) becomes
the package's README.
