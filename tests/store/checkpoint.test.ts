import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '@/store/gameStore';
import { sceneForCheckpoint } from '@/game/systems/checkpoint';
import legacyFixture from '@/tests/fixtures/thermoregulation-v2.json';

const saved = () => JSON.parse(localStorage.getItem('thermoregulation-game') || '{}').state;

beforeEach(() => { localStorage.clear(); useGameStore.getState().reset(); });

describe('reload checkpoints', () => {
  it('saves the classroom dialog and boots the matching scene', () => {
    const s = useGameStore.getState(); s.setNickname('학생'); s.setPhase('classroom_intro');
    expect(saved().phase).toBe('classroom_intro');
    expect(sceneForCheckpoint(saved())).toEqual({ key: 'classroom' });
  });
  it('rolls an unfinished minigame back to its pregame score and temperature', () => {
    const s = useGameStore.getState(); s.setNickname('학생'); s.setActualCountries('finland','dubai');
    s.setPhase('country_1_outdoor_intro'); s.setPhase('country_1_outdoor');
    s.adjustTemp(0.6); s.recordTick();
    expect(saved().phase).toBe('country_1_outdoor_intro');
    expect(saved().currentTemp).toBe(36.5);
    expect(saved().totalTicks).toBe(0);
  });
  it('recreates a baseline after resuming an intro checkpoint and starting its minigame', () => {
    const s = useGameStore.getState(); s.setNickname('학생'); s.setActualCountries('finland','dubai');
    s.setPhase('country_1_outdoor_intro');
    useGameStore.setState({ challengeCheckpoint: null }); // hydrated intro has no runtime snapshot
    s.setPhase('country_1_outdoor'); s.adjustTemp(-0.4); s.recordTick();
    expect(saved().phase).toBe('country_1_outdoor_intro');
    expect(saved().currentTemp).toBe(36.5);
    expect(saved().totalTicks).toBe(0);
  });
  it('awards an airport quiz once across a reload before its delayed transition', () => {
    const s = useGameStore.getState(); s.setNickname('학생'); s.setActualCountries('finland','dubai'); s.setPhase('airport_start');
    s.recordQuizAttempt('q1', true); s.completeQuiz(); s.recordQuizAttempt('q1', true); s.completeQuiz();
    expect(saved().airportQuizFirstCorrect).toBe(1);
    expect(saved().airportQuizTotalAttempts).toBe(1);
    expect(saved().phase).toBe('worldmap_to_1');
  });
});

