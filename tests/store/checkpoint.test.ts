import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '@/store/gameStore';
import { sceneForCheckpoint } from '@/game/systems/checkpoint';

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
  it('preserves the name but safely restarts a legacy v2 save without a phase', async () => {
    localStorage.setItem('thermoregulation-game', JSON.stringify({ version: 2, state: { nickname: '기존학생', currentTemp: 39, totalTicks: 90, airportQuizFirstCorrect: 3 } }));
    await useGameStore.persist.rehydrate();
    const s = useGameStore.getState();
    expect(s.nickname).toBe('기존학생'); expect(s.phase).toBe('title');
    expect(s.currentTemp).toBe(36.5); expect(s.totalTicks).toBe(0);
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
