---
name: code-review
description: >-
  Review a pull request another agent opened, against the ticket it claims to
  close and the decisions CLAUDE.md records. High signal, no nitpicking.
  Comments; never blocks. Use when asked to review a pull request in this repo,
  or when told "/code-review 42".
allowed-tools: Read, Glob, Grep, Bash
---

# Review a pull request

You did not write this and have not seen the reasoning that produced it. That
is the point: the agent that built it cannot see its own misreading.

**You comment. A human merges.** Nothing you do blocks a merge.

**Your verdict is a file** — one line in `/tmp/review-verdict`, nothing else is
read. A verdict written only in prose leaves the check reading *unproven*.

## 1. Form your own view first

Read, in this order:

```bash
gh issue view <issue> --json number,title,body      # the whole body
gh pr diff <pr>
```

Then the branch's `specs/` file and the parts of `CLAUDE.md` the diff touches.
Work out for yourself whether each **Done when:** criterion is met.

**Only then** read the conversation:

```bash
gh api repos/{owner}/{repo}/issues/<pr>/comments --jq '.[] | "\(.user.login): \(.body)"'
```

In that order deliberately. A stated opinion in a thread pulls a reader
towards it, so form your own read before you are exposed to one. Then
reconcile: **a human who said "drop that button, the nav covers it" has
amended the ticket**, and the diff should follow them. What still deserves
raising is a pull request that would close an issue it no longer satisfies.

## 2. Flag only these

- **A Done-when criterion that is not met.** Quote the criterion, and show
  what should satisfy it and does not.
- **A CLAUDE.md decision contradicted.** Quote the rule exactly, and the line
  that breaks it. This repo records what was tried and rejected — one action
  rather than bookmark-plus-reserve, no invented external links, no map
  coordinates, nothing claiming to be true that is not.
- **A logic error.** Name an input and the wrong output it produces. Not "this
  looks wrong".
- **A test that proves nothing** — one asserting the implementation's output
  against itself, or one that would pass before the change.

Every finding cites `file:line`, read from the line. Never inferred from a
name, a docstring, or what a function sounds like it does.

## 3. Never flag these

- Style, naming, formatting, structure, or how you would have written it
- Anything the linter, the type checker or the test suite already catches
- Anything that is only a problem for some inputs, unless you name one
- A bug that is already on `main` — it is not this pull request's doing
- Anything the code, its tests or its spec show was deliberate
- Anything opening "consider", "might want to", "for future reference"
- Praise

**If you are not certain a finding is real, do not post it.** A false positive
costs more than a missed nit, because it teaches people to skim you.

Requirement-conformance is the category you will get wrong most often — it is
easy to read a criterion too literally and call compliant code non-compliant.
Hold it to the highest bar of the four.

## 4. Verify before you post

For each candidate finding, go back to the cited line and check it says what
you claimed. Drop anything that does not survive that. This catches the
failure that matters most here: a confident finding about code that does not
exist.

**At most three findings.** More than that means you stopped reviewing and
started listing — keep the three that would change a merge decision.

## 5. Comment

One comment. Open with the callout, then at most three short paragraphs. Each
finding is two lines: what breaks, and when.

```markdown
> [!TIP]
> ### Code review · high confidence &nbsp; `●●●`
> Every criterion traced to what satisfies it. 40 lines, one file.
```

| Verdict | Callout | Meter |
| --- | --- | --- |
| pass, high | `> [!TIP]` | `●●●` |
| pass, medium | `> [!NOTE]` | `●●○` |
| pass, low | `> [!WARNING]` | `●○○` |
| blocker | `> [!CAUTION]` | *none* |

No meter on a blocker — the dots measure how much you could judge, and a
defect is not a claim about coverage.

**"Nothing to flag" is a good review**, and the usual correct outcome for work
that passed a green gate. Say it in one line and stop. It should cost you no
more to write than a full one.

```bash
gh pr comment <pr> --body "<the callout, then anything you found>"
```

## 6. Write the verdict

```bash
echo "PASS high every criterion traced to a test I read; 40 lines, one file" > /tmp/review-verdict
echo "PASS low  change is in the seeded PRNG; I cannot tell from the diff what it produces" > /tmp/review-verdict
echo "FAIL closes #12 but its third criterion is not implemented" > /tmp/review-verdict
```

`PASS <high|medium|low> <what you could judge>` or `FAIL <the blocker>`.

Confidence is **how much of this change you could evaluate**, not how sure you
feel about what you read. High means you traced every criterion and the diff
is within what you can reason about from source. Low means you could not
meaningfully review it — generated output, a timing-dependent path, something
you cannot see into — and **publishes as unproven rather than green**, which
says a person should look rather than implying they need not.

A `FAIL` turns the check red and stops nobody merging. It puts a blocker where
someone skimming will see it. Three findings all worth reading and none of
them a blocker is still a `PASS`.

Never approve, never request changes, never merge.
