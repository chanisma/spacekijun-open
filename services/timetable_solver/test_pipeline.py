import contextlib
import io
import unittest
from unittest.mock import patch
from .pipeline import run_pipeline, subject_neighborhoods


def fixture():
    lessons = [dict(id=f'l{i}', offeringId=f'o{i}', subjectName='A' if i < 2 else 'B', grade=1,
                    teacherId=f't{i}', studentCodes=[f's{i % 2}'], blockedCells=[], isElective=True,
                    isMajor=True, classKeys=['1-1']) for i in range(4)]
    placements = [dict(lessonId=f'l{i}', dayIndex=0, period=i % 2 + 1) for i in range(4)]
    return {'input': dict(lessons=lessons, grades=[1], grid=dict(days=1, periodsPerDay=2), pinned=placements,
                         options=dict(runMode='quick', hard=dict(teacherConflict=True, studentConflict=True,
                          roomConflict=False, subjectDailyCap=True, teacherDailyCap=False,
                          teacherConsecutive=False, teacherLastPeriodCap=False, teacherSubjectConsecutive=False),
                          maxPerSubjectPerDay=1, maxPerTeacherPerDay=4, maxConsecutivePerTeacher=2, maxLastPeriodPerTeacher=3)),
            'placements': placements}


class PipelineTests(unittest.TestCase):
    def test_resection_resolves_frozen_unsat(self):
        with contextlib.redirect_stdout(io.StringIO()):
            result = run_pipeline(fixture())
        self.assertEqual(result['status'], 'FEASIBLE')
        self.assertEqual(result['stages'][0]['status'], 'INFEASIBLE')
        self.assertEqual(len(result['placements']), 4)
        for student in ['s0', 's1']:
            offerings = [oid for oid, roster in result['rosters'].items() if student in roster]
            self.assertEqual(len(offerings), 2)
            self.assertEqual(len({int(oid[1:]) % 2 for oid in offerings}), 2)

    def test_partial_unsat_is_not_global_proof(self):
        def fake(args, saved):
            return dict(status='UNKNOWN' if args.joint and args.grade is None else 'INFEASIBLE',
                        scope='joint-sections' if args.joint else 'fixed-rosters', seconds=0)
        with patch('timetable_solver.pipeline.solve', side_effect=fake):
            self.assertEqual(run_pipeline(fixture())['status'], 'UNKNOWN')

    def test_only_unrestricted_final_unsat_is_global(self):
        with patch('timetable_solver.pipeline.solve', return_value=dict(status='INFEASIBLE', scope='joint-sections', seconds=0)):
            self.assertEqual(run_pipeline(fixture())['status'], 'INFEASIBLE')

    def test_neighborhoods_expand_without_named_subjects(self):
        source = fixture()['input']
        self.assertEqual(set(subject_neighborhoods(source, 1)[-1]), {'A', 'B'})

    def test_missing_teacher_rejected(self):
        payload = fixture()
        payload['input']['lessons'][0]['teacherId'] = None
        with self.assertRaises(ValueError):
            run_pipeline(payload)


if __name__ == '__main__':
    unittest.main()
