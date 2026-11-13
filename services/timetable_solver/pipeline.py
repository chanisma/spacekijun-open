"""Expand subject neighborhoods, then reconcile all grades with full constraints."""
import copy
import time
from collections import defaultdict
from types import SimpleNamespace
from .model import solve

BUDGETS = {"quick": 90, "standard": 360, "thorough": 600, "exact": 1200}


def subject_neighborhoods(source, grade):
    subjects = defaultdict(lambda: {"students": set(), "common": False, "major": False})
    for lesson in source["lessons"]:
        if lesson["grade"] != grade:
            continue
        item = subjects[lesson["subjectName"]]
        item["students"].update(lesson["studentCodes"])
        item["common"] |= not lesson["isElective"]
        item["major"] |= lesson.get("isMajor", False)
    common = sorted(k for k, v in subjects.items() if v["common"])
    ranked = sorted((k for k in subjects if k not in common),
                    key=lambda k: (-int(subjects[k]["major"]), -len(subjects[k]["students"]), k))
    sizes = sorted(set([min(4, len(ranked)), min(8, len(ranked)), len(ranked)]))
    return [common + ranked[:size] for size in sizes]


def validate_request(payload):
    source = payload["input"]
    lessons = source["lessons"]
    if not source["options"]["hard"]["studentConflict"] or not source["options"]["hard"]["teacherConflict"]:
        raise ValueError("학생·교사 충돌 검사를 활성화해 주세요.")
    if not 1 <= len(lessons) <= 1500 or not 1 <= source["grid"]["days"] <= 7 or not 1 <= source["grid"]["periodsPerDay"] <= 12:
        raise ValueError("지원 범위를 벗어난 수업 수 또는 격자입니다.")
    if source.get("fixedBlocks"):
        raise ValueError("고정 활동은 수업별 차단 칸으로 반영해 주세요.")
    ids = {l["id"] for l in lessons}
    if len(ids) != len(lessons) or any(not l.get("teacherId") for l in lessons):
        raise ValueError("수업 ID 중복 또는 교사 연결 누락을 확인해 주세요.")
    if sum(len(l["studentCodes"]) for l in lessons) > 100000:
        raise ValueError("수강 명단이 너무 큽니다.")
    if any(len(set(l["studentCodes"])) != len(l["studentCodes"]) for l in lessons):
        raise ValueError("중복 수강 명단을 확인해 주세요.")
    groups = defaultdict(set)
    for l in lessons:
        groups[l["offeringId"]].add((l["grade"], l["subjectName"], l["isElective"], tuple(sorted(l["studentCodes"]))))
    if any(len(v) != 1 for v in groups.values()):
        raise ValueError("같은 분반의 수업별 명단 또는 과목이 다릅니다.")
    initial = payload.get("placements", [])
    if initial and (len(initial) != len(ids) or {p["lessonId"] for p in initial} != ids):
        raise ValueError("초기 배치에 누락 또는 중복이 있습니다.")
    for p in initial + source["pinned"]:
        if p["lessonId"] not in ids or not 0 <= p["dayIndex"] < source["grid"]["days"] or not 1 <= p["period"] <= source["grid"]["periodsPerDay"]:
            raise ValueError("초기 또는 고정 배치가 격자 범위를 벗어납니다.")
    return source


def run_pipeline(payload, progress=lambda value: None):
    source = validate_request(payload)
    start = time.monotonic()
    budget = BUDGETS.get(source["options"].get("runMode"), 360)
    deadline = start + budget
    saved = {"input": source, "finalInput": copy.deepcopy(source),
             "result": {"candidates": [{"placements": payload.get("placements", [])}]}}
    stages = []

    def stage(label, seconds, **overrides):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return {"status": "UNKNOWN"}
        progress({"message": label, "elapsedSeconds": time.monotonic() - start, "budgetSeconds": budget})
        args = dict(input=None, output=None, grade=None, student_class=None, free_subjects=None,
                    basic=False, joint=False, boolean_joint=False, hint=bool(saved["result"]["candidates"][0]["placements"]),
                    seconds=max(.01, min(seconds, remaining)), workers=4, seed=source["options"].get("randomSeed", 7), log=False)
        args.update(overrides)
        result = solve(SimpleNamespace(**args), saved)
        stages.append({"label": label, "status": result["status"], "scope": result["scope"],
                       "grade": args["grade"], "basicOnly": args["basic"], "seconds": result["seconds"]})
        if result["status"] == "MODEL_INVALID":
            raise ValueError("제약 모델 검증에 실패했습니다.")
        return result

    def merge(result):
        by_id = {p["lessonId"]: p for p in saved["result"]["candidates"][0]["placements"]}
        by_id.update({p["lessonId"]: p for p in result["placements"]})
        saved["result"]["candidates"][0]["placements"] = list(by_id.values())
        for lesson in saved["finalInput"]["lessons"]:
            roster = result.get("rosters", {}).get(lesson["offeringId"])
            if roster is not None:
                lesson["studentCodes"] = roster

    def success(result):
        merge(result)
        return {"status": "FEASIBLE", "placements": saved["result"]["candidates"][0]["placements"],
                "rosters": {l["offeringId"]: l["studentCodes"] for l in saved["finalInput"]["lessons"]},
                "stages": stages, "elapsedSeconds": time.monotonic() - start}

    good = {"FEASIBLE", "OPTIMAL"}
    first = stage("현재 분반으로 전 학년 배치 검사", min(12, budget * .1))
    if first["status"] in good:
        return success(first)
    # More elective choices couple more students; repair these grades first.
    grades = sorted(source["grades"], key=lambda g: -sum(l["isElective"] for l in source["lessons"] if l["grade"] == g))
    if saved["result"]["candidates"][0]["placements"]:
        for grade in grades:
            if deadline - time.monotonic() < 15:
                break
            check = stage(f"{grade}학년 분반 고정 가능성 검사", 5, grade=grade, basic=True)
            if check["status"] in good:
                merge(check)
                continue
            neighborhoods = subject_neighborhoods(source, grade)
            for subjects in neighborhoods:
                if deadline - time.monotonic() < 20:
                    break
                joint = stage(f"{grade}학년 {len(subjects)}개 과목 배치·분반 공동 탐색",
                              min(120, max(1, (deadline - time.monotonic()) * .55)),
                              grade=grade, basic=True, joint=True, free_subjects=','.join(subjects))
                if joint["status"] in good:
                    merge(joint)
                    break
            full = stage("전 학년 교사·공강 제약 조정", min(90, max(1, (deadline - time.monotonic()) * .6)))
            if full["status"] in good:
                return success(full)
    # Only an unrestricted all-grade joint model may prove global infeasibility.
    final = stage("전 학년 전체 분반 공동 탐색", max(.01, deadline - time.monotonic()), joint=True)
    if final["status"] in good:
        return success(final)
    return {"status": "INFEASIBLE" if final["status"] == "INFEASIBLE" else "UNKNOWN",
            "stages": stages, "elapsedSeconds": time.monotonic() - start}
