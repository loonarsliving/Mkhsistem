# GIT WORKFLOW

Do not change any branch as part of reading this document. This is a
description of the existing, observed workflow — not a prescription to
alter it.

## Default / production branch

- **Actual default branch (per `git remote show origin` → `HEAD branch`,
  and `origin/HEAD` ref)**: `claude/mk-connect-app-o9zw2p`.
- There is **no `main` branch currently present** in this repository
  (`git branch -a` at audit time showed only
  `claude/mk-connect-app-o9zw2p` and this audit's own branch). This is a
  notable discrepancy: `.github/workflows/ci.yml` and `android-build.yml`
  both declare `on.push.branches: [main, "claude/**"]`. Since `main`
  doesn't exist, CI on push effectively only ever triggers for `claude/**`
  branches (which `claude/mk-connect-app-o9zw2p` itself matches) — this
  still works today only because the "production" branch happens to be
  named with a `claude/` prefix. **`UNKNOWN — NEEDS CONFIRMATION`**: it's
  unclear whether the project intends to rename this branch to `main`
  eventually, whether `main` existed before and was deleted/renamed, or
  whether the `main` reference in workflow files is simply unused
  boilerplate. Treat `claude/mk-connect-app-o9zw2p` as the true production
  branch until told otherwise.
- Vercel's production deployment branch is `UNKNOWN — NEEDS
  CONFIRMATION` from repo contents alone (no Vercel project config file is
  committed — see `DEPLOYMENT.md`), but given `claude/mk-connect-app-o9zw2p`
  is the default branch, it is the most likely production branch for a
  standard "deploy on push to default branch" Vercel setup.

## Branch naming convention

Every branch observed follows `claude/<short-kebab-description>-<random-suffix>`,
e.g. `claude/sistem-properti-warna-ml1gns`,
`claude/project-memory-audit-af4m1t` (this audit's own branch). This
matches Claude Code's own session-branch naming pattern — i.e. essentially
all development happens on Claude-Code-generated branches, which are then
merged back into `claude/mk-connect-app-o9zw2p`.

## Commit convention

- **No enforced commit message prefix convention** (no conventional-commits
  `feat:`/`fix:` style observed in `git log`). Messages are plain,
  imperative-mood, descriptive sentences, e.g. "Stop trusting
  client-supplied Content-Type on Storage uploads", "Fix silent failure in
  bukti-transfer-to-jurnal sync (critical)".
- Dependabot commits use `chore(<scope>): ...` per
  `.github/dependabot.yml`'s `commit-message.prefix: "chore"` +
  `include: "scope"` config — this is the **only** place a prefix
  convention is explicitly configured.
- 54 of 508 commits are `Merge branch '...' into claude/mk-connect-app-o9zw2p`
  commits — confirming the actual pattern is: work happens on a
  short-lived `claude/*` feature branch, then merges into the long-lived
  `claude/mk-connect-app-o9zw2p` branch.

## Merge / PR process

- No evidence of a GitHub PR-based review process was found in the repo
  itself (no `PULL_REQUEST_TEMPLATE`, no branch protection config file —
  branch protection isn't expressible in-repo anyway). The merge commits in
  `git log` are consistent with either direct `git merge` or PR-merge —
  **`UNKNOWN — NEEDS CONFIRMATION`** whether PRs are actually opened on
  GitHub for these merges or whether merges happen locally/via Claude Code
  sessions and are pushed directly.
- `ci.yml` triggers on `pull_request: branches: [main]` — again referencing
  a `main` branch that doesn't currently exist, so this trigger is
  presently inert in practice unless PRs are opened against
  `claude/mk-connect-app-o9zw2p` (which wouldn't match `[main]`) — worth
  confirming whether PR-triggered CI is actually running for this repo.

## Claude Code branches

This repository is developed almost entirely through Claude Code sessions:
469 of 508 commits (92%) are authored by `Claude`; the remaining 39 by
`loonarsliving` (the human account). See `DEVELOPMENT_WORKFLOW.md` for what
this implies about how work happens.

This audit's own branch, `claude/project-memory-audit-af4m1t`, was created
directly from `claude/mk-connect-app-o9zw2p` (fetched fresh, confirmed not
to already exist on the remote before creation) and should be treated the
same as any other Claude feature branch — merged into
`claude/mk-connect-app-o9zw2p` when the work is reviewed and accepted, not
pushed directly to it by this audit.

## When push happens / when production deploys

- Per the observed pattern (see `DEPLOYMENT.md`), pushing to
  `claude/mk-connect-app-o9zw2p` is what triggers a Vercel production
  deploy, consistent with Vercel's standard "deploy on push to the
  connected branch" behavior and the fact that this is the repo's default
  branch. This is inferred from strong circumstantial evidence (Vercel
  hosting confirmed, no separate `main`/`production` branch exists,
  `@vercel/speed-insights` and `vercel.json` are committed) rather than
  directly observed — flagged as `UNKNOWN — NEEDS CONFIRMATION` for
  absolute certainty, since no Vercel project settings file is in the repo.
