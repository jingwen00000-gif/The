# FireTake knowledge base

Built by `npm run learn` from finished jobs (`data/training-projects`, `validation-projects`); never edited by hand.

| File | Holds |
|---|---|
| `symbol-library.json` | geoHash → device, vector template, texts, statuses, consultants, sources, agreement |
| `consultant-library.json` | consultant → aliases, e-mail domains, logo fingerprints, symbols, abbreviations, colour / legend conventions |
| `network-library.json` | circuit patterns, device mix per circuit type, transitions, devices and metres per loop |
| `room-library.json` | room type → area, expected devices |
| `pricing-library.json` | item (+ work done) → supply / install / rate statistics, labour ratio |
| `knowledge-index.json` | the jobs and what each contributed |
| `knowledge.bundle.js` | all of the above for the app (`window.FT_KNOWLEDGE`) |
| `projects/<id>/` | each job's knowledge graph and contributions (the libraries are rebuilt from these) |

Currently: 44-mandarin (Millimetre Consulting Engineers, 404 devices from the estimator's Bluebeam counts). Tests analyse every project
without its own contributions (`FT_KNOWLEDGE=off` disables the base).
