#!/usr/bin/env bash
#
# indexnow.sh — push-нотификация Яндекс / Bing / Seznam о новых или обновлённых URL.
#
# Использование:
#   ./indexnow.sh                              # пушит дефолтный набор (журнал + главные)
#   ./indexnow.sh https://ccapital.pro/...     # пушит только указанные URL
#   ./indexnow.sh --recent                     # пушит URL, изменённые в последнем git-коммите
#
# Документация: https://yandex.com/support/webmaster/indexing-options/index-now.html
#               https://www.indexnow.org/
#
# Ключ должен лежать в корне сайта по адресу:
#   https://ccapital.pro/<KEY>.txt
# с единственной строкой — самим ключом.

set -euo pipefail

KEY="a78b270e50cb09e9d93622904ad560acb6a00ef67c9a71a76815103cb770260e"
HOST="ccapital.pro"
KEY_LOC="https://${HOST}/${KEY}.txt"
ENDPOINT="https://yandex.com/indexnow"

if [[ -t 1 ]]; then
  C_GRN=$'\033[0;32m'; C_BLU=$'\033[0;34m'; C_YEL=$'\033[1;33m'; C_RED=$'\033[0;31m'; C_RST=$'\033[0m'
else
  C_GRN=""; C_BLU=""; C_YEL=""; C_RED=""; C_RST=""
fi

say()  { printf '%s▸ %s%s\n' "$C_BLU" "$*" "$C_RST"; }
ok()   { printf '%s✓ %s%s\n' "$C_GRN" "$*" "$C_RST"; }
warn() { printf '%s! %s%s\n' "$C_YEL" "$*" "$C_RST"; }
err()  { printf '%s✗ %s%s\n' "$C_RED" "$*" "$C_RST" >&2; }

# --- собираем список URL ---
URLS=()

if [[ "${1:-}" == "--recent" ]]; then
  say "Сбор изменённых файлов из последнего коммита"
  while IFS= read -r f; do
    [[ "$f" == *.html ]] || continue
    [[ "$f" == "404.html" ]] && continue
    [[ "$f" == yandex_*.html ]] && continue
    # team.html в robots.txt запрещён
    [[ "$f" == "team.html" ]] && continue
    if [[ "$f" == "index.html" ]]; then
      URLS+=("https://${HOST}/")
    else
      URLS+=("https://${HOST}/${f}")
    fi
  done < <(git diff-tree --no-commit-id --name-only -r HEAD)
elif [[ $# -gt 0 ]]; then
  URLS=("$@")
else
  # дефолт: журнал + главные продуктовые страницы
  URLS=(
    "https://${HOST}/"
    "https://${HOST}/journal.html"
    "https://${HOST}/private.html"
    "https://${HOST}/pay.html"
    "https://${HOST}/fund.html"
    "https://${HOST}/property.html"
    "https://${HOST}/freedom-route.html"
    "https://${HOST}/journal/hongkong-replaces-switzerland-2026.html"
    "https://${HOST}/journal/uk-sanctions-crypto-p2p-2026.html"
    "https://${HOST}/journal/b2b-crypto-settlements-clean-usdc.html"
    "https://${HOST}/journal/offshore-loan-uk-look-through.html"
    "https://${HOST}/journal/singapore-family-office.html"
    "https://${HOST}/journal/crypto-exchange-aml-illusion.html"
  )
fi

if [[ ${#URLS[@]} -eq 0 ]]; then
  warn "Нет URL для пуша — выхожу."
  exit 0
fi

# --- 1) проверяем что ключ доступен на сайте ---
say "Проверка наличия ключа: ${KEY_LOC}"
KEY_STATUS=$(curl -sLo /dev/null -w "%{http_code}" "$KEY_LOC")
if [[ "$KEY_STATUS" != "200" ]]; then
  err "Файл ключа отдаёт HTTP ${KEY_STATUS}, IndexNow не примет запрос."
  err "Убедись, что ${KEY}.txt задеплоен в корень сайта."
  exit 1
fi
ok "Ключ доступен"

# --- 2) собираем JSON и POST'им ---
say "Пушим ${#URLS[@]} URL в ${ENDPOINT}"
for u in "${URLS[@]}"; do echo "   · ${u}"; done

JSON=$(python3 -c "
import json, sys
print(json.dumps({
    'host': '${HOST}',
    'key': '${KEY}',
    'keyLocation': '${KEY_LOC}',
    'urlList': $(printf '%s\n' "${URLS[@]}" | python3 -c 'import sys,json; print(json.dumps([l.strip() for l in sys.stdin if l.strip()]))')
}))
")

HTTP_CODE=$(curl -sSL -w "%{http_code}" -o /tmp/indexnow.out \
  -X POST "$ENDPOINT" \
  -H "Content-Type: application/json; charset=utf-8" \
  -H "Host: yandex.com" \
  --data "$JSON")

case "$HTTP_CODE" in
  200) ok  "200 OK — Яндекс принял пуш";;
  202) ok  "202 Accepted — Яндекс поставил в очередь";;
  400) err "400 Bad Request — неверный JSON или host"; cat /tmp/indexnow.out; exit 1;;
  403) err "403 Forbidden — ключ не валиден или файл недоступен"; cat /tmp/indexnow.out; exit 1;;
  422) err "422 Unprocessable — URL не принадлежит host"; cat /tmp/indexnow.out; exit 1;;
  429) warn "429 Too Many Requests — превышен лимит, попробуй позже";;
  *)   warn "HTTP ${HTTP_CODE}"; cat /tmp/indexnow.out;;
esac

echo
ok "Готово. Можно посмотреть статус в Я.Вебмастер → Индексирование → Переобход страниц"
