#!/bin/bash
set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# --- TIMESTAMP LOGGER FUNCTION ---
log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

DATE_STAMP=$(date +%F)
FIX_BRANCH="automation/mechanical-fixes-$DATE_STAMP"
EXP_BRANCH="automation/heavy-fixes-$DATE_STAMP"

# ----------------------------------------------------
# PART 1: Mechanical Cleanups & Secure Dependency Bumps
# ----------------------------------------------------
log_message "Starting Phase 1: Mechanical cleanups and repository synchronization..."

git checkout main
log_message "Pulling latest upstream updates from origin main..."
git pull origin main

git checkout -b "$FIX_BRANCH"

log_message "Launching Claude for Phase 1 mechanical optimization passes..."
claude -p "Execute Phase 1 from CLAUDE.md. Make mechanical structural upgrades, safely bump outdated/vulnerable minor dependencies, and confirm that the local project builds and passes test cases." --dangerously-skip-permissions

if [ -n "$(git status --porcelain)" ]; then
    log_message "Changes detected. Committing and pushing mechanical adjustments to $FIX_BRANCH..."
    git add .
    git commit -m "chore: automated nightly codebase optimization and security updates"
    git push origin "$FIX_BRANCH"
    
    if command -v gh &> /dev/null; then
        log_message "Generating Pull Request on GitHub..."
        PR_URL=$(gh pr create --title "Automated Nightly Cleanup ($DATE_STAMP)" --body "Verified structural health updates and dependency security patches." --base main --head "$FIX_BRANCH")
        
        log_message "PR created successfully: $PR_URL. Awaiting external review feedback loop..."
        sleep 180 
        
        log_message "Fetching automated code review logs..."
        REVIEW_COMMENTS=$(gh pr view "$PR_URL" --json comments,reviews -q '.comments[].body, .reviews[].body')
        
        if [ -n "$REVIEW_COMMENTS" ]; then
            log_message "Review violations detected. Re-routing feedback to Claude for inline remediation..."
            export REVIEW_COMMENTS
            claude -p "Review the feedback from our PR branch available in the REVIEW_COMMENTS environment variable. Modify the files to resolve these issues completely, then ensure tests pass." --dangerously-skip-permissions
            git add . && git commit -m "chore: resolved external automated review comments" && git push origin "$FIX_BRANCH"
            log_message "Review adjustments pushed successfully."
        else
            log_message "No review violations flagged by external automation rules."
        fi
    fi
fi

# ----------------------------------------------------
# PART 2: Deep Architecture, PRD Extraction, & Interaction Patterns
# ----------------------------------------------------
log_message "Starting Phase 2: Isolated requirements and interaction consistency loop..."
git checkout main
git checkout -b "$EXP_BRANCH"

log_message "Invoking Claude to parse daily conversational traces and synchronize docs/PRD.md..."
claude -p "Read through active chat histories and conversation states. Extract any new features, constraints, or layout adjustments discussed today and append them directly to docs/PRD.md under a new heading for today's date." --dangerously-skip-permissions

log_message "Invoking Claude for architecture refactors, API schema validations, and copy typo audits..."
claude -p "Execute Phase 2 from CLAUDE.md. Run API schema cross-checks, refactor code patterns for interaction/UX consistency, audit copy typos, and compile daily release notes to CHANGELOG.md. Finally, output your verification checklist into docs/NIGHTLY_AUDIT.md." --dangerously-skip-permissions

if [ -n "$(git status --porcelain)" ]; then
    log_message "Staging and committing architectural updates to $EXP_BRANCH..."
    git add .
    git commit -m "feat(experimental): nightly comprehensive architecture overhaul, PRD sync, and changelog"
    git push origin "$EXP_BRANCH"
    
    if command -v gh &> /dev/null; then
        log_message "Generating isolated experimental Pull Request on GitHub..."
        gh pr create --title "Review: Nightly Comprehensive Overhaul & PRD Updates ($DATE_STAMP)" \
                     --body "This PR contains deep architectural refactors, design-system interaction adjustments, an API schema sync, localization typo audits, changelog updates, and automated PRD logs. See docs/NIGHTLY_AUDIT.md for manual test tasks." \
                     --base main \
                     --head "$EXP_BRANCH"
        log_message "Experimental architectural PR created successfully."
    fi
fi

log_message "Nightly workflow complete. Returning workspace to main branch."
git checkout main
