@AGENTS.md

# How to work in this repo

## Start of every session
- Read PROGRESS.md (where things stand) before starting work.

## Plan first
- For any non-trivial task (3+ steps or design decisions), plan before building.
- If something goes sideways, stop and re-plan instead of pushing on.

## Verify before done
- Never call a task complete without proving it works: run `npm run lint`,
  `npm test`, and `npm run build` as relevant, and check the result.

## Keep it simple
- Make every change as simple as possible. Find root causes; no temporary hacks.
- Skip extra polish on small, obvious fixes.

## Fix bugs directly
- When given an error, trace it and fix it without needing hand-holding.

## Keep the records current
- Before each commit, update PROGRESS.md (working on / done / up next).
- At the end of a work session, add a short entry to SUMMARIES.md.
- After any correction from the user, add the lesson under "Lessons" in
  PROGRESS.md so it isn't repeated.
