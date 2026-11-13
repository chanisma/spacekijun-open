#!/usr/bin/env bash
# 별까지 쌓기 — codex CLI 내장 image_generation 으로 스프라이트 판을 그린다(2026-10-10).
# 결과 = .tmp/star-tower-art/raw/<sheet>-raw.png (이미 있으면 건너뛴다 — 다시 그리려면 지운다). 도트로 바꾸기 = process.py.
#
# ⚠️ 한 번에 하나씩 돌린다 — 병렬로 돌리면 «stamp 보다 새 파일» 찾기가 남의 결과를 집어 온다(2026-10-10 시험에서 두 장이 같은 파일이 됐다).
# ⚠️ `-i <FILE>...` 는 파일을 여러 개 받으므로 프롬프트는 stdin 으로(인자로 주면 파일 이름으로 먹힌다).
# ⚠️ 층 판은 첫 판(floors-a)을 참조로 넘긴다 — 판마다 따로 그리면 조명 방향·팔레트·폭이 달라져 쌓았을 때 남의 건물이 된다.
# bash scripts/star-tower-art/generate.sh floors-b floors-c fisher items clouds
set -u
cd "$(dirname "$0")/../.."
OUT=.tmp/star-tower-art/raw
mkdir -p "$OUT"
REF="$OUT/floors-a-raw.png"

STYLE='STYLE (very important): polished, cozy modern pixel art. Every game pixel is a crisp square block of exactly 6x6 image pixels. No anti-aliasing, no blur, no painterly strokes, no gradients inside a block. Rich but limited palette, warm late-afternoon light from the left. Hand-crafted detail: wood grain planks, nails, ropes, patched roofs, plants. ORIGINAL design. No text, no letters, no numbers, no UI, no watermark.'
BG='MOST IMPORTANT: the background must be ONE flat solid color, pure magenta #FF00FF, filling the whole image edge to edge. NOT black, NOT dark, NOT brown, NO glow, NO halo, NO vignette, NO light bloom, NO shadows behind the sprites. Every pixel that is not part of a sprite is exactly #FF00FF.'
FLOOR_RULES='Landscape 1536x1024. A sprite sheet of SIX separate stackable floor modules for the SAME tall hand-built tower home as the attached reference sheet (same art style, same palette, same wooden corner posts with grey metal brackets, same green-teal roof trim, same lighting). Arrange them in a 3 columns x 2 rows grid, each module centered in its cell with plenty of magenta space around it.
Every module is drawn from the same straight front view and has EXACTLY the same core building width as the modules in the reference (about 56 game pixels wide) with the same wooden corner posts, so they stack perfectly; small add-ons (balconies, awnings, pipes, plant boxes) may stick out to the sides. Each module is about 34 game pixels tall with a flat bottom beam and a flat top beam.'

describe() {
  case "$1" in
    floors-b) echo "$FLOOR_RULES
1) Workshop: a pegboard of tools, a saw on a workbench, wood shavings, a small vice, a hanging lamp.
2) Bedroom: a cozy bunk bed with a patchwork quilt, a round window with curtains, a small rug.
3) Greenhouse: glass panes in wooden frames, tomato vines and hanging pots inside, a watering can.
4) Radio room: an old tube radio set with dials and one blinking red light, a small antenna dish sticking out to the right side, coiled cables.
5) Smokehouse: rows of hanging smoked fish, wooden slat walls, a small smoke vent with a wisp of grey smoke.
6) Tea room: paper lanterns, a low table with a teapot and cups, sliding paper-screen window with warm light." ;;
    floors-c) echo "$FLOOR_RULES
1) Music room: a brass gramophone with a big horn, a guitar on the wall, sheet music on a stand.
2) Map room: sea charts pinned on the wall, a brass compass, a small globe, a desk with a lamp.
3) Aquarium: a big glass water tank in the wall with small colorful fish and seaweed, bubbles.
4) Bathhouse: a copper bathtub, a stack of towels, soft steam, small round porthole window.
5) Bell loft: a bronze bell hanging from a wooden beam with a pull rope, open arches on both sides.
6) Stargazer study: a chalkboard covered with star charts and constellation lines, a small brass orrery on a desk, a telescope eyepiece." ;;
    fisher) echo "Landscape 1536x1024. A character sprite sheet: SIX poses of the same small original character in ONE horizontal row, each centered in an equal-width column, all on the same baseline. The character is about 26 game pixels tall: a young student wearing a mustard bucket hat, a long red knitted scarf, a navy cardigan, rolled-up olive trousers, brown boots. Side view facing right, sitting on the edge of a short wooden plank (draw only the plank, about 16 game pixels wide, under them) holding a bamboo fishing rod. The rod and line stay inside the character's column.
