export interface StreakSnapshot {
  currentStreak: number;
  lastLogDate: Date | null;
}

const STREAK_MAX_GAP_MS = 24 * 60 * 60 * 1000;

export function calculateStreakFromDates(
  datesDesc: Date[],
  referenceDate: Date
): StreakSnapshot {
  if (datesDesc.length === 0) {
    return { currentStreak: 0, lastLogDate: null };
  }

  const latest = datesDesc[0];
  if (referenceDate.getTime() - latest.getTime() > STREAK_MAX_GAP_MS) {
    return { currentStreak: 0, lastLogDate: latest };
  }

  let currentStreak = 1;
  let previous = latest;

  for (const current of datesDesc.slice(1)) {
    const gap = previous.getTime() - current.getTime();
    if (gap > STREAK_MAX_GAP_MS) break;
    currentStreak += 1;
    previous = current;
  }

  return { currentStreak, lastLogDate: latest };
}
