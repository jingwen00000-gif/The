# Standards checks on the recognised layout

`src/fve/compliance/` checks the layout FireTake recognised (devices, named rooms with outline and area, loops, scale). Findings are
questions for the designer / estimator with the measured value and the limit, never a certificate. Run from the results dialog (规范检查),
the test harness (`R.compliance`) and validation / benchmark.

| Standard | Module | Verified | Checks |
|---|---|---|---|
| AS 1670.1:2018 fire detection | `as1670-1.js` | yes | 4.1.2 / 5.1.2 any point within 5 m (heat) / 7 m (smoke) of a detector, and each detector within 7 m / 10 m of its nearest · 4.1.4 / 5.1.4 ≥ 0.3 m from walls · 3.28 rooms without detection (sanitary spaces < 3.5 m² exempt) · C3.2 nuisance-prone smoke detectors (advisory) · 2.6 isolators: ≤ 40 devices per path fault · 3.14.2 an MCP at the main entrance · panel loop capacity and FIP presence (notes, not clauses) |
| AS 1670.4:2015 EWS / EIS | `as1670-4.js` | yes | 5.4.3(a) WIP on each floor · 4.3.6 bedroom speaker (75 dB(A) at bedhead) · 4.3.6 rooms with no speaker (65 dB(A) / +10 dB — confirm) · 4.3.9 VAD where ambient > 85 dB(A) (plant rooms) · 4.3.8 Note 2 recommended speaker grid 2 × ceiling height (advisory) |
| AS 2118.1:2017 (Amdt 1) sprinklers | `as2118-1.js` | yes | hazard class per project (default Light Hazard — offices, A2; car parks OH 2, A3.2): area per head 21 / 12 m² (9.4.2, 9.4.3, 10.4.2, 11.4.2), spacing 4.8 / 4.2 / staggered 4.6 / 3.7 m (9.4.4, 10.4.4, 11.4.1), from walls half spacing / 2.1 m (9.4.4, 9.4.3, 10.4.6), ≥ 2 m apart (5.3), ≥ 100 mm from walls (5.4), rooms without heads (3.1.1; 3.1.3 omissions advisory). Standard-coverage heads under horizontal ceilings; extended-coverage / residential heads follow their listing |
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
with their clause references. All five modules are checked against the supplied editions (AS 1670.1:2018, AS 1670.4:2015, AS 2118.1:2017 incl.
Amendment 1, AS 2444—2001, AS 2441—2005); level ceilings are assumed — sloping, deep-beamed or high-airflow areas change the AS 1670.1 limits.

**Corrections made when AS 1670.1 arrived:** heat coverage 5 m (was 5.09 m from a 7.2 m grid) and spacing 7 m, smoke coverage 7 m (was
7.35 m) and spacing 10 m, MCP: one at the main entrance (was one per floor), kitchen smoke detectors: commentary advisory (was a rule),
3.28 sanitary exemption below 3.5 m² (was any bathroom).
