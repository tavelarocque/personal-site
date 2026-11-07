# darkmpc demo checks

`projects/darkmpc/core.js` holds the page's secret sharing (the same split as
darkmpc's `share_a`) and a JavaScript port of the Stage 1 reference matcher
(`crates/reference/src/matcher.rs`, darkmpc commit 618fd31). This folder checks
the port against the Rust code.

1. Generate cases with the Rust reference (5,000 random batches, pass cap 3):

       cp gen_cases.rs ~/CODE/darkmpc/crates/reference/examples/
       cd ~/CODE/darkmpc && cargo run -q --release -p darkmpc-reference --example gen_cases > /tmp/cases.jsonl

2. Check the JavaScript against them, plus the sharing and the opening check:

       node tools/darkmpc-demo/check.mjs /tmp/cases.jsonl

Expected: every batch identical, every value reconstructs, every single-server
tamper makes exactly one honest server abort and none output a wrong value.
