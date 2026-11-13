"""Independent CP-SAT feasibility check; frozen rosters unless explicitly modeled otherwise.

Install in a separate environment: pip install ortools==9.15.6755
Only a feasible witness proves full feasibility. INFEASIBLE with frozen rosters
does not rule out a different section assignment.
"""
import argparse
import collections
import json
import hashlib
import time
from pathlib import Path
import ortools
from ortools.sat.python import cp_model


def solve(args, saved=None):
    if saved is None:
        saved = json.loads(Path(args.input).read_text(encoding="utf-8-sig"))
    source = saved.get("finalInput", saved.get("input", saved))
    lessons = [l for l in source["lessons"] if not args.grade or l["grade"] == args.grade]
    days, periods = source["grid"]["days"], source["grid"]["periodsPerDay"]
    options, hard = source["options"], source["options"]["hard"]
    if args.boolean_joint and (not args.joint or not hard["subjectDailyCap"] or options["maxPerSubjectPerDay"] != 1):
        raise ValueError("Boolean joint encoding requires joint mode and one lesson per offering per day")
    model = cp_model.CpModel()
    hinted = {p["lessonId"]: p["dayIndex"] * periods + p["period"] - 1
              for p in saved.get("result", {}).get("candidates", [{}])[0].get("placements", [])} if args.hint else {}
    cell_count = days * periods
    at, position = {}, []
    by_student, by_teacher, by_offering, by_room = [collections.defaultdict(list) for _ in range(4)]
    pinned = {p["lessonId"]: p["dayIndex"] * periods + p["period"] - 1 for p in source["pinned"]}
    if args.free_subjects:
        free_subjects = set(args.free_subjects.split(','))
        for l in lessons:
            if l["subjectName"] not in free_subjects:
                if l["id"] not in hinted:
                    raise ValueError("Neighborhood requires a complete saved hint")
                if l["id"] not in pinned:
                    pinned[l["id"]] = hinted[l["id"]]
    for i, l in enumerate(lessons):
        cells = [c for c in range(cell_count) if f"{c // periods}|{c % periods + 1}" not in l["blockedCells"]]
        if l["id"] in pinned:
            cells = [c for c in cells if c == pinned[l["id"]]]
        vs = []
        for c in cells:
            at[i, c] = model.new_bool_var(f"x{i}_{c}")
            vs.append(at[i, c])
        model.add_exactly_one(vs)
        pos = model.new_int_var(0, cell_count - 1, f"p{i}")
        model.add(pos == sum(c * at[i, c] for c in cells))
        position.append(pos)
        for s in l["studentCodes"]:
            by_student[s].append(i)
        if l["teacherId"]:
            by_teacher[l["teacherId"]].append(i)
        if l.get("roomId"):
            by_room[l["roomId"]].append(i)
        by_offering[l["offeringId"]].append(i)

    def terms(ids, cells):
        return [at[i, c] for i in ids for c in cells if (i, c) in at]

    if args.student_class:
        target = set(s for l in lessons if not l["isElective"] and args.student_class in l["classKeys"] for s in l["studentCodes"])
        if not target:
            raise ValueError("No students in requested class")
        by_student = {s: ids for s, ids in by_student.items() if s in target}
    choices = {}
    if args.joint:
        occupancy = {}
        if args.boolean_joint:
            for oid, indices in by_offering.items():
                for c in range(cell_count):
                    values = terms(indices, [c])
                    if values:
                        occupancy[oid,c] = model.new_bool_var(f"offcell_{oid}_{c}")
                        model.add(occupancy[oid,c] == sum(values))
        groups = collections.defaultdict(list)
        for oid, ids in by_offering.items():
            l = lessons[ids[0]]
            if l["isElective"]:
                groups[(l["grade"], l["subjectName"], len(ids))].append(oid)
        memberships = collections.defaultdict(list)
        for student, ids in by_student.items():
            occupied = [position[i] for i in ids if not lessons[i]["isElective"]]
            student_cells = {c: terms([i for i in ids if not lessons[i]["isElective"]], [c]) for c in range(cell_count)}
            wanted = {(lessons[i]["grade"], lessons[i]["subjectName"], len(by_offering[lessons[i]["offeringId"]])) for i in ids if lessons[i]["isElective"]}
            for group in sorted(wanted):
                offerings = groups[group]
                choice = model.new_int_var(0, len(offerings)-1, f"section_{student}_{group}")
                choices[student, group] = (choice, offerings)
                if hinted:
                    current = next((j for j, oid in enumerate(offerings) if student in lessons[by_offering[oid][0]]["studentCodes"]), None)
                    if current is not None:
                        model.add_hint(choice, current)
                for j, oid in enumerate(offerings):
                    selected = model.new_bool_var(f"member_{student}_{oid}")
                    model.add(choice == j).only_enforce_if(selected)
                    model.add(choice != j).only_enforce_if(selected.negated())
                    memberships[oid].append(selected)
                    if args.boolean_joint:
                        for c in range(cell_count):
                            if (oid,c) not in occupancy:
                                continue
                            oc = occupancy[oid,c]
                            present = model.new_bool_var(f"attend_{student}_{oid}_{c}")
                            model.add_bool_and([selected,oc]).only_enforce_if(present)
                            model.add_bool_or([selected.negated(),oc.negated(),present])
                            student_cells[c].append(present)
                if not args.boolean_joint:
                    for k in range(group[2]):
                        cell = model.new_int_var(0, cell_count-1, f"student_{student}_{group}_{k}")
                        model.add_element(choice, [position[by_offering[oid][k]] for oid in offerings], cell)
                        occupied.append(cell)
            if args.boolean_joint:
                for values in student_cells.values():
                    model.add_at_most_one(values)
            else:
                model.add_all_different(occupied)
        for vs in memberships.values():
            model.add(sum(vs) <= 35)
    else:
        for l in lessons:
            if l["isElective"] and len(l["studentCodes"]) > 35:
                model.add(False)
        unique_students = set(tuple(v) for v in by_student.values())
        for ids in unique_students:
            model.add_all_different([position[i] for i in ids])
    if hard["teacherConflict"]:
        for ids in by_teacher.values():
            model.add_all_different([position[i] for i in ids])
    if hard["roomConflict"]:
        for ids in by_room.values():
            model.add_all_different([position[i] for i in ids])
    for ids in by_offering.values():
        # Permuting otherwise identical lesson instances cannot change feasibility.
        symmetric = collections.defaultdict(list)
        for i in ids:
            l = lessons[i]
            if l["id"] not in pinned:
                symmetric[(l["teacherId"], l.get("roomId"), tuple(sorted(l["studentCodes"])), tuple(sorted(l["blockedCells"])) )].append(i)
        for group in symmetric.values():
            for a, b in zip(group, group[1:]):
                model.add(position[a] < position[b])
            if hinted and all(lessons[i]["id"] in hinted for i in group):
                values = sorted(hinted[lessons[i]["id"]] for i in group)
                for i, value in zip(group, values):
                    hinted[lessons[i]["id"]] = value
        if hard["subjectDailyCap"]:
            for d in range(days):
                model.add(sum(terms(ids, range(d * periods, (d + 1) * periods))) <= options["maxPerSubjectPerDay"])
    if not args.basic:
        for ids in by_teacher.values():
            for d in range(days):
                if hard.get("teacherDailyCap"):
                    model.add(sum(terms(ids, range(d * periods, (d + 1) * periods))) <= options["maxPerTeacherPerDay"])
                if hard.get("teacherConsecutive"):
                    cap = options["maxConsecutivePerTeacher"]
                    for p in range(periods - cap):
                        model.add(sum(terms(ids, range(d * periods + p, d * periods + p + cap + 1))) <= cap)
            if hard.get("teacherLastPeriodCap"):
                model.add(sum(terms(ids, [d * periods + periods - 1 for d in range(days)])) <= options["maxLastPeriodPerTeacher"])
        if hard.get("teacherSubjectConsecutive"):
            for ids in by_offering.values():
                teachers = collections.defaultdict(list)
                for i in ids:
                    if lessons[i]["teacherId"]:
                        teachers[lessons[i]["teacherId"]].append(i)
                for group in teachers.values():
                    for d in range(days):
                        for p in range(periods - 1):
                            model.add(sum(terms(group, [d * periods + p, d * periods + p + 1])) <= 1)
    if hinted:
        for i, l in enumerate(lessons):
            if l["id"] in hinted:
                model.add_hint(position[i], hinted[l["id"]])
                for c in range(cell_count):
                    if (i, c) in at:
                        model.add_hint(at[i, c], int(hinted[l["id"]] == c))
    validation = model.validate()
    if validation:
        raise ValueError(validation)
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = args.seconds
    solver.parameters.num_search_workers = args.workers
    solver.parameters.random_seed = args.seed
    solver.parameters.log_search_progress = args.log
    solver.parameters.repair_hint = bool(hinted)
    solver.parameters.hint_conflict_limit = 10000
    scope = "joint-sections" if args.joint else "fixed-rosters"
    print(json.dumps({"lessons": len(lessons), "students": len(by_student), "model": scope, "basicOnly": args.basic}), flush=True)
    start = time.monotonic()
    status = solver.solve(model)
    result = {"status": solver.status_name(status), "scope": scope, "grade": args.grade, "studentClass": args.student_class, "freeSubjects": args.free_subjects, "booleanJoint": args.boolean_joint,
              "basicOnly": args.basic, "seconds": time.monotonic() - start, "stats": solver.response_stats(),
              "ortools": ortools.__version__, "seed": args.seed, "workers": args.workers,
              "inputSha256": hashlib.sha256(json.dumps(saved, sort_keys=True).encode()).hexdigest()}
    if status in (cp_model.FEASIBLE, cp_model.OPTIMAL):
        result["placements"] = [{"lessonId": l["id"], "dayIndex": solver.value(position[i]) // periods,
                                 "period": solver.value(position[i]) % periods + 1} for i, l in enumerate(lessons)]
        if args.joint:
            rosters = {oid: ([] if lessons[ids[0]]["isElective"] else lessons[ids[0]]["studentCodes"]) for oid, ids in by_offering.items()}
            for (student, _), (choice, offerings) in choices.items():
                rosters[offerings[solver.value(choice)]].append(student)
            result["rosters"] = rosters
    if args.output:
        Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in result.items() if k not in ("placements", "rosters", "stats")}), flush=True)
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("output")
    parser.add_argument("--grade", type=int)
    parser.add_argument("--student-class")
    parser.add_argument("--free-subjects")
    parser.add_argument("--basic", action="store_true")
    parser.add_argument("--joint", action="store_true")
    parser.add_argument("--boolean-joint", action="store_true")
    parser.add_argument("--hint", action="store_true")
    parser.add_argument("--seconds", type=float, default=120)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--log", action="store_true")
    solve(parser.parse_args())
