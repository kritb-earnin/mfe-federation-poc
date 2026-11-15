# Measurement plan

Separate **proposed metrics** from **observed results**. Do not invent ROI.

## Proposed metrics

| Metric | How to measure | Notes |
| --- | --- | --- |
| Integration effort for a new remote | Hours/PRs to add mount + lifecycle + shell registration | Track against AGENTS.md checklist |
| Session fetch duplication | Count session HTTP calls per login across remotes | Expect 1 shell auth bridge call; remotes use snapshot |
| Transition latency | Time from command start → new snapshot published + remotes resumed | Use event log timestamps |
| Correctness failures | Obsolete-data leaks in Playwright scenarios 4–5 | Zero tolerance |
| Cleanup failures | Forced cleanup-fail scenario remains blocked | Fail closed |
| Maintenance / migration | Lines touched outside contracts when changing SessionApi | Prefer contract version bumps |

## Observed results

| Metric | Observed | Date | Notes |
| --- | --- | --- | --- |
| Unit tests | pass (contracts + coordinator 12 + shared-store 1) | 2026-11-15 | `pnpm test:unit` |
| Playwright A | 9 passed / 0 failed | 2026-11-15 | B/C smoke skipped without env |
| Obsolete data leaks (scenarios 4–5) | none observed in passing suite | 2026-11-15 | |
| Cleanup failure handling | remote remains blocked (scenario 7 pass) | 2026-11-15 | |
| Transition latency | not instrumented beyond E2E wall times (~0.2–3.1s cases) | 2026-11-15 | no ROI claim |
