"""
낚시꾼 스프라이트에서 «그려진 낚싯줄·찌»를 지운다 — 장면 엔진이 낚싯대 끝에서 «수면까지» 줄을 다시 긋는다.

codex 그림의 줄은 판자 높이까지만 내려온다. 게임에서는 갑판이 수면보다 20px 남짓 위라 그대로 두면 찌가 허공에 뜬다.

  1) 줄 = 밝고 채도 낮은 화소가 세로로 3칸 이상 이어진 것 → 지운다
  2) 가장 큰 연결 덩어리만 남긴다 — 줄이 사라져 떨어져 나온 찌, 옆 자세 칸에서 넘어온 줄 조각이 함께 사라진다
     (2026-10-10 첫 판: «아래만 지우기»는 낚싯대 끝 대신 줄 꼭대기를 끝으로 잡아 줄 토막이 남았고, 옆 칸 줄이 «입질» 왼쪽에 붙었다)

  python scripts/star-tower-art/strip-line.py public/images/star-tower/fisher-wait.png ...
  --keep-line  줄은 그대로 두고 2)만(줄이 없는 자세)
"""
import sys
import numpy as np
from PIL import Image


def largest_component(a: np.ndarray) -> np.ndarray:
    h, w = a.shape
    label = np.zeros((h, w), dtype=np.int32)
    best, best_n, cur = 0, 0, 0
    for y in range(h):
        for x in range(w):
            if not a[y, x] or label[y, x]:
                continue
            cur += 1
            stack, n = [(y, x)], 0
            label[y, x] = cur
            while stack:
                cy, cx = stack.pop()
                n += 1
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < h and 0 <= nx < w and a[ny, nx] and not label[ny, nx]:
                            label[ny, nx] = cur
                            stack.append((ny, nx))
            if n > best_n:
                best, best_n = cur, n
    return label == best


keep_line = '--keep-line' in sys.argv
for path in [p for p in sys.argv[1:] if not p.startswith('--')]:
    im = np.array(Image.open(path).convert('RGBA'))
    rgb = im[..., :3].astype(int)
    a = im[..., 3] > 0
    if not keep_line:
        light = a & (rgb.min(-1) > 170) & (rgb.max(-1) - rgb.min(-1) < 50)
        line = np.zeros_like(light)
        h, w = light.shape
        for x in range(w):
            run = 0
            for y in range(h + 1):
                if y < h and light[y, x]:
                    run += 1
                else:
                    if run >= 3:
                        line[y - run:y, x] = True
                    run = 0
        a = a & ~line
    a = largest_component(a)
    im[..., 3] = np.where(a, im[..., 3], 0)
    ys, xs = np.where(a)
    im = im[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    Image.fromarray(im, 'RGBA').save(path)
    print(f'{path}: {im.shape[1]}x{im.shape[0]}')
