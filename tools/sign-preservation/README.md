# sign-preservation page checks

`projects/sign-preservation/spr.js` is a JavaScript port of
`reference/spr_ref.py` from spr-calibration-code (commit 09d4059), the plain
reference solver the Rust code is checked against. `values_full_v1.csv` next to
it is a byte-identical copy of that repository's `data/values_full_v1.csv`.

Check the port against the published table (boards up to N cells, default 8):

    node tools/sign-preservation/check.mjs projects/sign-preservation/values_full_v1.csv 10

Expected: every value matches (110 of 110 for N = 10).