Poses left to right:
1) waiting — relaxed, rod held loosely, line hanging straight down
2) bite — leaning forward alert, rod tip bent down
3) reeling — pulling back, rod strongly bent
4) caught — holding up a shiny silver fish with both hands, happy face, rod resting on the knee
5) dozing — head nodding, eyes closed, rod resting on the knee
6) looking up — leaning back on both hands, gazing up at the sky, rod laid beside them
Same exact character design, colors and proportions in all six poses." ;;
    items) echo "Landscape 1536x1024. An item icon sheet: EIGHT separate small icons in a 4 columns x 2 rows grid, each centered in its cell with plenty of magenta space. Each icon is about 18 game pixels wide, with a dark 1-pixel outline.
Row 1: 1) a small silver sardine  2) a blue striped mackerel  3) a flat brown flounder  4) a rare glowing star-fish shaped like a five-point star, pale gold.
Row 2: 5) a piece of weathered driftwood log  6) a rusty metal gear  7) a corked glass bottle with a rolled paper letter inside  8) a small faceted crystal star shard, pale blue and violet." ;;
    clouds) echo "Landscape 1536x1024. A sheet of SIX separate fluffy cumulus clouds in a 3 columns x 2 rows grid, each centered in its cell with plenty of magenta space. Clouds are WHITE with soft lilac-grey shading on the bottom-right and a bright top edge, pixel-art lumpy outlines, no outline stroke. Sizes vary: two large (about 70 game pixels wide), two medium (about 50), two small (about 30). Flat-ish bottoms." ;;
    # 하늘의 방문자(2026-10-10) — 탑이 높아질수록 다른 하늘. 같은 화풍이 되도록 첫 층 판을 참조로 넘긴다(아래 case)
    visitors-a) echo "Landscape 1536x1024. A sprite sheet of SIX separate sky-visitor sprites for the SAME pixel-art world as the attached reference sheet (same palette, same outline style, same lighting from the left). Arrange them in a 3 columns x 2 rows grid, each centered in its cell with plenty of magenta space. All side views facing RIGHT.
1) a white seagull with grey wingtips, wings UP (about 14 game pixels wide)
2) the SAME seagull, wings DOWN
3) a hot-air balloon with a patched striped envelope (cream, teal, red), a wicker basket and two small sandbags (about 30 game pixels tall)
4) a small wooden airship: cigar-shaped canvas balloon with wooden ribs, a small wooden gondola below with a round window, a propeller at the back, a tiny pennant flag (about 44 game pixels wide)
5) a small floating sky island: a chunk of earth and rock with grass on top, one leafy tree, and a thin waterfall falling off one edge (about 40 game pixels wide)
6) a diamond-shaped paper kite with a long ribbon tail (about 16 game pixels tall)" ;;
    visitors-b) echo "Landscape 1536x1024. A sprite sheet of SIX separate sky-visitor sprites for the SAME pixel-art world as the attached reference sheet (same palette, same outline style, same lighting from the left). Arrange them in a 3 columns x 2 rows grid, each centered in its cell with plenty of magenta space.
1) a gentle SKY WHALE swimming through the air facing right: deep blue back, pale belly with grooves, tiny gold star freckles on its back, long pectoral fin (about 72 game pixels wide)
2) a whale TAIL FLUKE rising out of the sea with a small white splash at its base (only the tail and splash, about 26 game pixels wide)
3) a large MERCHANT AIRSHIP facing LEFT: a wooden ship hull with a striped red-and-cream awning on deck, cargo crates and barrels, two hanging lanterns, a rope ladder hanging down from the hull, and a big patched canvas balloon above held by ropes (about 84 game pixels wide)
4) an old broken SATELLITE drifting: a boxy gold-foil body, one bent solar panel, a small dish antenna (about 30 game pixels wide)
5) a small STAR SPIRIT: a round pale-gold five-pointed star creature with a tiny sleepy face and little stubby arms (about 14 game pixels tall). Do NOT draw any glow around it.
6) a SKY JELLYFISH: a translucent lavender bell with soft pink trailing tentacles (about 22 game pixels tall). Do NOT draw any glow around it." ;;
    # 희귀 물고기(2026-10-10 B — 물고기 도감). 시각·날씨·계절마다 다른 물고기 — 처음 아이콘 판(items)과 같은 화풍이 되게 그 판을 참조로
    fish-rare) echo "Landscape 1536x1024. An item icon sheet: EIGHT separate small rare FISH icons in a 4 columns x 2 rows grid, each centered in its cell with plenty of magenta space. Same pixel-art style, outline and size as the fish in the attached reference sheet (about 22 game pixels wide), all side views facing LEFT like the reference.
