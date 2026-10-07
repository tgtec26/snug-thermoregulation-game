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
  if (phase.startsWith('country_1_') || phase === 'country_1_arrived' || phase === 'airport_1' || phase === 'worldmap_to_2') {
    if (!isCold(s.actualCold)) return 'title';
  }
  if (phase.startsWith('country_2_') || phase === 'country_2_arrived' || phase === 'airport_2' || phase === 'worldmap_to_2' || phase === 'worldmap_to_home' || phase === 'korea_bus_to_school' || phase === 'ending') {
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
