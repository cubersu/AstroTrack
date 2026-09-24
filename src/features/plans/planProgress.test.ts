import { describe, expect, it } from 'vitest';
import {
  integrationFromEntry,
  nightsToGoal,
  planAchievedSeconds,
  planGoalHours,
} from './planProgress';
import type { JournalEntry } from '../../db/types';

const e = (over: Partial<JournalEntry>): JournalEntry =>
  ({
    planId: 'p',
    totalIntegrationS: null,
    subExposureS: 60,
    lightCount: 60,
    ...over,
  }) as JournalEntry;

describe('multi-night integration tracking', () => {
  it('sums journal integration linked to a plan', () => {
    const entries = [
      e({ totalIntegrationS: 3600, subExposureS: null, lightCount: null }),
      e({ subExposureS: 120, lightCount: 30 }),
      e({ planId: 'other', totalIntegrationS: 9999 }),
    ];
    expect(planAchievedSeconds({ id: 'p', targetId: 'x' }, entries)).toBe(3600 + 3600);
    expect(
      integrationFromEntry({ totalIntegrationS: null, subExposureS: null, lightCount: 5 }),
    ).toBe(0);
  });
  it('resolves goals', () => {
    expect(planGoalHours({ goalMode: 'custom', goalHours: 10 }, 4)).toBe(10);
    expect(planGoalHours({ goalMode: 'recommended', goalHours: 10 }, 4)).toBe(4);
  });
  it('counts nights to reach the goal', () => {
    expect(nightsToGoal(5, [2, 0, 2, 3])).toBe(4);
    expect(nightsToGoal(0, [1])).toBe(0);
    expect(nightsToGoal(10, [1, 1])).toBeNull();
  });
});
