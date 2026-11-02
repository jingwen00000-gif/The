# FireTake tests

Every change to recognition is measured, not eyeballed.

| Command | What it does |
|---|---|
| `npm run test:all` | unit → integration → regression → validation → performance; non-zero exit if any fails |
| `npm run test:unit` | `app/fve.js` and `src/fve/symbol-engine/*` in plain Node on a fake pdf.js page; line-coverage gate 80 % |
| `npm run test:integration` | the real app in headless Chromium on the synthetic project: PDF → geometry → legend → detection → lines (graph / network / rooms are `todo` until those modules exist) |
| `npm run test:validation [project…] [--strict]` | every project with a `ground-truth.json`: precision / recall / F1, false positives / negatives, type accuracy, cable error; gate F1 ≥ 95, cable accuracy ≥ 95 % |
| `npm run test:regression` | compares each project with its accepted baseline (`tests/regression/baselines`); `UPDATE_BASELINES=1 npm run test:regression` accepts an intended change |
| `npm run test:performance` | geometry < 30 s, legend < 10 s, total < 60 s per project |
| `npm run benchmark` | runs validation + performance and writes `benchmarks/latest.md` (`-- --no-run` to rewrite from the last results) |
| `npm run status` | modules complete, stage status (definition of done), accuracy, outstanding issues, technical debt |
| `npm run generate:testdata` | synthetic projects with exact ground truth (`tests/datasets/`) |
| `npm run debug:legend -- <project or file.pdf>` | `debug/<project>/`: dictionary.json, detections.json, warnings.json, log.txt, one SVG overlay per sheet |
| `npm run debug:network` / `debug:rooms` / `debug:compliance` | exit 2 with a message until those modules exist |

Setup on a new machine: `npm install` then `npx playwright install chromium`. Node 22+.

## Layout

```
tests/
  unit/            node:test, no browser (fve.test.js, msme/msme.test.js)
  integration/     real app in Chromium (pipeline.test.js)
  validation/      run.js (scoring), truth-from-markups.js (ground truth from an estimator's count markups)
  regression/      regression.test.js + baselines/<project>.json
  performance/     run.js
  datasets/        generate.js + synthetic-basic/, synthetic-large/ (project.pdf + ground-truth.json)
  lib/             harness (drives the app), metrics, pdfwriter, fakepdf, projects, build
  modules.json     module registry + gates used by status / validation
  results/         latest run outputs (not committed)
validation-projects/<name>/  ground-truth.json (committed) + the drawings (kept out of git)
```

## Ground truth

```json
{
 "project": "44-mandarin",
 "status": "verified-markups",          // generated | verified-… are scored; needs-verification / awaiting-data are not
 "files": ["project.pdf"],
 "devices": [{ "id": "heat-3-001", "type": "heat", "level": "GF-DRY", "page": 3, "x": 258.2, "y": 922.6 }],
 "networks": [{ "id": "LOOP-1", "type": "FIRE_LOOP", "devices": 28, "length_m": 182.4 }],
 "rooms": [{ "name": "OFFICE", "area": 56.4, "level": "L01" }],
 "lines": { "FIRE SPRINKLER RANGE PIPEWORK": 182.32 }
}
```

`x`, `y` are PDF points from the top-left of the sheet, `page` the 0-based sheet index; a detection matches a ground-truth device of the
same family within 12 pt. `type` takes FireTake keys (`smoke`, `heat`, `spk_pend` …) or drawing codes (`SD`, `HD`, `MCP` …).
A family name (`sprinkler`, `speaker`, `extinguisher`) scores recognition without judging the sub-type.

## CI gate

`.github/workflows/tests.yml` runs unit, integration, regression and validation on the synthetic projects for every push and pull
request. Client drawings are not in the repository, so the real projects run on the estimator's machine (`npm run test:all`).
