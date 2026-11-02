# FireTake Learning Engine — finished jobs into engineering knowledge

The original drawing is the question; the takeoff drawing is the answer. The Learning Engine reads both, works out what the
estimator added, and turns every finished job into permanent, reusable knowledge that recognition reads before it starts on the
next job. No model is trained: everything learnt is explicit, inspectable JSON with the job it came from.

```
data/training-projects/<job>/            src/learning-engine/                         data/knowledge/
  original.pdf  ─┐                         project-ingestion  load folder, read PDFs      symbol-library.json
  takeoff.pdf   ─┼─► diff ─► extract ─►    drawing-diff       question vs answer          consultant-library.json
  boq.xlsx      ─┤                         symbol-extractor   markups → devices, symbols  network-library.json
  quote.xlsx    ─┤                         consultant-extr.   who drew it                 room-library.json
  metadata.json ─┤                         network-extractor  circuits, patterns          pricing-library.json
  markup-map    ─┘                         room-extractor     rooms, expected devices     knowledge-index.json
                                           pricing-extractor  BOQ / quote rates           knowledge.bundle.js (app)
                                           knowledge-builder  project graph + contrib.    projects/<id>/knowledge-graph.json
                                           learning-database  rebuild, forRecognition                   /contributions.json
                                                                    │
recognition (app G key, tests):  consultant ─► forRecognition ─► FVE dictionary (+ historical symbols) ─► MSME 7 layers
```

## 1. Architecture

| Stage | Module | What it does |
|---|---|---|
| Ingestion | `project-ingestion.js` | `loadFolder` (Node) finds original / takeoff by file name (`original`, `issued`, `tender`… vs `takeoff`, `markup`, `count`…), the BOQ / quote workbooks, `metadata.json`, `markup-map.json`. One marked-up PDF only = both (its markups are the answer). `ingestInApp` runs inside the FireTake engine: both sets → FVE models → every extractor → plain JSON. |
| Difference | `drawing-diff.js` | Sheets paired (order + size, else title-block wording). Added **annotations** (Bluebeam / Acrobat counts, clouds, callouts, measurements), added **vector** line work (flattened markups: objects with no twin), added **text** (device IDs, notes). A sheet that is mostly new is a revision, reported and not learnt from. |
| Symbols | `symbol-extractor.js` | Markups of one kind + colour are a class. Class → device: the estimator's `markup-map.json` (per sheet), else the markups' words (`Speaker`; numbers are counts, not names), else what the original's legend shows under them (FVE + MSME on the original). Under each device the original's geometry is cut; what recurs across the type is the symbol (passing cables, tags and walls drop out). ≤ 3 symbols per device type, each a geoHash, fingerprint, descriptor and vector template. A plain outline with only a tag inside becomes an abbreviation, not a symbol. |
| Consultant | `consultant-extractor.js` | Metadata, then a consultant the base knows (name, alias, e-mail domain, logo), then title-block role fields (`CONSULTANT` / `ENGINEER` column; `CLIENT`, `ARCHITECT`, `PROJECT` columns are excluded), copyright / "prepared by" sentences wrapped over lines, e-mail domain, company lines, logo fingerprint (`LOGO_xxxxx` from the coloured line work in the title block). |
| Networks | `network-extractor.js` | The legend's cable line types traced per sheet (dashed cables joined across the measured dash gap); confirmed devices placed on a circuit and ordered along it: `FIP->SD*5->HD->SD*3->MCP`, closed / radial, metres, device mix; estimator measurements kept as allowances. |
| Rooms | `room-extractor.js` | Room names from the text layer, the smallest black / grey closed outline around the name, area from scale, the confirmed devices inside. Loose wall lines are skipped, not guessed (room detection proper is Stage 3). |
| Pricing | `pricing-extractor.js` | .xlsx read with no library (zip + XML; inflate injected). Header row by its words; FPS quote sheets (level name where *Description* would be, section rows) supported. Item key = FireTake item + work done: `smoke`, `smoke@remove`, `spk_pend@relocate`, `cable_fip`. |
| Knowledge | `knowledge-builder.js` | Project knowledge graph (what the job was: devices, rooms, networks, pricing, BOQ-vs-takeoff check, provenance) and contributions (what it teaches). |
| Database | `learning-database.js` | Libraries are **derived**: rebuilt from all projects' contributions, so re-learning a job replaces it and deleting its folder removes it. `forRecognition(consultant, excludeProject)` gives recognition what it may use. |

