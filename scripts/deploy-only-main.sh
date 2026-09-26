#!/usr/bin/env bash
# DEPLOI-VERROU-1 (AUDIT-B+2 F-84) — THE FIRST STEP OF EVERY DEPLOY.
#
# « A deploy is a deliberate act » was already the law (workflow_dispatch
# only). What it never bound was WHAT gets deployed: any branch could be
# dispatched to production, including one CI never ran on. The provenance
# poll at the end of each deploy proves the live build is the one DISPATCHED
# — on the 2026-08-01 stale-branch outage it would still have printed
# PROVENANCE OK.
#
# So a deploy now goes live only when BOTH hold:
#   1. the commit is main's newest commit — merged work, and nothing older
#      (a stale branch or an old commit of main is refused; roll back by
#      reverting on main, which is itself reviewed);
#   2. the `ci` workflow has a SUCCESSFUL run on that exact commit, and it is
#      the run main's own push started (event=push, branch=main) — not a
#      pull-request run, whose ci.yml could be the branch's own.
#
# ITS LIMIT, stated so green is never read as more: this step runs from the
# commit being deployed, so it stops an accidental or stale dispatch — not a
# branch that edits this script or its workflow. The guarantee against that
# is GitHub's environment protection (the Cloudflare secrets scoped to a
# `main`-only environment), a repository setting only the founder can turn on.
#
# A refusal is not an outage: nothing was uploaded. Wait for ci to go green
# on main (or merge the work first), then dispatch again.
#
# Needs: GITHUB_SHA, GITHUB_REPOSITORY, GH_TOKEN (the job's own token with
# `actions: read`), `git` and `gh`. DEPLOY_REMOTE overrides the remote the
# tip is read from (the gate board's fixtures use a local one).
set -euo pipefail

: "${GITHUB_SHA:?GITHUB_SHA is unset}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is unset}"
: "${GH_TOKEN:?GH_TOKEN is unset — the job needs permissions: actions: read}"
REMOTE="${DEPLOY_REMOTE:-https://github.com/${GITHUB_REPOSITORY}}"

# A failed read must still say why it refused, not die silently under set -e.
MAIN="$(git ls-remote "$REMOTE" refs/heads/main 2>/dev/null | cut -f1)" || MAIN=""
if [ -z "$MAIN" ]; then
  echo "::error title=Deploy refused::could not read main's newest commit from $REMOTE — refusing rather than guessing."
  exit 1
fi
if [ "$GITHUB_SHA" != "$MAIN" ]; then
  echo "::error title=Deploy refused::this run is $GITHUB_SHA but main's newest commit is $MAIN. Only main's newest commit can go live: merge the work to main, then dispatch this workflow on main."
  exit 1
fi

GREEN="$(gh api "repos/${GITHUB_REPOSITORY}/actions/workflows/ci.yml/runs?head_sha=${GITHUB_SHA}&event=push&branch=main&status=success&per_page=1" --jq '.total_count' 2>/dev/null)" || GREEN=""
case "$GREEN" in
  ''|*[!0-9]*)
    echo "::error title=Deploy refused::could not read ci's result for $GITHUB_SHA (answer: '$GREEN') — refusing rather than guessing."
    exit 1 ;;
esac
if [ "$GREEN" -lt 1 ]; then
  echo "::error title=Deploy refused::ci has not passed on $GITHUB_SHA yet. Wait for its green run on main, then dispatch again."
  exit 1
fi

echo "deploy allowed — $GITHUB_SHA is main's newest commit and ci passed on it"