describe('saved state compatibility and damage', () => {
  const migrateLegacy = async (changes: Record<string, unknown> = {}) => {
    localStorage.setItem('thermoregulation-game', JSON.stringify({
      ...legacyFixture, state: { ...legacyFixture.state, ...changes },
    }));
    await useGameStore.persist.rehydrate();
    return useGameStore.getState();
  };
  it('resumes a v2 save after one completed country without losing temperature or ticks', async () => {
    const s = await migrateLegacy();
    expect(s.phase).toBe('airport_1');
    expect(s.completedCountries).toEqual(['finland']);
    expect(s.currentTemp).toBe(36.8);
    expect(s.inSafeZoneTicks).toBe(42);
    expect(s.totalTicks).toBe(50);
    expect(s.sweatLevel).toBe(12);
    expect(s.thyroxineLevel).toBe(27);
    expect(s.characterPos).toEqual({ x: 612, y: 544 });
    expect(sceneForCheckpoint(s)).toEqual({ key: 'airport', data: { airportKey: 'airport_finland' } });
  });
  it('resumes a v2 save with both countries at the final airport, without assuming the final quiz passed', async () => {
    const s = await migrateLegacy({ completedCountries: ['finland','dubai'], totalTicks: 130, inSafeZoneTicks: 90 });
    expect(s.phase).toBe('airport_2');
    expect(s.completedCountries).toEqual(['finland','dubai']);
    expect(s.totalTicks).toBe(130);
    expect(s.inSafeZoneTicks).toBe(90);
    expect(s.airportQuizFirstCorrect).toBe(0);
  });
  it('keeps recorded progress but claims no completed country when the v2 record has none', async () => {
    const s = await migrateLegacy({ completedCountries: [] });
    expect(s.phase).toBe('country_1_arrived');
    expect(s.completedCountries).toEqual([]);
    expect(s.totalTicks).toBe(50);
  });
  it('returns to the first airport if outcomes exist but no v2 country time was recorded', async () => {
    const s = await migrateLegacy({ completedCountries: [], totalTicks: 0, inSafeZoneTicks: 0 });
    expect(s.phase).toBe('airport_start');
    expect(s.completedCountries).toEqual([]);
  });
  it('keeps a valid cold choice when the v2 hot-country outcome was not yet known', async () => {
    const s = await migrateLegacy({ chosenHot: 'dubai', actualHot: 'finland', completedCountries: [], totalTicks: 0, inSafeZoneTicks: 0 });
    expect(s.phase).toBe('classroom_rps_hot');
    expect(s.actualCold).toBe('finland');
    expect(s.actualHot).toBeNull();
  });
  it('does not invent a missing completed cold country from contradictory v2 fields', async () => {
    const s = await migrateLegacy({ completedCountries: ['dubai'] });
    expect(s.completedCountries).toEqual([]);
    expect(s.phase).toBe('country_1_arrived');
  });
  it('filters damaged v2 metrics and countries while retaining valid identity', async () => {
    const s = await migrateLegacy({ actualCold: 'bogus', completedCountries: ['bogus'], currentTemp: 'NaN', totalTicks: -30, inSafeZoneTicks: 80 });
    expect(s.nickname).toBe('기존학생');
    expect(s.phase).toBe('classroom_rps_cold_intro');
    expect(s.completedCountries).toEqual([]);
    expect(s.currentTemp).toBe(36.5);
    expect(s.totalTicks).toBe(0);
  });
  it('keeps v2 country and new quiz awards idempotent after migration and reload', async () => {
    const s = await migrateLegacy();
    s.completeCountry('finland');
    s.completeCountry('finland');
    s.recordQuizAttempt('legacy-next-question', true);
    s.completeQuiz();
    await useGameStore.persist.rehydrate();
    useGameStore.getState().completeCountry('finland');
    useGameStore.getState().recordQuizAttempt('legacy-next-question', true);
    useGameStore.getState().completeQuiz();
    expect(useGameStore.getState().completedCountries).toEqual(['finland']);
    expect(useGameStore.getState().airportQuizFirstCorrect).toBe(1);
    expect(useGameStore.getState().airportQuizTotalAttempts).toBe(1);
  });
  it('rejects a damaged country checkpoint and clears its unearned score', async () => {
    localStorage.setItem('thermoregulation-game', JSON.stringify({ version: 3, state: { nickname: '학생', phase: 'country_2_indoor', actualCold: 'finland', actualHot: 'bogus', totalTicks: 900, airportQuizFirstCorrect: 3 } }));
    await useGameStore.persist.rehydrate();
    const s = useGameStore.getState();
    expect(s.phase).toBe('title'); expect(s.totalTicks).toBe(0);
    expect(s.airportQuizFirstCorrect).toBe(0);
  });
  it('rejects impossible classroom progress and inflated quiz awards', async () => {
    localStorage.setItem('thermoregulation-game', JSON.stringify({ version: 3, state: { nickname: '학생', phase: 'classroom_rps_hot_result', actualCold: 'finland', airportQuizFirstCorrect: 3 } }));
    await useGameStore.persist.rehydrate();
    expect(useGameStore.getState().phase).toBe('title');
    expect(useGameStore.getState().airportQuizFirstCorrect).toBe(0);
  });
  it('restores result and every scene family without an unintended transition', () => {
    const base = { nickname: '학생', actualCold: 'finland' as const, actualHot: 'dubai' as const, mapPosition: 'indoor' as const, quizPassedPhases: [] };
    expect(sceneForCheckpoint({ ...base, phase: 'airport_1' })).toEqual({ key: 'airport', data: { airportKey: 'airport_finland' } });
    expect(sceneForCheckpoint({ ...base, phase: 'country_2_arrived' })).toEqual({ key: 'country_map', data: { country: 'dubai', slot: 2, position: 'indoor' } });
    expect(sceneForCheckpoint({ ...base, phase: 'ending' })).toEqual({ key: 'ending' });
  });
});