## 2. New files

`src/learning-engine/`: project-ingestion, drawing-diff, symbol-extractor, consultant-extractor, network-extractor, room-extractor,
pricing-extractor, knowledge-builder, learning-database, cli (`npm run learn`) · `src/fve/symbol-engine/knowledge-matcher.js` ·
`data/knowledge/*` · `data/training-projects/README.md` · `tests/lib/xlsxwriter.js`, `tests/lib/knowledge.js` ·
`tests/datasets/generate-training.js` + `tests/datasets/training/{train-acme, eval-acme-nolegend}` ·
`tests/unit/learning.test.js` · `tests/integration/learning.test.js` · this document.

## 3. Modifications to existing code

| File | Change |
|---|---|
| `src/fve/symbol-engine/confidence-fusion.js` | two more layers, `historical` 15 % and `consultant` 15 %. Fusion only weighs layers with an opinion, so without a knowledge base every result is unchanged (verified: all baselines). |
| `src/fve/symbol-engine/index.js` | knowledge-matcher scored with the other layers; `hooks.knowledge`; historical templates get the sheet's consensus scale. |
| `src/fve/symbol-engine/legend-matcher.js` | historical templates are not this project's legend: their hits go to the knowledge layers. |
| `app/fve.js` | `projectDictionary(models, {knowledge})`: historical symbols become searchable entries (`hist: true`) for devices the project's legend does not cover; another consultant's symbols only on a set with no legend; the consultant's usual colour code when the set has none. |
| `app/index.html` | learning-engine scripts + `data/knowledge/knowledge.bundle.js`; `fveTemplate` uses a historical symbol's own app segments. |
| `src/fve/ui.js` | G key: consultant by the extractor, knowledge base (bundle, or one imported with `FX.importKnowledge`) → dictionary + MSME; results say when history was used. |
| `tests/lib/harness.js`, runners | `knowledgeBase` + `projectId` (leave-one-out: a project is never scored on what it taught). `FT_KNOWLEDGE=off` disables. |
| `tests/lib/pdfwriter.js`, `tests/datasets/generate.js` | PDF annotations; consultant lines for training sets (scored datasets byte-identical). |

## 4. Database schema (all files `{schema: "firetake.knowledge/1", updated, entries}`)

```jsonc
// symbol-library.json  entries[]
{ "geoHash": "GEO_QH0JB", "deviceType": "smoke", "code": "SD", "fingerprint": "SMOKE_FP_1K2ZQ",
  "desc": { /* scale-invariant descriptor */ }, "template": { "objs": [], "segs": [], "vsegs": [], "bb": [], "cols": [], "key": {} },
  "text": {"SD": 3}, "status": {"new": 20}, "consultants": {"Acme Fire Consulting": 28}, "sources": {"TRAIN-ACME-001": 28},
  "n": 28, "confidence": 1, "agreement": 1 }            // agreement: share of this geoHash's sightings that said this device
// consultant-library.json
{ "consultant": "Acme Fire Consulting", "key": "acmefireconsulting", "aliases": {}, "emailDomains": {"acmefire": 1}, "logoHashes": {"LOGO_MM7Q3": 1},
  "symbols": [{"geoHash": "...", "deviceType": "smoke", "n": 28, "sources": {}}], "abbreviations": {"SD": {"smoke": 6}},
  "conventions": {"statusColours": {"0000ff": {"new": 13}}, "legendStyle": {"text": 1}, "scales": {"100": 1}, "lineTypes": {}}, "projects": [] }
// network-library.json
{ "patterns": [{"pattern": "FIP->SD*5->HD", "n": 1, "sources": {}}], "circuits": [{"circuit": "detection", "share": {"smoke": .8}, "loops": 2}],
  "transitions": {"SD->HD": 4}, "loops": {"devices": {stat}, "length_m": {stat}, "metresPerDevice": {stat}} }
// room-library.json
{ "room": "PLANT ROOM", "n": 3, "area_m2": {stat}, "expectedDevices": [{"device": "heat", "presence": 1, "perRoom": 1.3, "per100m2": 2.1}] }
// pricing-library.json
{ "item": "smoke@remove", "name": "Delete detector …", "unit": "ea", "supplyCost": {stat}, "installCost": {stat}, "rate": {stat}, "labourRatio": {stat}, "qty": {stat} }
// knowledge-index.json
{ "projects": [{"projectId": "44-mandarin", "at": "…", "consultant": "Millimetre Consulting Engineers", "devices": 404, "symbols": 14}] }
// {stat} = {n, avg, min, max, median}
```

