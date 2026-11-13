"""
별까지 쌓기 — codex 판(«도트처럼 보이는 큰 그림») → 진짜 저해상도 스프라이트(public/images/star-tower/).

격자 맞추기(주기·위상 찾기 → 칸 가운데 중앙값 찍기)는 다마고찌의 것을 그대로 쓴다(scripts/tamagotchi-codex/process.py).
여기서 더하는 것은 판 배치뿐 — 열×행 격자로 칸을 나누고 칸마다 스프라이트 하나를 꺼낸다.

  python scripts/star-tower-art/process.py <원본.png> <열> <행> <접두어> <이름1,이름2,...>
  예) python scripts/star-tower-art/process.py .tmp/star-tower-art/raw/floors-b-raw.png 3 2 floor workshop,bedroom,greenhouse,radio,smokehouse,tearoom

주기는 판 하나에 하나(정사각 화소) — 모든 칸의 가장자리를 «한 점수»로 함께 맞춘다. 칸마다 따로 맞추면 한 칸이 배수·약수로 빠진다.

  --core-width=N  주기를 찾지 않고 «아래 들보 폭 = N 게임 화소»가 되게 정한다(층 판 전용).
  ⚠️ codex 가 늘 블록으로 그리지는 않는다 — 2026-10-10 floors-b 는 격자 없는 매끈한 그림이라 주기 찾기가 약수(4.24)로 빠져
  폭 98 짜리 층이 나왔다(첫 판은 57). 층은 «쌓였을 때 폭이 같은가»가 전부라 폭에서 주기를 거꾸로 정한다.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'tamagotchi-codex'))
import numpy as np
from PIL import Image
from process import background_mask, edges_1d, fit_period, fit_grid, sample, despeckle, trim  # noqa: E402

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'images', 'star-tower')


def bottom_beam_width(fg_cell: np.ndarray) -> int:
    """아래 15% 줄 중 가장 넓게 채워진 줄의 폭 — 층의 아래 들보(양옆 기둥 포함)"""
    h = fg_cell.shape[0]
    rows = fg_cell[int(h * 0.85):]
    best = 0
    for r in rows:
        xs = np.where(r)[0]
        if len(xs):
            best = max(best, int(xs.max() - xs.min() + 1))
    return best


def main():
    flags = [a for a in sys.argv[1:] if a.startswith('--')]
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    core = next((int(f.split('=')[1]) for f in flags if f.startswith('--core-width=')), None)
    # --height=N: 칸들의 높이 중앙값이 N 게임 화소가 되게(낚시꾼 — 격자를 찾으면 53px 로 층보다 커졌다. 열쇠 그림에서 사람은 층의 반쯤)
    target_h = next((int(f.split('=')[1]) for f in flags if f.startswith('--height=')), None)
    # --widths=14,14,30,…: 칸마다 목표 폭(방문자 — 갈매기 14 와 하늘 고래 72 를 한 눈금으로 줄일 수 없다)
    widths_arg = next((f.split('=')[1] for f in flags if f.startswith('--widths=')), None)
    target_ws = [int(v) for v in widths_arg.split(',')] if widths_arg else None
    src, cols, rows, prefix, names = args[0], int(args[1]), int(args[2]), args[3], args[4].split(',')
    if len(names) != cols * rows:
        sys.exit(f'이름 {len(names)}개 ≠ 칸 {cols * rows}개')
    img = np.array(Image.open(src).convert('RGB'))
    bg = background_mask(img)
    # 배경 지시를 어긴 판(검은 바탕·빛 번짐)으로 망가진 스프라이트를 만들지 않는다 — 다시 그릴 것
    if bg.mean() < 0.4:
        sys.exit(f'{src}: 바탕의 {bg.mean():.0%} 만 마젠타 — 배경 지시를 어긴 그림. 지우고 generate.sh 로 다시 그리세요.')
    fg = ~bg
    H, W = fg.shape
    cells = []
    for k in range(cols * rows):
        r, c = divmod(k, cols)
        x0, x1, y0, y1 = c * W // cols, (c + 1) * W // cols, r * H // rows, (r + 1) * H // rows
        sub = fg[y0:y1, x0:x1].copy()
        # 옆 칸 스프라이트가 경계를 넘어 들어온 조각을 버린다 — 열 점유가 이어진(빈틈 ≤ 12px) 가장 긴 구간만 남긴다
        # (2026-10-10 무전실 안테나 접시 끝이 훈제실 칸에 붙어 훈제실 폭이 70 이 됐다)
        occ = sub.sum(0) > 2
        runs, start, gap = [], None, 0
        for x, v in enumerate(occ):
            if v:
                if start is None:
                    start = x
                gap, end = 0, x
            elif start is not None:
                gap += 1
                if gap > 12:
                    runs.append((start, end)); start = None
        if start is not None:
            runs.append((start, end))
        if runs:
            a, b = max(runs, key=lambda r: sub[:, r[0]:r[1] + 1].sum())
            sub[:, :a] = False
            sub[:, b + 1:] = False
        ys, xs = np.where(sub)
        if len(xs) == 0:
            sys.exit(f'{names[k]}: 빈 칸')
        cells.append((img[y0 + ys.min():y0 + ys.max() + 1, x0 + xs.min():x0 + xs.max() + 1],
                      sub[ys.min():ys.max() + 1, xs.min():xs.max() + 1]))
    if target_ws:
        if len(target_ws) != len(names):
            sys.exit('--widths 개수가 이름 개수와 다릅니다')
        p = None
        core = 1
        print(f'{os.path.basename(src)} 칸마다 목표 폭 {target_ws}')
    elif target_h:
        hs = sorted(m.shape[0] for _, m in cells)
        p = hs[len(hs) // 2] / target_h
        core = target_h  # 아래에서 위상 찾기를 건너뛰게
        print(f'{os.path.basename(src)} period {p:.2f} (높이 중앙값 {hs[len(hs) // 2]}px → {target_h})')
    elif core:
        widths = sorted(bottom_beam_width(m) for _, m in cells)
        p = widths[len(widths) // 2] / core
        print(f'{os.path.basename(src)} period {p:.2f} (아래 들보 중앙값 {widths[len(widths) // 2]}px → {core})')
    else:
        p = fit_period([edges_1d(c, m, ax) for c, m in cells for ax in (0, 1)], 4.0, 12.0)
        print(f'{os.path.basename(src)} grid period {p:.2f}')
    os.makedirs(OUT, exist_ok=True)
    for k, (name, (crop, cfg)) in enumerate(zip(names, cells)):
        if target_ws:
            p = crop.shape[1] / target_ws[k]
        if core:
            ox = oy = 0.0  # 격자가 없는 그림 — 위상을 찾을 근거가 없다
        else:
            _, ox = fit_grid(edges_1d(crop, cfg, 1), p - 0.01, p + 0.02)
            _, oy = fit_grid(edges_1d(crop, cfg, 0), p - 0.01, p + 0.02)
        s = trim(despeckle(sample(crop, cfg, p, ox - p if ox > 0 else ox, p, oy - p if oy > 0 else oy)))
        path = os.path.join(OUT, f'{prefix}-{name}.png')
        Image.fromarray(s, 'RGBA').save(path)
        print(f'  {prefix}-{name}.png {s.shape[1]}x{s.shape[0]}')


if __name__ == '__main__':
    main()
