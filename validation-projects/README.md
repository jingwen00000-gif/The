# Validation projects

One folder per real project: `ground-truth.json` (committed) and the drawings named in its `files` (not committed — client drawings
stay on the machine; `.gitignore` keeps `*.pdf` here out of git).

| Project | Drawings | Ground truth | Status |
|---|---|---|---|
| 383-kent | F-000-001, F-L09-101, F-L10-101 (refurbishment, CAD-lettered legend) | none yet | regression only until an estimator confirms the device list |
| 44-mandarin | 8-sheet tender set (dry + wet) | 406 devices from the estimator's Bluebeam count markups (`markup-map.json` → `truth-from-markups.js`) | scored |
| 44-market | 10-sheet D&C tender, Lobby & EOT refurbishment (Nutbrook): dry, wet, hydrant / hose reel, demolition | 161 devices from the estimator's Bluebeam ticks (`markup-map.json`, read by inspecting symbols under each colour; demolition sheet not scored; tolerance 20 pt — ticks sit beside the symbol) | scored |
| 443-willoughby | 8-sheet wet fire set | none yet (no count markups) | regression only |
| unsw-m15 · giffnock · khartoum | not provided | — | awaiting data |

Adding a project: create the folder, put the PDF(s) in, write `ground-truth.json` (see `tests/README.md`). If the drawings carry count
markups, describe colour → device in `markup-map.json` and run `node tests/validation/truth-from-markups.js validation-projects/<name>`.
Set `"status"` to `verified-…` only after an estimator has checked the list; until then the project is not scored.
