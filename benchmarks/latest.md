# FireTake benchmark

Generated 2026-11-02T05:46:23.726Z · engine app/fve.js 1.0.0

## Test suites

| Suite | Result | Detail |
|---|---|---|
| Unit | FAIL | 61/62 passed, coverage 95.4 % lines / 77.7 % branches |
| Integration | PASS | 15/15 passed |
| Regression | PASS | 7/9 passed |

## Geometry extraction and legend detection

| Project | Sheets | Objects | Geometry s | Legend s |
|---|---|---|---|---|
| synthetic-basic | 4 | 191 | 0.1 | 0 |
| synthetic-large | 8 | 1263 | 0.1 | 0 |
| 383-kent | 3 | 215326 | 5.2 | 0.1 |
| 44-mandarin | 8 | 122685 | 5.3 | 0 |
| 44-market | 10 | 94399 | 2.1 | 0 |
| 443-willoughby | 8 | 118539 | 1.7 | 0 |
| khartoum | 9 | 954074 | 15.5 | 0.1 |

## Device recognition

| Project | Ground truth | Precision % | Recall % | F1 % | FP | FN | Type accuracy % | Result |
|---|---|---|---|---|---|---|---|---|
| 383-kent | needs-verification | – | – | – | – | – | – | NOT SCORED (no verified ground truth — runs in regression) |
| 44-mandarin | verified-markups | 96.1 | 97.5 | 96.8 | 16 | 10 | 99.2 | PASS |
| 44-market | verified-markups | 100 | 88.8 | 94.1 | 0 | 18 | 100 | FAIL |
| 443-willoughby | needs-verification | – | – | – | – | – | – | NOT SCORED (no verified ground truth — runs in regression) |
| giffnock | awaiting-data | – | – | – | – | – | – | AWAITING DATA |
| khartoum | verified-count-tables | 70.7 | 52.6 | 60.3 | 79 | 172 | 59.2 | FAIL |
| unsw-m15 | awaiting-data | – | – | – | – | – | – | AWAITING DATA |
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
| 44-market | smoke | 43 | 43 | 0 |
| 44-market | speaker | 23 | 21 | 0 |
| 44-market | heat | 3 | 3 | 0 |
| 44-market | sprinkler | 92 | 76 | 0 |
| khartoum | sprinkler | 195 | 45 | 60 |
| khartoum | smoke | 89 | 67 | 3 |
| khartoum | speaker | 79 | 79 | 16 |
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

## Loop detection

Drawn loops matched to ground truth on their sheet: devices within 10 %, length within 5 %. Estimated loops (no cable reaches the devices) are reported by the app, not scored.

| Project | Loop | Expected devices | Found | Device error % | Expected m | Found m | Length error % | Matched |
|---|---|---|---|---|---|---|---|---|
| synthetic-basic | LOOP-L1 | 19 | 20 | 5.3 | 170.09 | 170.09 | 0 | yes |
| synthetic-basic | LOOP-L2 | 20 | 21 | 5 | 173.43 | 173.43 | 0 | yes |
| synthetic-large | LOOP-L1 | 56 | 57 | 1.8 | 330.68 | 330.68 | 0 | yes |
| synthetic-large | LOOP-L2 | 53 | 54 | 1.9 | 321.92 | 321.92 | 0 | yes |
| synthetic-large | LOOP-L3 | 55 | 55 | 0 | 326.58 | 326.58 | 0 | yes |
| synthetic-large | LOOP-L4 | 48 | 49 | 2.1 | 311.71 | 311.71 | 0 | yes |
| synthetic-large | LOOP-L5 | 52 | 54 | 3.8 | 320.53 | 320.53 | 0 | yes |
| synthetic-large | LOOP-L6 | 56 | 56 | 0 | 330.08 | 330.08 | 0 | yes |

## Room detection

| Project | Expected | Found | Matched by name | Detection % | Area accuracy % |
|---|---|---|---|---|---|
| synthetic-basic | 24 | 24 | 24 | 100 | 100 |
| synthetic-large | 210 | 210 | 210 | 100 | 100 |

## Standards checks

AS 1670.1:2018, AS 1670.4:2015, AS 2118.1:2017, AS 2444—2001 and AS 2441—2005 limits (checked against the supplied standards) on the recognised layout; see docs/compliance.md.

| Project | Fail | Warn | Advisory | Info | Isolators needed | Expected found |
|---|---|---|---|---|---|---|
| 44-mandarin | 0 | 1 | 0 | 2 | 3 | – |
| 44-market | 25 | 25 | 4 | 2 | 0 | – |
| khartoum | 0 | 2 | 0 | 3 | 4 | – |
| synthetic-basic | 3 | 0 | 14 | 1 | 0 | – |
| synthetic-large | 0 | 0 | 101 | 7 | 12 | – |

## Processing time

| Project | Geometry s | Legend s | Detection s | Network s | Total s | Target ≤ 60 s |
|---|---|---|---|---|---|---|
| synthetic-basic | 0.1 | 0 | 0.1 | n/a | 0.2 | PASS |
| synthetic-large | 0.1 | 0 | 0.2 | n/a | 0.4 | PASS |
| 383-kent | 5.2 | 0.1 | 38.2 | n/a | 43.5 | PASS |
| 44-mandarin | 5.3 | 0 | 47.6 | n/a | 53.1 | PASS |
| 44-market | 2.1 | 0 | 14.4 | n/a | 16.8 | PASS |
| 443-willoughby | 1.7 | 0 | 12.1 | n/a | 13.9 | PASS |
| khartoum | 15.5 | 0.1 | 55 | n/a | 70.9 | FAIL |
