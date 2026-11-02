# Finished jobs for the Learning Engine

One folder per finished job. PDFs and workbooks stay on this machine (`.gitignore`); `metadata.json` and `markup-map.json` may be committed.

```
data/training-projects/2024-017-george-st/
  original.pdf        the consultant's drawings as received (names with issued / tender / IFC also work)
  takeoff.pdf         the same drawings after estimating (takeoff / markup / marked / count in the name)
  boq.xlsx            optional
  quote.xlsx          optional
  metadata.json       optional  {"projectId": "2024-017", "name": "...", "client": "...", "consultant": "...", "date": "2024-05-01"}
  markup-map.json     optional  the estimator's colours: {"classes": {"annotation:Circle#ff00ff": "smoke", "vector:ring#ff6600": "mcp"}}
                                or per sheet (0-based): {"pages": {"3": {"Polygon#ff0000": "smoke"}}}
```

Only one PDF, carrying the estimator's markups? That is fine: the drawing without its markups is the original.

`npm run learn -- --all data/training-projects` reads every job, prints what it learnt (and any markup colour nobody could name — add it
to that job's `markup-map.json` and run again), and rebuilds `data/knowledge`. See `docs/learning-engine.md`.
