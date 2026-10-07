import type { Country, Phase } from '@/game/types';

export type MapPosition = 'airport' | 'outdoor' | 'indoor';
export type SceneCheckpoint = { key: string; data?: Record<string, string | number> };

const PHASES = new Set<Phase>([
  'title', 'classroom_intro', 'classroom_choose_cold', 'classroom_rps_cold_intro',
  'classroom_rps_cold', 'classroom_rps_cold_result', 'classroom_choose_hot',
  'classroom_rps_hot', 'classroom_rps_hot_result', 'classroom_depart',
  'korea_bus_to_airport', 'airport_start', 'worldmap_to_1', 'country_1_arrived',
  'country_1_outdoor_intro', 'country_1_outdoor', 'country_1_indoor_intro',
  'country_1_indoor', 'airport_1', 'worldmap_to_2', 'country_2_arrived',
  'country_2_outdoor_intro', 'country_2_outdoor', 'country_2_indoor_intro',
  'country_2_indoor', 'airport_2', 'worldmap_to_home', 'korea_bus_to_school', 'ending',
]);
const COLD = new Set(['finland', 'canada']);
const HOT = new Set(['dubai', 'egypt']);
export const isPhase = (value: unknown): value is Phase => typeof value === 'string' && PHASES.has(value as Phase);
export const isCold = (value: unknown): value is Country => typeof value === 'string' && COLD.has(value);
export const isHot = (value: unknown): value is Country => typeof value === 'string' && HOT.has(value);
export const isCountry = (value: unknown): value is Country => isCold(value) || isHot(value);
export const isMapPosition = (value: unknown): value is MapPosition => value === 'airport' || value === 'outdoor' || value === 'indoor';
export const minigameIntro = (phase: Phase): Phase => {
  switch (phase) {
    case 'country_1_outdoor': return 'country_1_outdoor_intro';
    case 'country_1_indoor': return 'country_1_indoor_intro';
    case 'country_2_outdoor': return 'country_2_outdoor_intro';
    case 'country_2_indoor': return 'country_2_indoor_intro';
    default: return phase;
  }
};
export const isMinigame = (phase: Phase) => minigameIntro(phase) !== phase;
export const worldmapAfterQuiz = (phase: Phase): Phase | null =>
  phase === 'airport_start' ? 'worldmap_to_1' : phase === 'airport_1' ? 'worldmap_to_2' : phase === 'airport_2' ? 'worldmap_to_home' : null;

export interface CheckpointFields {
  phase: Phase;
  nickname: string;
  chosenCold?: Country | null;
  chosenHot?: Country | null;
  actualCold: Country | null;
  actualHot: Country | null;
  mapPosition: MapPosition;
  quizPassedPhases: Phase[];
}

/** Invalid or incomplete saves start safely at the title, without fabricating countries or scores. */
export function safeCheckpointPhase(s: CheckpointFields): Phase {
  if (!s.nickname.trim()) return 'title';
  let phase = s.phase;
  if (s.quizPassedPhases.includes(phase)) phase = worldmapAfterQuiz(phase) ?? phase;
  phase = minigameIntro(phase);
  if ((phase === 'classroom_rps_cold_intro' || phase === 'classroom_rps_cold') && !isCold(s.chosenCold)) return 'title';
  if ((phase === 'classroom_rps_cold_result' || phase === 'classroom_choose_hot') && !isCold(s.actualCold)) return 'title';
  if (phase === 'classroom_rps_hot' && (!isCold(s.actualCold) || !isHot(s.chosenHot))) return 'title';
  if ((phase === 'classroom_rps_hot_result' || phase === 'classroom_depart' || phase === 'korea_bus_to_airport' || phase === 'airport_start')
      && (!isCold(s.actualCold) || !isHot(s.actualHot))) return 'title';
  if (phase.startsWith('country_1_') || phase === 'country_1_arrived' || phase === 'worldmap_to_2') {
    if (!isCold(s.actualCold)) return 'title';
  }
  if (phase.startsWith('country_2_') || phase === 'country_2_arrived' || phase === 'airport_1' || phase === 'airport_2' || phase === 'worldmap_to_2' || phase === 'worldmap_to_home' || phase === 'korea_bus_to_school' || phase === 'ending') {
    if (!isCold(s.actualCold) || !isHot(s.actualHot)) return 'title';
  }
  if (phase === 'worldmap_to_1' && (!isCold(s.actualCold) || !isHot(s.actualHot))) return 'title';
  return phase;
}

