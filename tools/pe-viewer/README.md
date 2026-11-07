# pe-viewer

Source of `projects/protocol-emulator/viewer.js`, the 3D layout viewer on
tavelarocque.com/projects/protocol-emulator/. three.js is pinned to 0.187.0 and
bundled (only the parts the viewer uses), so the site loads no third-party code.

Rebuild after editing `viewer.src.js`:

    cd tools/pe-viewer && npm ci && npm run build

The data file `projects/protocol-emulator/layout.pe2` is made by
`tools/gds2rects.py` in the protocol-emulator repo from a CI build's GDS and
routed DEF; its header records the commit, PDK revision and flow version.