Row 1: 1) MOONLIGHT SWEETFISH: slim pale silver-blue fish with a small crescent-moon marking on its side  2) SUNSET KOI: plump orange-and-pink koi with flowing fins  3) DAWN TROUT: trout with a soft pink-violet stripe and tiny dark spots  4) RAIN EEL: long slate-grey eel with pale raindrop-shaped spots
Row 2: 5) CHERRY-BLOSSOM MINNOW: small pale pink fish whose fins look like cherry petals  6) SUMMER FLYING FISH: blue fish with large spread wing-like fins  7) AUTUMN MAPLE PERCH: red-orange perch with maple-leaf shaped dorsal fin  8) ICE SMELT: small translucent icy-blue fish with white frost sparkles drawn as pixels (no glow)." ;;
    # 등성 물고기(2026-10-23 — 탑을 완성할수록 깊은 바다에서). 희귀 물고기 판과 같은 화풍이 되게 그 판을 참조로(아래 case)
    fish-deep) echo "Landscape 1536x1024. An item icon sheet: FOUR separate small deep-sea FISH icons in a 2 columns x 2 rows grid, each centered in its cell with plenty of magenta space. Same pixel-art style, outline and size as the fish in the attached reference sheet (about 22 game pixels wide), all side views facing LEFT like the reference.
1) STAR SEAHORSE: a small curled seahorse, deep navy body with tiny pale-gold star dots
2) LANTERN ANGLERFISH: a round dark plum anglerfish with a small warm-yellow lantern lure on a thin stalk above its head (no glow around it)
3) GALAXY MANTA RAY: a wide manta ray seen from slightly above, deep indigo with violet and pink speckles like a galaxy
4) COMET MARLIN: a sleek blue marlin with a long pointed bill and a pale-cyan streaming tail fin like a comet trail (no glow)." ;;
    # 등성 방문자(2026-10-23 — 탑을 완성할수록 새 손님). 첫 층 판을 참조로(아래 case)
    visitors-c) echo "Landscape 1536x1024. A sprite sheet of FOUR separate sky-visitor sprites for the SAME pixel-art world as the attached reference sheet (same palette, same outline style, same lighting from the left). Arrange them in a 2 columns x 2 rows grid, each centered in its cell with plenty of magenta space. All side views facing RIGHT.
1) a folded PAPER CRANE (origami) gliding, cream paper with one faded red stripe (about 18 game pixels wide)
2) a SKY LANTERN: a small paper lantern rising, warm orange paper with a tiny flame inside, thin bamboo frame (about 14 game pixels tall). Do NOT draw any glow around it.
3) a CLOUD FOX: a small white fox made of fluffy cloud puffs, leaping, with a long curling cloud tail and two pink ear tips (about 34 game pixels wide)
4) a STARLIGHT TRAIN: a tiny old steam locomotive with two small carriages, dark navy body with gold trim and warm-lit windows, a puff of pale steam (about 70 game pixels wide)." ;;
  esac
}

for sheet in "$@"; do
  target="$OUT/$sheet-raw.png"
  [ -f "$target" ] && { echo "skip $target"; continue; }
  prompt="$OUT/prompt-$sheet.txt"
  {
    echo 'Use the image generation tool to create ONE image. Do not write code.'
    echo
    echo "$BG"
    echo
    describe "$sheet"
    echo
    echo "$STYLE"
    echo
    echo "$BG"
  } > "$prompt"
  stamp="$OUT/.stamp-$sheet"; touch "$stamp"; sleep 1
  case "$sheet" in floors-*|visitors-*) args=(-i "$REF");; fish-rare) args=(-i "$OUT/items-raw.png");; fish-deep) args=(-i "$OUT/fish-rare-raw.png");; *) args=();; esac
  codex exec --skip-git-repo-check "${args[@]}" < "$prompt" > "$OUT/$sheet.log" 2>&1
  made=$(find "$CODEX_HOME/generated_images" -newer "$stamp" -name '*.png' -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2-)
  if [ -n "$made" ]; then cp "$made" "$target"; echo "made $target"; else echo "FAILED $sheet (see $OUT/$sheet.log)"; fi
done
