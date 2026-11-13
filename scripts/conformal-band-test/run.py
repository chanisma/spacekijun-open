"""예측구간(컨포멀) 회귀 — `python scripts/conformal-band-test/run.py`

여기서 지키는 것은 **눈으로 안 잡히는 두 가지**다.
  ① 부호 뒤집기 — 잔차 r = 예측 − 실측 이므로 실측 구간은 [예측 − q_hi, 예측 − q_lo] 다.
     틀려도 값이 그럴듯해 보이고, 편향이 있을 때만 반대쪽으로 붙는다.
  ② 폴백 순서 — 넓은 칸이 먼저 잡히면 늘 폴백을 쓰게 되는데 결과는 여전히 "띠가 있는" 화면이다.
"""
import sys
from pathlib import Path

# 윈도우 기본 콘솔은 cp949 라 한글 출력이 죽는다. 호출부가 환경변수를 설정하지 않아도
# 돌아가야 하므로 여기서 직접 맞춘다(`python scripts/conformal-band-test/run.py` 한 줄로 실행).
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:  # noqa: BLE001 - 재설정이 불가능한 환경이면 그냥 둔다
    pass

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "ml"))
from train_grade_predictor import band_lookup, apply_band  # noqa: E402

ok = fail = 0


def check(name, got, want):
    global ok, fail
    if got == want:
        ok += 1
    else:
        fail += 1
        print(f"  FAIL {name}: got {got!r} want {want!r}")


# ── ① 부호 뒤집기 ─────────────────────────────────────────────────────────
# 모델이 계통적으로 비관적이면(잔차가 양수) 실제는 예측보다 **좋다**(등급 숫자가 작다)
# -> 띠 전체가 예측보다 아래(=더 좋은 등급)에 놓여야 한다.
check("비관 편향이면 띠가 예측보다 좋은 쪽", apply_band(5.0, [0.5, 1.5], 9), (3.5, 4.5))
check("낙관 편향이면 띠가 예측보다 나쁜 쪽", apply_band(5.0, [-1.5, -0.5], 9), (5.5, 6.5))
check("편향 없으면 예측을 가운데 둔다", apply_band(4.0, [-1.0, 1.0], 9), (3.0, 5.0))
check("lo 는 언제나 hi 보다 작다", apply_band(4.0, [-1.0, 1.0], 9)[0] < apply_band(4.0, [-1.0, 1.0], 9)[1], True)

# 범위 밖으로 나가지 않는다 — 9등급제는 [1,9], 5등급제는 [1,5]
check("상단 clamp(9등급제)", apply_band(8.5, [-1.5, 0.5], 9), (8.0, 9.0))
check("하단 clamp(9등급제)", apply_band(1.2, [-0.5, 1.5], 9), (1.0, 1.7))
check("5등급제는 5 를 넘지 않는다", apply_band(4.8, [-1.0, 0.2], 5), (4.6, 5.0))
check("밴드가 없으면 구간도 없다", apply_band(4.0, None, 9), (None, None))

# ── ② 폴백 순서 ───────────────────────────────────────────────────────────
cells = {
    "3-1|1|korean": [-0.1, 0.1],
    "3-1|1|*": [-0.2, 0.2],
    "*|1|korean": [-0.3, 0.3],
    "*|1|*": [-0.4, 0.4],
    "*|*|*": [-0.9, 0.9],
}
check("가장 좁은 칸이 이긴다", band_lookup(cells, "3-1", 1, "korean"), [-0.1, 0.1])
check("교과가 없으면 학기·단계", band_lookup(cells, "3-1", 1, "math"), [-0.2, 0.2])
check("학기가 없으면 단계·교과", band_lookup(cells, "2-2", 1, "korean"), [-0.3, 0.3])
check("학기·교과 둘 다 없으면 단계", band_lookup(cells, "2-2", 1, "math"), [-0.4, 0.4])
check("단계도 없으면 전체", band_lookup(cells, "2-2", 3, "math"), [-0.9, 0.9])
check("cells 가 없으면 None", band_lookup(None, "3-1", 1, "korean"), None)
check("빈 cells 면 None", band_lookup({}, "3-1", 1, "korean"), None)
check("전체 폴백조차 없으면 None", band_lookup({"3-1|1|korean": [0, 1]}, "1-2", 2, "math"), None)

# ── 실제 산출물이 규약을 지키는가 ─────────────────────────────────────────
import json  # noqa: E402

out = Path(__file__).resolve().parents[2] / "ml" / "out" / "grade_predictions.json"
if out.exists():
    data = json.loads(out.read_text(encoding="utf-8"))
    bad_order = bad_range = with_band = 0
    for st in data["students"]:
        gmax = float(st.get("grade_system") or 9)
        for pr in st.get("predictions") or []:
            for cell in (pr.get("grades") or {}).values():
                if not cell or cell.get("lo") is None:
                    continue
                with_band += 1
                if not (cell["lo"] <= cell["hi"]):
                    bad_order += 1
                if not (1.0 <= cell["lo"] <= gmax and 1.0 <= cell["hi"] <= gmax):
                    bad_range += 1
    check("산출물: lo <= hi", bad_order, 0)
    check("산출물: 등급 범위 안", bad_range, 0)
    check("산출물: 구간이 실제로 붙어 있다", with_band > 0, True)
    print(f"  (산출물 {with_band}칸 검사)")
else:
    print("  ! ml/out/grade_predictions.json 없음 — 산출물 검사 건너뜀")

print()
print(f"예측구간 — 통과 {ok} / 실패 {fail}")
sys.exit(1 if fail else 0)