## 5. Workflow

1. Put each finished job in `data/training-projects/<job>/` (PDFs and workbooks stay out of git).
2. If the estimator's colours are not obvious from the drawings, add `markup-map.json` (`{"classes": {"annotation:Circle#ff00ff": "smoke"}}` or per sheet).
3. `npm run learn -- --all data/training-projects` (or one folder). Each job prints its consultant, markup classes and how each was
   named, symbols, circuits, rooms, priced items, and lists any markup class nobody could name.
4. Libraries and `knowledge.bundle.js` are rebuilt; the app and the test runners use them from then on.
5. `npm run test:all`: every scored project is analysed without its own contributions.

## 6. Implementation status

| Phase | Status |
|---|---|
| 1 Ingestion | done (folder rules, single marked-up PDF, metadata, markup map) |
| 2 Drawing difference | done (annotations, flattened vector markups, added text, revision sheets) |
| 3 Symbol knowledge | done; templates, fingerprints, abbreviations |
| 4 Consultant knowledge | done; role fields, copyright, e-mail, logo fingerprint |
| 5 Network knowledge | patterns, circuit mix, transitions, metres / device; **used**: the circuit mix is a prior in MSME's network layer (≥ 2 loops), metres / device is shown beside estimated loops |
| 6 Room knowledge | rooms with closed outlines; **used**: the room engine finds this project's rooms and asks about a room type missing a device earlier jobs had in ≥ 80 % of ≥ 3 rooms (never adds devices) |
| 7 Pricing knowledge | done; **used**: rates page → 按历史项目建议单价 shows current vs the jobs' median per item / work type / cable and writes the ticked ones into this project's rates (`src/fve/rates-from-history.js`) |
| 8 Knowledge graph | done (per project) |
| Integration | historical + consultant layers in MSME, historical symbols in the dictionary, consultant colour code, network priors, room expectations, rate suggestions |

## 7. Loops and rooms (current project)

`src/fve/network/loop-engine.js`: drawn loops from the legend's cable line types (dash gaps bridged, chains broken at device symbols merged, a
device is on the loop where the cable turns or ends at it or runs through it; order, closed / radial, panel, metres) and estimated loops for
devices no cable reaches (orthogonal route from the FIP, nearest neighbour + 2-opt, ≤ 125 devices per loop, + 10 % slack + 1.5 m drop per
device, always labelled). `src/fve/rooms/room-engine.js`: named rooms in closed outlines with area and devices. Synthetic: 8/8 loops,
length error 0 %, device count within 5 %; 234/234 rooms, area 100 %. In the app the results dialog lists both; estimated loops can be
added as pending cable runs.

## 8. Measured (not projected)

| Case | Without knowledge | With knowledge |
|---|---|---|
| eval-acme-nolegend (synthetic, same consultant, **no legend sheet**) | F1 23.9 (only tagged devices) | **F1 100**, type 100 — historical + consultant layers |
| train-acme extraction vs the job's own answer | — | F1 100, BOQ quantities all agree |
| 44-mandarin extraction vs its markup ground truth (same markups: checks the mechanics) | — | F1 99.8, consultant read from a wrapped copyright line |
| Scored projects with their own legend (mandarin, synthetic) | baseline | unchanged (leave-one-out; other consultants' history never overrides a project's own legend) |

The accuracy bands in the brief (95–97 % with a knowledge base, 97–98 % with consultant libraries, 98–99 % with networks) are targets.
They need real finished jobs from several consultants to measure: each new job in `data/training-projects` that shares a consultant
with a scored project is the evidence.

## 9. Impact on existing code

- No behaviour change without a knowledge base (fusion ignores silent layers; dictionary adds nothing).
- With one: projects with a legend only gain this consultant's symbols for devices their legend lacks; sets without a legend gain the most.
- Risk: a consultant who reuses a symbol for a different device. Guard: `agreement`, per-consultant entries, the project's legend always first.
- Cost: recognition adds one template per historical symbol to search (≤ 120); learning a job takes about as long as recognising it.
- Data: knowledge files hold symbol geometry, consultant names, positions and rates from finished jobs. Treat `data/knowledge` as
  company data; client PDFs and workbooks are never committed (`.gitignore`).
