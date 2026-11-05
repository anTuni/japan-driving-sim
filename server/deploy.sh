#!/usr/bin/env bash
# 공유 랭킹 서버 배포 (Cloudflare Workers + KV, 무료 플랜으로 충분)
# 1) npx wrangler login   (브라우저 1회 로그인)   2) ./server/deploy.sh
set -euo pipefail
cd "$(dirname "$0")"
if grep -q 'id = "REPLACE_ME"' wrangler.toml; then
  echo "▶ KV 네임스페이스 생성"
  OUT=$(npx -y wrangler@4 kv namespace create RANK 2>&1)
  ID=$(echo "$OUT" | grep -oE 'id = "[0-9a-f]+"' | head -1 | grep -oE '[0-9a-f]{32}')
  [ -n "$ID" ] || { echo "$OUT"; echo "KV id 를 찾지 못했습니다"; exit 1; }
  sed -i '' "s/REPLACE_ME/$ID/" wrangler.toml
  echo "   id = $ID"
fi
echo "▶ Worker 배포"
npx -y wrangler@4 deploy 2>&1 | tee /tmp/jds-deploy.log
URL=$(grep -oE 'https://[a-z0-9.-]+\.workers\.dev' /tmp/jds-deploy.log | head -1)
echo
echo "✅ 랭킹 API: $URL"
echo "   프로젝트 루트의 .env.production 에  VITE_RANK_API=$URL  로 적고 git push 하면 공유 랭킹이 켜집니다."
