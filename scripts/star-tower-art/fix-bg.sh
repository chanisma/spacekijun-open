#!/usr/bin/env bash
# 배경 지시를 어긴 판(검은 바탕 + 빛 번짐)을 «다시 그리기» 대신 «배경만 바꾸기»로 고친다(2026-10-10).
# codex 는 캐릭터·소품에 조명을 넣으려는 버릇이 있어 처음 6판 중 3판이 검은 바탕으로 나왔다. 새로 그리면 또 그럴 수 있고
# 그림도 달라진다 — 실패한 그림을 넘기고 스프라이트는 그대로, 바탕만 마젠타로 바꾸게 하면 구성이 보존된다.
# 입력 = .tmp/star-tower-art/raw/<sheet>-darkbg.png → 결과 = <sheet>-raw.png. 한 번에 하나씩(병렬 금지 — generate.sh 참고).
# bash scripts/star-tower-art/fix-bg.sh fisher floors-c
set -u
cd "$(dirname "$0")/../.."
OUT=.tmp/star-tower-art/raw
for sheet in "$@"; do
  src="$OUT/$sheet-darkbg.png"; target="$OUT/$sheet-raw.png"
  [ -f "$src" ] || { echo "no $src"; continue; }
  [ -f "$target" ] && { echo "skip $target"; continue; }
  prompt="$OUT/prompt-fix-$sheet.txt"
  cat > "$prompt" <<'EOF'
Use the image generation tool to create ONE image. Do not write code.

Edit the attached sprite sheet. Keep every sprite EXACTLY the same: same characters/objects, same poses, same positions, same sizes, same colors, same pixel-art blocks, same dark outlines.
Change ONLY the background: replace the dark background and ALL glow, halo, light bloom and colored haze around the sprites with ONE flat solid pure magenta #FF00FF that fills the whole image edge to edge.
There must be no lighting effect at all outside the sprites. Landscape 1536x1024.
EOF
  stamp="$OUT/.stamp-fix-$sheet"; touch "$stamp"; sleep 1
  codex exec --skip-git-repo-check -i "$src" < "$prompt" > "$OUT/fix-$sheet.log" 2>&1
  made=$(find "$CODEX_HOME/generated_images" -newer "$stamp" -name '*.png' -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2-)
  if [ -n "$made" ]; then cp "$made" "$target"; echo "made $target"; else echo "FAILED $sheet (see $OUT/fix-$sheet.log)"; fi
done
