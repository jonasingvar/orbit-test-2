---
name: build
description: >-
  Take one GitHub issue from this repo to a verified pull request:
  claim it, work it in an isolated workspace, prove it in the browser, and
  hand it back to a human — or stop and say why. Use when asked to build,
  implement or pick up an issue, when told "/build 42", or when a ticket is
  labelled ready-for-ai.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# Build an issue

One issue in, one reviewable pull request out, with the evidence attached.
`CLAUDE.md` is the specification for this repo — most of what looks like a
judgement call is settled there.

Every step re-reads the whole conversation, so anything you pull in early is
paid for on every step after it. Ask for the narrowest thing that answers the
question, and never run a command twice to grep it the second time.

## 1. Read the ticket

```bash
gh issue view <n> --json number,title,body,labels,state
gh pr list --state open --json number,headRefName \
  --jq '.[] | select(.headRefName | startswith("issue-<n>-"))'
```

The **Done when:** clause is what you build, and later what you prove. Go to
step 8 and stop if the issue is closed, already has a pull request, states no
outcome you could write a check against, or asks for two unrelated things.

## 2. Claim it

```bash
gh issue edit <n> --add-label ai-working --remove-label ready-for-ai
```

## 3. Get a workspace

In a runner (`$GITHUB_ACTIONS` set) the machine is yours — just branch:

```bash
git checkout -b issue-<n>-<short-slug> origin/main
```

On a laptop, other agents may hold other tickets, so take a worktree and a
lane, or you will eventually test another branch's code and pass:

```bash
git worktree add -b issue-<n>-<short-slug> ../orbit-wt-<n> origin/main
cd ../orbit-wt-<n> && npm install
eval "$(node scripts/lane.mjs claim <n>)"
```

## 3b. Write the spec first

Before changing any code, write `specs/<n>-<short-slug>.md` and push it as the
branch's **first commit**, so a reviewer reads what you intend before the diff.
Headings: *What this changes* (in terms of what an attendee sees), *Where*
(file by file), *How it will be proved* (the check, and which layer), and only
where they apply, *Decisions* (anything the ticket left open, or got wrong) and
*Out of scope*.

```bash
git add specs/<n>-<short-slug>.md
git commit -m "docs(spec): <the ticket's title, lower case>"
git push -u origin HEAD
gh issue comment <n> --body "Spec: <link to the file on this branch>"
```

A plan, not an essay — half a page. If writing it changes your mind about the
approach, that is the step working. It lands with the change and stays, so keep
it true: a spec that disagrees with its own pull request is worse than none.

## 4. Find the change site

Grep for the behaviour the ticket names; read only the file or two that own
it. **`CLAUDE.md` already describes the layout, the conventions and the three
test layers — take its word rather than re-deriving any of it from source.**
Reading the Playwright config, the test helpers or the seed to work out how
this repo is organised is the expensive mistake here.

It also carries the reasoning behind decisions that look arbitrary and are
not. A change contradicting a stated decision is wrong even when it is green.

## 5. Write the check first

Derive a check from **Done when:**, at the cheapest layer that can prove it —
`CLAUDE.md` says which. Run it and **confirm it fails for the reason you
expect**; a check that passes before you write anything is proving something
other than the ticket.

- **Never edit an existing test to make it pass.** A failing test means your
  change is wrong, unless the ticket explicitly changes that behaviour.
- **Never delete, skip or `.only` a test.**
- **Never assert a value copied from your own output.** It comes from the
  ticket, or from reasoning about it.

## 6. Implement

`npm test` after every edit — 160-odd tests in under a second. Match the
surrounding code, and commit in the Conventional Commits style `CLAUDE.md`
describes.

## 7. Prove it

```bash
npm test          # green
npm run verify    # the gate: real browser, desktop and mobile
npm run shot -- /the-route    # only if something visual moved
```

**Once each.** Read what you need from the first run. In a runner Chromium is
already installed — never run `playwright install`.

**No green `verify`, no pull request.** Not "probably fine", not "that failure
looks unrelated". If you cannot get it green, go to step 9.

## 8. Open the pull request

Open it **ready for review**, not as a draft — the code review and QA passes
start when it opens, and a draft would stall them waiting for somebody to
notice.

Show the change if it is visible. A reviewer looking at a UI change should
see the UI, not read a description of it:

```bash
node scripts/pr-media.mjs <n> .screenshots/<name>.png   # prints the markdown
```

For a change to an interaction rather than a view, screenshot **both states**
and show them side by side. Your proof spec is already driving the browser
through exactly that sequence, so take them there rather than paying for
another run:

```js
await page.screenshot({ path: '.screenshots/before.png' });
await page.getByRole('button', { name: 'Add' }).click();
await page.screenshot({ path: '.screenshots/after.png' });
```

```bash
node scripts/pr-media.mjs <n> .screenshots/before.png .screenshots/after.png
```

How many is a judgement call, and the test is that **every image shows
something the one before it did not**:

- **None** — nothing an attendee can see changed. A refactor, an endpoint, a
  rule with no visible surface. A screenshot that does not show the change is
  worse than none, because it implies you checked something you did not.
- **One** — a view changed. Show the view.
- **Two** — an interaction changed. The state before, and the state after.
- **Up to five** — a flow worth walking through, one image per step that
  looks different.

Five is the hard limit and `pr-media.mjs` enforces it per pull request, but
it is a backstop, not a target.

```bash
```

```bash
git push -u origin HEAD
gh pr create --base main --title "<the issue's title>" --body-file /tmp/pr-body.md
gh issue comment <n> --body "Ready for review: <pr url>"
gh issue edit <n> --add-label ready-for-human --remove-label ai-working
```

That issue comment matters: `Closes #<n>` does not reliably register when a
pull request is opened by automation, so without it nothing on the ticket
points at your work. Keep the keyword too — it still closes on merge.

The body is read in a narrow column beside the diff. Keep it scannable, and
resist adding to this shape:

```markdown
Closes #<n>

<One sentence: what an attendee sees now that they did not before.>

[Spec](specs/<n>-<short-slug>.md)

### Changed
- `<file>` — <what, in a few words>

<the line pr-media.mjs printed, for a single screenshot — or, for a
before-and-after, a two-column table so they sit side by side:>

| Before | After |
| --- | --- |
| <![before](…)> | <![after](…)> |

### Proof
| Check | Result |
| --- | --- |
| `<the test that proves the ticket>` | red before, green after |
| `npm test` | 161 passed |
| `npm run verify` | 155 passed · desktop + mobile |

<details>
<summary>Worth a closer look</summary>

<Only a trade-off you made, a criterion you could not test, or something in
the ticket that turned out to be wrong. Two short paragraphs. Omit the block
entirely if there is nothing.>
</details>
```

## 9. If you cannot finish

A normal outcome, not a failure.

```bash
gh issue comment <n> --body "<what you tried, the output that stopped you, what it needs from a person>"
gh issue edit <n> --add-label needs-human --remove-label ai-working
```

No pull request. **Do not narrow the ticket to something you can finish and
present that as done** — a half-built ticket that looks complete costs more
than one that is honestly stuck.

## 10. Clean up

Laptop only; a runner disappears on its own.

```bash
node scripts/lane.mjs release
git worktree remove ../orbit-wt-<n>
```
