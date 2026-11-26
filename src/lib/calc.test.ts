import { describe, expect, it } from 'vitest';
import { e1rm, rampUp, sessionsFor, suggestStart, weeklyReview, setsPerMuscle } from './calc';
import { exOf, DEFAULT_ROUTINES } from './programme';
import { SEED } from './seed';

describe('training maths', () => {
  it('Epley e1RM', () => { expect(e1rm(100, 10)).toBeCloseTo(133.33, 1); expect(e1rm(0, 10)).toBe(0); });

  it('stores the 20 kg squat bar separately', () => {
    const sq = SEED.sets.filter(s => s.exercise_id === 'barbell-squat');
    expect(sq).toHaveLength(6);
    expect(sq.every(s => s.bar_kg === 20)).toBe(true);
    expect(sq[0].kg).toBe(0);
  });

  it('Wednesday volume matches Lift Log (2,130 kg, 18 sets)', () => {
    const wed = SEED.sets.filter(s => s.workout_id === 'seed-2026-11-25');
    expect(wed).toHaveLength(18);
    expect(wed.reduce((a, s) => a + (s.kg + s.bar_kg) * s.reps, 0)).toBe(2130);
  });

  it('suggests last session’s final set after a big drop', () => {
    const last = sessionsFor('lat-pulldown', SEED.sets, SEED.workouts).at(-1);
    const s = suggestStart(exOf('lat-pulldown'), { rep_min: 10, rep_max: 12 }, last);
    expect(s.kg).toBe(40);
    expect(s.reason).toMatch(/too heavy/);
  });

  it('adds weight when every set hits the top of the range', () => {
    const last = sessionsFor('db-triceps-ext', SEED.sets, SEED.workouts).at(-1);
    expect(suggestStart(exOf('db-triceps-ext'), { rep_min: 10, rep_max: 12 }, last).kg).toBe(8.5);
  });

  it('ramp-up sets exclude the bar', () => {
    expect(rampUp(exOf('barbell-squat'), 20)).toEqual([{ kg: 0, reps: 8 }, { kg: 10, reps: 4 }]);
    expect(rampUp(exOf('db-bench'), 10)).toEqual([{ kg: 5, reps: 8 }, { kg: 8, reps: 4 }]);
    expect(rampUp(exOf('seated-leg-curl'), 50)).toEqual([]);
  });

  it('weekly review flags abs volume and the pulldown drop', () => {
    const r = weeklyReview(SEED.sets, SEED.workouts, DEFAULT_ROUTINES, '2026-11-23');
    expect(setsPerMuscle(SEED.sets).abs).toBe(3);
    expect(r.signals.some(s => s.kind === 'volume' && s.muscle === 'abs')).toBe(true);
    expect(r.signals.some(s => s.kind === 'drop' && s.exercise?.startsWith('Lat'))).toBe(true);
    expect(r.improved.some(t => t.startsWith('Incline Bench'))).toBe(true);
    expect(r.weakest.length).toBeGreaterThan(0);
  });
});