/** Called only after persisted state has hydrated, before starting a Phaser scene. */
export function sceneForCheckpoint(s: CheckpointFields): SceneCheckpoint {
  const phase = safeCheckpointPhase(s);
  if (phase === 'title') return { key: 'title' };
  if (phase.startsWith('classroom_')) return { key: 'classroom' };
  if (phase === 'korea_bus_to_airport') return { key: 'korea_bus', data: { direction: 'to_airport' } };
  if (phase === 'korea_bus_to_school') return { key: 'korea_bus', data: { direction: 'to_school' } };
  if (phase === 'airport_start') return { key: 'airport', data: { airportKey: 'airport_start' } };
  if (phase === 'airport_1') return { key: 'airport', data: { airportKey: `airport_${s.actualCold}` } };
  if (phase === 'airport_2') return { key: 'airport', data: { airportKey: `airport_${s.actualHot}` } };
  if (phase.startsWith('worldmap_')) return { key: 'worldmap' };
  if (phase === 'country_1_arrived' || phase === 'country_2_arrived') {
    const slot = phase === 'country_1_arrived' ? 1 : 2;
    return { key: 'country_map', data: { country: slot === 1 ? s.actualCold! : s.actualHot!, slot, position: s.mapPosition } };
  }
  if (phase.startsWith('country_1_') || phase.startsWith('country_2_')) {
    const slot = phase.startsWith('country_1_') ? 1 : 2;
    return { key: 'country', data: { country: slot === 1 ? s.actualCold! : s.actualHot!, slot, area: phase.includes('indoor') ? 'indoor' : 'outdoor' } };
  }
  return { key: 'ending' };
}

/** Version 2 stored durable measurements and country outcomes, but never stored a phase or quiz score. */
export function migrateLegacyV2(persisted: unknown): Record<string, unknown> {
  const raw = persisted && typeof persisted === 'object' ? persisted as Record<string, unknown> : {};
  const nickname = typeof raw.nickname === 'string' ? raw.nickname.slice(0, 10) : '';
  const chosenCold = isCold(raw.chosenCold) ? raw.chosenCold : null;
  const chosenHot = isHot(raw.chosenHot) ? raw.chosenHot : null;
  const actualCold = isCold(raw.actualCold) ? raw.actualCold : null;
  // The old cold RPS briefly put the cold winner in actualHot as a placeholder.
  const actualHot = isHot(raw.actualHot) ? raw.actualHot : null;
  const claims = Array.isArray(raw.completedCountries) ? raw.completedCountries : [];
  const completedCold = actualCold !== null && claims.includes(actualCold);
  const completedHot = completedCold && actualHot !== null && claims.includes(actualHot);
  const completedCountries: Country[] = [
    ...(completedCold ? [actualCold] : []),
    ...(completedHot ? [actualHot] : []),
  ] as Country[];
  const totalTicks = typeof raw.totalTicks === 'number' && Number.isFinite(raw.totalTicks)
    ? Math.max(0, Math.floor(raw.totalTicks)) : 0;
  let phase: Phase = 'title';
  if (nickname.trim()) {
    if (completedHot) phase = 'airport_2';
    else if (completedCold && actualHot) phase = 'airport_1';
    else if (actualCold && actualHot) phase = totalTicks > 0 ? 'country_1_arrived' : 'airport_start';
    else if (actualCold && chosenHot) phase = 'classroom_rps_hot';
    else if (actualCold) phase = 'classroom_choose_hot';
    else if (chosenCold) phase = 'classroom_rps_cold_intro';
    else phase = 'classroom_intro';
  }
  return {
    nickname, phase, chosenCold, chosenHot, actualCold, actualHot,
    completedCountries, mapPosition: 'airport',
    currentTemp: raw.currentTemp, inSafeZoneTicks: raw.inSafeZoneTicks, totalTicks,
    vesselState: raw.vesselState, sweatLevel: raw.sweatLevel,
    thyroxineLevel: raw.thyroxineLevel, characterPos: raw.characterPos,
    // No v2 quiz counters survived serialization; do not invent an award.
    airportQuizAttemptedIds: [], airportQuizFirstCorrect: 0, airportQuizTotalAttempts: 0,
    quizWrongPhases: [], quizPassedPhases: [],
  };
}
