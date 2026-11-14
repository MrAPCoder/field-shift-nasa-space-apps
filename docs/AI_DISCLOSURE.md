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


## Approved M3 completion
Codex implemented the user-approved Palouse-first demonstration and farmer-editable
management inputs. It recorded narrow published-sequence approvals separately from
broad verification flags; no unsupported crop trait or schedule was verified. It
added monthly explicit exposure assumptions, provenance/confirmation validation,
rainfall-weighted scenario calculations, responsive controls, unit/browser tests
and updated documentation. Percentages are supplied by users, not invented by AI.
All numeric calendar fixtures in automated tests are labeled synthetic. NASA data,
dependencies and M1/M2 climate behavior remain unchanged. The simple input calendar
was explicitly authorized for M3; no M4 risk visualization or print plan was added.
The precise files modified in this completion are listed in M3_VERIFICATION.md.

## M4 assistance
Codex continued from merged main `6c40195` and implemented the month-by-month
rainfall/exposure visualization, print view, display helpers, responsive/print CSS,
unit tests and browser interaction tests. It reused M3's farmer inputs and scoring
without changing agricultural evidence, NASA caches or scoring coefficients.
The wettest-month highlighting rule is explicitly a display convention; numerical
exposure results remain M3 calculations. Browser fixtures are labeled synthetic.
Codex ran tests and inspected browser-generated print output; no PDF dependency
was introduced. Modified files and results are listed in M4_VERIFICATION.md.
No Sunday AI features or trend analysis were implemented.
