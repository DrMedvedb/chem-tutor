#!/usr/bin/env bash
# start.sh — запуск сервера + cloudflared туннеля
#
# Требуется установленный cloudflared:
#   https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

set -e

PORT="${PORT:-3000}"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "❌ cloudflared не найден в PATH."
  echo ""
  echo "Установи:"
  echo "  macOS:   brew install cloudflared"
  echo "  Ubuntu:  см. https://pkg.cloudflare.com/"
  echo "  Windows: winget install --id Cloudflare.cloudflared"
  echo ""
  echo "Или запусти только сервер: npm start"
  exit 1
fi

echo "🧪 Запускаю сервер на порту $PORT..."
npm start &
SERVER_PID=$!

cleanup() {
  echo ""
  echo "🛑 Останавливаю сервер..."
  kill $SERVER_PID 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

echo "⏳ Жду готовности сервера..."
for i in $(seq 1 30); do
  if curl -sf "http://localhost:$PORT/" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

echo ""
echo "🌐 Открываю туннель cloudflared..."
echo "   Ссылка появится ниже (ищи https://xxx.trycloudflare.com)"
echo ""
echo "═══════════════════════════════════════════════"

cloudflared tunnel --url "http://localhost:$PORT"