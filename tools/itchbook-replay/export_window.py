#!/usr/bin/env python3
"""Cut short replay windows out of itchbook's M5 feature export for the order
book view on tavelarocque.com/projects/itchbook/.

Input: PREFIX.SYMBOL.npy and PREFIX.meta.json written by `itch-lob` (layout in
include/itchbook/lob/recorder.hpp): one int32 row per 250 ms of regular hours,
the top 10 levels of each side as they stand at the end of the interval, and
displayed traded volume by aggressor side plus hidden executions over the
interval. Nothing finer than that is published: no messages, no order
references, no individual trades.

Output: one JSON file. Prices are integer cents (ITCH prices carry 4 decimals;
AAPL's tick is one cent), sizes are shares.

Usage: export_window.py FEATURES.npy META.json SYMBOL DATE COMMIT OUT.json START=HH:MM:SS [...]
"""
import json
import sys

import numpy as np

DEPTH = 10
BID_PX, BID_SZ, ASK_PX, ASK_SZ = 0, 10, 20, 30
BUY, SELL, HID_B, HID_S, EVENTS, TRADING = 50, 51, 52, 53, 54, 55
SECONDS = 60


def main(npy, meta_path, symbol, date, commit, out, *starts):
    a = np.load(npy)
    meta = json.load(open(meta_path))
    grid = meta["grid_ns"]
    assert a.shape[1] == 56 and meta["depth"] == DEPTH
    per_s = 1_000_000_000 // grid
    windows = []
    for start in starts:
        h, m, s = (int(x) for x in start.split(":"))
        off_ns = ((h * 3600 + m * 60 + s) * 1_000_000_000) - meta["start_ns"]
        assert off_ns >= 0 and off_ns % grid == 0
        k0 = off_ns // grid + 1  # row k covers (t_{k-1}, t_k]; the first row ends one step after START
        rows = a[k0:k0 + SECONDS * per_s]
        assert len(rows) == SECONDS * per_s and rows[:, TRADING].all()
        assert (rows[:, BID_PX:BID_PX + DEPTH] % 100 == 0).all() and (rows[:, ASK_PX:ASK_PX + DEPTH] % 100 == 0).all()

        def cents(block):
            return (block // 100).astype(int).tolist()

        windows.append({
            "start": start,
            "bidPx": cents(rows[:, BID_PX:BID_PX + DEPTH]),
            "bidSz": rows[:, BID_SZ:BID_SZ + DEPTH].astype(int).tolist(),
            "askPx": cents(rows[:, ASK_PX:ASK_PX + DEPTH]),
            "askSz": rows[:, ASK_SZ:ASK_SZ + DEPTH].astype(int).tolist(),
            "buy": rows[:, BUY].astype(int).tolist(),
            "sell": rows[:, SELL].astype(int).tolist(),
            "hidden": (rows[:, HID_B] + rows[:, HID_S]).astype(int).tolist(),
            "events": rows[:, EVENTS].astype(int).tolist(),
        })
    doc = {
        "symbol": symbol, "date": date, "grid_ms": grid // 1_000_000, "depth": DEPTH,
        "source": "NASDAQ TotalView-ITCH 5.0 public sample file " + date.replace("-", "")[4:] + date[:4]
                  + ".NASDAQ_ITCH50.gz (emi.nasdaq.com)",
        "messages_that_day": meta["messages"],
        "engine": "itchbook itch-lob, commit " + commit,
        "windows": windows,
    }
    with open(out, "w") as f:
        json.dump(doc, f, separators=(",", ":"))


if __name__ == "__main__":
    main(*sys.argv[1:])
