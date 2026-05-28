#!/usr/bin/env bash
# Конвертация HTML-актов в PDF через headless Google Chrome.
# Запуск: ./scripts/acts/build-pdfs.sh
# Результат: PDF-файлы кладутся в public/docs/ (источник)
#            и копируются в /charter-flow/docs/ (сборка) при следующем npm run build.
set -euo pipefail

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="$(cd "$SCRIPT_DIR/../../public/docs" && pwd)"

cd "$SCRIPT_DIR"

build_pdf() {
  local html="$1"
  local pdf="$2"
  echo "→ $html → $pdf"
  "$CHROME" \
    --headless=new \
    --disable-gpu \
    --no-pdf-header-footer \
    --print-to-pdf="$OUT_DIR/$pdf" \
    --virtual-time-budget=5000 \
    "file://$SCRIPT_DIR/$html" 2>/dev/null
}

build_pdf "prilozhenie-6-akt-zaloga.html" "prilozhenie-6-akt-zaloga.pdf"
build_pdf "prilozhenie-7-akt-vzyskaniya.html" "prilozhenie-7-akt-vzyskaniya.pdf"

echo ""
echo "Готово. PDF-файлы:"
ls -la "$OUT_DIR"/*.pdf
