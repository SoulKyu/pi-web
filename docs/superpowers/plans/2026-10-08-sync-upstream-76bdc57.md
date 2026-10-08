# Sync upstream `76bdc57` — progress

Branch `sync/upstream-76bdc57` from `local` = `a507131`. Upstream range `a096af3..76bdc57` (20 commits).
Decision (human): option 1 — adopt the upstream sidebar, reapply fork contributions, restyle it Tron.
Rollback: `git reset --hard a507131` on `local` while nothing is pushed there.

## Steps

- [x] 4.1 prepare: fetch, `local` clean and pushed
- [ ] 4.2 merge `upstream/main` (no-ff)
- [ ] resolve conflicts (list below)
- [ ] fonts (#1074): keep without theme plumbing, else STOP
- [ ] merge commit + gate (tsc, lint, tests)
- [ ] fork contributions on the new sidebar (inventory below), each with a failing test first
- [ ] Origin check on new routes `sessions/[id]/fork`, `sessions/ui-state` (+ tests)
- [ ] Tron pass on new upstream components (codemod dry run, write, hand touch-ups) + palette test
- [ ] gate after each Tron commit
- [ ] 4.4 final checks (`diff --stat`, fork files back to upstream)
- [ ] Opus review, fixes
- [ ] push `sync/upstream-76bdc57` to origin, ask human visual check
- [ ] 4.5 ff-only into `local`, push, delete sync branch
- [ ] `AGENT.md` §7 + §8, report §9

## Conflicts

(filled after the merge)

## Fork contributions on the sidebar

(filled from the inventory)
