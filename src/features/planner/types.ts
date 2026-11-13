export interface PlannerTask {
  id: string;
  plan_id?: string;
  title: string;
  task_date: string;
  completed: boolean;
  priority: string;
  memo: string | null;
  feedback?: string | null;
  start_time: string | null;
  end_time: string | null;
  related_goal_id: string | null;
}

export type GoalHorizon = 'long' | 'short';

export interface PlannerGoal {
  id: string;
  title: string;
  description: string | null;
  is_completed: boolean;
  is_archived: boolean;
  /** 장기 목표(long) · 단기 목표(short, 기본). 2026-10-03 — 옛 응답에는 없을 수 있다. */
  horizon?: GoalHorizon;
  /** 단기 목표가 묶인 장기 목표. */
  parent_goal_id?: string | null;
  sky_region?: number | null;
  sky_x?: number | null;
  sky_y?: number | null;
  constellation_name?: string | null;
  constellation_lines?: [string, string][];
  constellation_revision?: number;
}

export interface PlannerPlan {
  id: string;
  goal_id: string | null;
  title: string;
  priority: string;
  default_start: string | null;
  default_end: string | null;
  sky_x: number | null;
  sky_y: number | null;
  is_archived: boolean;
  practice_count: number;
  records: { id: string; date: string; feedback: string | null }[];
}

export interface PlannerState {
  tasks: PlannerTask[];
  goals: PlannerGoal[];
  plans?: PlannerPlan[];
}
