# itchbook replay data

`projects/itchbook/book.json` is cut from itchbook's M5 feature export, which
`itch-lob` wrote on 20 Oct 2026 (code as of itchbook commit 6b2a4c4, the last
change to the book engine and recorder before the export):

    python3 tools/itchbook-replay/export_window.py \
      ~/CODE/itch-data/m5/features/01302020.AAPL.npy \
      ~/CODE/itch-data/m5/features/01302020.meta.json \
      AAPL 2020-01-30 6b2a4c4 projects/itchbook/book.json 10:00:00 09:30:00

Only the 250 ms samples are published: the top 10 levels per side and traded
volume by side. No ITCH messages, order references or individual trades. The
source is NASDAQ's public TotalView-ITCH 5.0 sample file 01302020.NASDAQ_ITCH50.gz.
