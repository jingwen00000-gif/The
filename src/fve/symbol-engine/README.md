# FireTake Multi-Layer Symbol Matching Engine (MSME)

```
symbol → text → legend → context → network → confidence fusion → final classification
```

| Layer | File | Evidence | Weight |
|---|---|---|---|
| 1 Geometry | `geometry-matcher.js` | scale-invariant descriptor vs each legend symbol; exact vector hits | 20 % |
| 2 Text | `text-matcher.js` | PDF text layer: exact tag 95, device phrase 90, numbered tag 80, fading with distance | 25 % |
| 3 Legend | `legend-matcher.js` | the project's dictionary: exact hit, identical fingerprint, the legend row's own label, project abbreviation, consultant library | 30 % |
| 4 Context | `context-matcher.js` | confirmed neighbours (1 / (1 + d / size)); every candidate with the same geoHash | 10 % |
| 5 Network | `network-matcher.js` | the legend's cable line types traced into circuits; members on the same circuit vote; circuit name gives a family prior | 15 % |
| Fusion | `confidence-fusion.js` | weighted over layers with a real opinion (≥ 0.5); 1 / 2 / 3+ agreeing layers × 0.82 / 0.95 / 1; bare text tag × 0.6; legend dissent × 0.85 | |
| Fingerprint | `symbol-fingerprint.js` | descriptor, `GEO_xxxxx` geoHash, `SD_FP_xxxxx` fingerprint | |

**Descriptor (no pixels, no absolute size):** largest closed outline (kind, aspect, colour) as the unit; inside it the counts of strokes,
circles, rects, polygons and fills, the direction of the inner strokes (0 / 45 / 90 / 135°), where the ink sits (centre / middle / edge),
how much ink, and strokes leaving the outline (tails, arrows). A legend symbol and the same block plotted 0.64× on a plan give the same
descriptor and geoHash. Two empty outlines are capped at 0.45 similarity: they say little about the device.

**Candidates:** exact vector matches of legend symbols (per-symbol scale), closed outlines in a legend colour at a size the legend allows on
that sheet, and device tags on the plan. Candidates on the same spot merge; legend areas, the title block and non-plan sheets are left out;
one device per family per spot survives (within 1.2 symbol sizes).

**Two passes:** pass 1 scores geometry + text + legend; results ≥ 75 % become the labels that context and network read in pass 2.

**Interface**

```js
FVE_MSME.matchSymbol(candidate, graph)
// → { device: 'smoke', confidence: 96.8, sources: ['Geometry','Text','Legend','Context'], fingerprint: 'SMOKE_FP_1K2ZQ',
//     geoHash: 'GEO_A312F', status: 'new', alternatives: [...], layers: {...}, evidence: {...} }
await FVE_MSME.run(models, dictionary, { match, library, consultant })   // all plan sheets; dets.learn = library entries (≥ 90 %)
```

**Consultant learning:** `library` entries `{consultant, geoHash, device}` add legend-layer evidence for that consultant's symbols.
Not yet: proposing candidates from the library alone (projects without a legend), and storing the library per consultant in the app.

Measured with `npm run test:validation` — see `benchmarks/latest.md`.
