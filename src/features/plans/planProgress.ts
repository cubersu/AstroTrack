/** Multi-night integration bookkeeping (pure; unit-tested). */
import type { JournalEntry, Plan } from '../../db/types';

export function integrationFromEntry(
  e: Pick<JournalEntry, 'totalIntegrationS' | 'subExposureS' | 'lightCount'>,
): number {
  if (e.totalIntegrationS != null && e.totalIntegrationS > 0) return e.totalIntegrationS;
  if (e.subExposureS && e.lightCount) return e.subExposureS * e.lightCount;
  return 0;
}

export function planAchievedSeconds(
  plan: Pick<Plan, 'id' | 'targetId'>,
  entries: JournalEntry[],
): number {
  return entries
    .filter((e) => e.planId === plan.id)
    .reduce((s, e) => s + integrationFromEntry(e), 0);
}

/** Goal in hours: custom value, or the engine's current recommendation. */
export function planGoalHours(
  plan: Pick<Plan, 'goalMode' | 'goalHours'>,
  recommendedH: number | null,
): number | null {
  if (plan.goalMode === 'custom') return plan.goalHours;
  return recommendedH;
}

/**
 * Nights needed to reach the remaining goal given the usable hours of each
 * upcoming night (after weather, where known). Returns null if unreachable
 * within the provided nights.
 */
export function nightsToGoal(remainingH: number, usablePerNightH: number[]): number | null {
  if (remainingH <= 0) return 0;
  let acc = 0;
  for (let i = 0; i < usablePerNightH.length; i++) {
    acc += Math.max(0, usablePerNightH[i]);
    if (acc >= remainingH) return i + 1;
  }
  return null;
}
