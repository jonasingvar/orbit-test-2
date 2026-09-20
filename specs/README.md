# Specs

One file per ticket, written before the code and committed as the first commit
on its branch — so a reviewer reads what was intended before reading the diff.

They stay after merge. Taken together they are the record of *why* this
codebase is the way it is: what each change was for, what the ticket left open,
and what was deliberately not done. `CLAUDE.md` says how the code works; these
say how it got that way.

A spec that disagrees with the pull request it shipped in is worse than no
spec, so they are updated when the work diverges from the plan.
