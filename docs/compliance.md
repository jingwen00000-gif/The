# Standards checks on the recognised layout

`src/fve/compliance/` checks the layout FireTake recognised (devices, named rooms with outline and area, loops, scale). Findings are
questions for the designer / estimator with the measured value and the limit, never a certificate. Run from the results dialog (规范检查),
the test harness (`R.compliance`) and validation / benchmark.

| Standard | Module | Verified | Checks |
|---|---|---|---|
| AS 1670.1 fire detection | `as1670-1.js` | **no** — standard not supplied; common flat-ceiling values | detector coverage (smoke 10.4 m / heat 7.2 m spacing), 0.3 m from walls, rooms without detection, smoke in kitchens / car parks, isolators every 40 devices, loop capacity, MCP per floor, FIP present |
| AS 1670.4:2015 EWS / EIS | `as1670-4.js` | yes | 5.4.3(a) WIP on each floor · 4.3.6 bedroom speaker (75 dB(A) at bedhead) · 4.3.6 rooms with no speaker (65 dB(A) / +10 dB — confirm) · 4.3.9 VAD where ambient > 85 dB(A) (plant rooms) · 4.3.8 Note 2 recommended speaker grid 2 × ceiling height (advisory) |
| AS 2444—2001 extinguishers / blankets | `as2444.js` | yes | 4.2.1 ≤ 15 m travel to an extinguisher · Table 4.1 floor area per extinguisher (when the hazard class and ratings are set) · 4.4.2 switchboard: 2–20 m, CO2 / 1A:E with hose closest · 4.4.4 cooking oils: 2–20 m, F-class closest |
| AS 2441—2005 hose reels | `as2441.js` | yes | 10.2 coverage: 36 m hose + 4 m stream · 10.1 not in fire-isolated exits |

**Distances.** Straight lines are a lower bound of travel distance and hose route. Beyond a limit in a straight line is reported as
`fail`; AS 2441 additionally reports points 30–40 m away as "check the hose route" because walls and doors decide them.

**Parameters.** Every limit is in the module's `RULES`; override per project: `FVE_COMPLIANCE.check(models, dets, rooms, loops,
{rules: {as2444: {hazard: 'ordinary', sprinklered: true}}, 'as1670-4': {ceilingM: 3.0}}})`.

**What a drawing cannot show** (not checked): sound pressure levels and intelligibility (measured at commissioning), mounting heights,
signage, extinguisher ratings unless set, the significant-switchboard and cooking-oil positions inside a room (the room centre stands
in), travel around walls.

**The standards themselves** are licensed documents and are not stored in the repository; the modules hold only the numeric limits
with their clause references. Supplying AS 1670.1 would let its limits be checked the same way.
