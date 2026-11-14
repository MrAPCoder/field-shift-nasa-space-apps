# AI assistance disclosure

For M1, OpenAI Codex read the team-provided engineering master prompt, inspected
the connected repository, wrote the React/Vite foundation, centralized the exact
team-provided farm coordinates, and implemented the Python NASA POWER pipeline,
validation, tests and documentation. Codex executed real API requests and local
verification commands. Climate outputs are computed from archived NASA responses;
synthetic data appear only in labeled unit tests. No agricultural traits,
rotations or citations were generated, and no M2 features were implemented.

Rehan and Nakul should review the formulas, limitations and verification report
before presenting results. AI assistance does not constitute independent scientific
validation or approval by NASA. NASA POWER is the data provider, not an endorser.

## M2 assistance
Codex continued from merged M1 on `origin/main` and implemented the React climate
dashboard, farm selection, four priority sliders, Recharts rainfall and modeled
wetness charts, accessible monthly tables, coverage notes, responsive CSS, and
loading/error/retry handling. It added frontend validation and Node tests, and
used the environment's existing Playwright and Chromium for browser verification.
No dependencies were added. No NASA requests were made or M1 data regenerated.
All displayed climate values come from the existing M1 JSON. Sliders express
preferences only; no crop scoring, recommendations, or M3 features were added.

## M3 assistance
Codex researched and opened authoritative USDA NRCS/ARS, WSU and Washington
agency/soil-health sources; created source-linked proposed crop/rotation JSON;
implemented deterministic scoring, comparison cards, tests and documentation.
It preserved `verified: false` for all agricultural proposals pending team review.
Unsupported traits, sequences and calendars remain TODO/null/unknown. No scientific
values, citations, current farm histories, or profitability estimates were invented.
Numeric test fixtures are explicitly synthetic and never rendered as real results.
Existing NASA caches and dependencies were not changed or regenerated. No M4
calendar, print plan or deployment changes were made.
