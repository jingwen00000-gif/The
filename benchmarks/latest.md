# FireTake benchmark

Generated 2026-11-02T01:07:23.434Z · engine app/fve.js 1.0.0

## Test suites

| Suite | Result | Detail |
|---|---|---|
| Unit | PASS | 26/26 passed, coverage 100 % lines / 81.9 % branches |
| Integration | PASS | 4/7 passed, 3 todo (modules not implemented) |
| Regression | PASS | 5/5 passed |

## Geometry extraction and legend detection

| Project | Sheets | Objects | Geometry s | Legend s |
|---|---|---|---|---|
| synthetic-basic | 4 | 191 | 0.1 | 0 |
| synthetic-large | 8 | 1263 | 0.1 | 0 |
| 383-kent | 3 | 215326 | 4.9 | 0 |
| 44-mandarin | 8 | 122685 | 7.1 | 0 |
| 443-willoughby | 8 | 118539 | 1.6 | 0 |

## Device recognition

| Project | Ground truth | Precision % | Recall % | F1 % | FP | FN | Type accuracy % | Result |
|---|---|---|---|---|---|---|---|---|
| 44-mandarin | verified-markups | 96.1 | 97.5 | 96.8 | 16 | 10 | 99.2 | PASS |
| synthetic-basic | generated | 100 | 100 | 100 | 0 | 0 | 100 | PASS |
| synthetic-large | generated | 100 | 100 | 100 | 0 | 0 | 100 | PASS |

### By device family

| Project | Family | Truth | Found | False alarms |
|---|---|---|---|---|
| 44-mandarin | heat | 86 | 83 | 0 |
| 44-mandarin | smoke | 23 | 23 | 0 |
| 44-mandarin | speaker | 66 | 66 | 1 |
| 44-mandarin | sounder | 16 | 12 | 0 |
| 44-mandarin | relay | 3 | 2 | 0 |
| 44-mandarin | sprinkler | 212 | 210 | 15 |
| synthetic-basic | smoke | 36 | 36 | 0 |
| synthetic-basic | speaker | 8 | 8 | 0 |
| synthetic-basic | heat | 9 | 9 | 0 |
| synthetic-basic | mcp | 6 | 6 | 0 |
| synthetic-basic | wip | 2 | 2 | 0 |
| synthetic-large | smoke | 273 | 273 | 0 |
| synthetic-large | speaker | 72 | 72 | 0 |
| synthetic-large | heat | 65 | 65 | 0 |
| synthetic-large | mcp | 42 | 42 | 0 |
| synthetic-large | wip | 6 | 6 | 0 |

## Cable / pipe lengths

| Project | Line type | Expected m | Actual m | Error % |
|---|---|---|---|---|
| synthetic-basic | FIRE SPRINKLER MAIN PIPEWORK | 64.3 | 64.3 | 0 |
| synthetic-basic | FIRE SPRINKLER RANGE PIPEWORK | 182.3 | 182.3 | 0 |
| synthetic-basic | FIRE DETECTION LOOP CABLE | 343.5 | 343.5 | 0 |
| synthetic-large | FIRE SPRINKLER MAIN PIPEWORK | 192.8 | 192.8 | 0 |
| synthetic-large | FIRE SPRINKLER RANGE PIPEWORK | 957.2 | 957.2 | 0 |
| synthetic-large | FIRE DETECTION LOOP CABLE | 1941.5 | 1941.5 | 0 |

## Loop detection · Room detection · Compliance

Not implemented yet (Stage 3 room intelligence, Stage 4 network graph). Ground truth for loops and rooms exists in the synthetic datasets, so these sections fill in as soon as the modules land.

## Processing time

| Project | Geometry s | Legend s | Detection s | Network s | Total s | Target ≤ 60 s |
|---|---|---|---|---|---|---|
| synthetic-basic | 0.1 | 0 | 0.1 | n/a | 0.2 | PASS |
| synthetic-large | 0.1 | 0 | 0.2 | n/a | 0.4 | PASS |
| 383-kent | 4.9 | 0 | 0 | n/a | 5 | PASS |
| 44-mandarin | 7.1 | 0 | 49.7 | n/a | 57 | PASS |
| 443-willoughby | 1.6 | 0 | 12.4 | n/a | 14.1 | PASS |
