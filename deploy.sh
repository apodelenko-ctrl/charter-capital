#!/usr/bin/env bash
#
# deploy.sh — one-shot deploy для ccapital.pro
#
# Что делает:
#   1) Пушит текущую ветку main в origin/main (обычный коммит → исходник).
#   2) Force-зеркалит main в origin/gh-pages (то, что реально билдит GitHub Pages).
#   3) Ждёт билд Pages и проверяет live-страницу.
#
# Использование:
#   ./deploy.sh                  # стандартный деплой
#   ./deploy.sh -m "msg"         # сначала git add -A + commit с msg, потом деплой
#   ./deploy.sh --no-wait        # не ждать билд, выйти сразу после push
#   ./deploy.sh -h | --help      # справка
#
# Требования: ничего, кроме git + curl.

set -euo pipefail

REPO_OWNER="apodelenko-ctrl"
REPO_NAME="charter-capital"
LIVE_URL="https://ccapital.pro/"
MAIN_BRANCH="main"
PAGES_BRANCH="gh-pages"

# --- цвета (только если терминал) ---
if [[ -t 1 ]]; then
  C_RED=$'\033[0;31m'; C_GRN=$'\033[0;32m'; C_YEL=$'\033[1;33m'
  C_BLU=$'\033[0;34m'; C_DIM=$'\033[2m';    C_RST=$'\033[0m'
else
  C_RED=""; C_GRN=""; C_YEL=""; C_BLU=""; C_DIM=""; C_RST=""
fi

say() { printf '%s%s%s\n' "$C_BLU" "▸ $*" "$C_RST"; }
ok()  { printf '%s%s%s\n' "$C_GRN" "✓ $*" "$C_RST"; }
warn(){ printf '%s%s%s\n' "$C_YEL" "! $*" "$C_RST"; }
err() { printf '%s%s%s\n' "$C_RED" "✗ $*" "$C_RST" >&2; }

usage() {
  sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

# --- args ---
COMMIT_MSG=""
WAIT_BUILD=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    -m|--message)  COMMIT_MSG="${2:-}"; shift 2 ;;
    --no-wait)     WAIT_BUILD=0;        shift ;;
    -h|--help)     usage ;;
    *) err "Unknown arg: $1"; exit 2 ;;
  esac
done

# --- sanity ---
cd "$(dirname "$0")"

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$CURRENT_BRANCH" != "$MAIN_BRANCH" ]]; then
  err "Сейчас ветка '$CURRENT_BRANCH', деплоим только из '$MAIN_BRANCH'."
  err "Сначала: git checkout $MAIN_BRANCH"
  exit 1
fi

# --- optional commit ---
if [[ -n "$COMMIT_MSG" ]]; then
  say "git add -A && commit -m \"$COMMIT_MSG\""
  git add -A
  if git diff --cached --quiet; then
    warn "Нет staged-изменений — пропускаю commit"
  else
    git commit -m "$COMMIT_MSG"
    ok "commit создан"
  fi
fi

# --- pre-push checks ---
if ! git diff --quiet || ! git diff --cached --quiet; then
  warn "Есть uncommitted-изменения. Запушу что в HEAD, остальное останется локально."
  printf '%s' "$C_DIM"; git status --short; printf '%s' "$C_RST"
fi

LOCAL_SHA="$(git rev-parse "$MAIN_BRANCH")"
REMOTE_SHA="$(git ls-remote origin "refs/heads/$MAIN_BRANCH" | awk '{print $1}')"

if [[ "$LOCAL_SHA" == "$REMOTE_SHA" ]]; then
  warn "origin/$MAIN_BRANCH уже на $LOCAL_SHA — пушить нечего"
else
  say "Push $MAIN_BRANCH → origin/$MAIN_BRANCH"
  git push origin "$MAIN_BRANCH"
  ok "$MAIN_BRANCH запушен"
fi

# --- mirror to gh-pages ---
say "Mirror $MAIN_BRANCH → origin/$PAGES_BRANCH (force)"
git push origin "$MAIN_BRANCH:$PAGES_BRANCH" --force
ok "$PAGES_BRANCH обновлён"

DEPLOY_SHA="$(git rev-parse "$MAIN_BRANCH")"
printf '%s   commit: %s%s\n' "$C_DIM" "$DEPLOY_SHA" "$C_RST"

# --- wait & verify ---
if [[ "$WAIT_BUILD" -eq 0 ]]; then
  ok "Done (без проверки билда). Сайт обновится через ~1 минуту: $LIVE_URL"
  exit 0
fi

say "Жду билд GitHub Pages (до ~120с)…"
API="https://api.github.com/repos/$REPO_OWNER/$REPO_NAME/actions/runs?per_page=5"

STATUS=""
CONCLUSION=""
for i in $(seq 1 24); do
  sleep 5
  RESPONSE="$(curl -fsS "$API" || true)"
  if [[ -z "$RESPONSE" ]]; then continue; fi
  read -r STATUS CONCLUSION RUN_ID < <(printf '%s' "$RESPONSE" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for r in d.get('workflow_runs',[]):
    if r.get('head_branch')=='$PAGES_BRANCH' and (r.get('head_sha') or '').startswith('$DEPLOY_SHA'[:10]):
        print(r.get('status'), r.get('conclusion') or '-', r.get('id'))
        break
")
  if [[ -n "$STATUS" ]]; then
    printf '  [%02ds] %s / %s\n' "$((i*5))" "$STATUS" "$CONCLUSION"
    if [[ "$STATUS" == "completed" ]]; then break; fi
  else
    printf '  [%02ds] (билд ещё не появился)\n' "$((i*5))"
  fi
done

if [[ "$STATUS" != "completed" ]]; then
  warn "Билд не успел завершиться за 2 минуты. Зайди вручную:"
  warn "  https://github.com/$REPO_OWNER/$REPO_NAME/actions"
  exit 0
fi

if [[ "$CONCLUSION" != "success" ]]; then
  err "Билд закончился: $CONCLUSION"
  err "  https://github.com/$REPO_OWNER/$REPO_NAME/actions/runs/$RUN_ID"
  exit 1
fi

ok "Билд success. Проверяю live…"
LAST_MOD="$(curl -sI "$LIVE_URL" | awk -F': ' 'tolower($1)=="last-modified"{print $2}' | tr -d '\r')"
ok "$LIVE_URL"
ok "last-modified: ${LAST_MOD:-(нет заголовка)}"
