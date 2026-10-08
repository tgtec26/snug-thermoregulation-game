import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '@/store/gameStore';
import { TEMP_INITIAL } from '@/game/config';

describe('gameStore', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  it('초기 상태가 올바르다', () => {
    const s = useGameStore.getState();
    expect(s.phase).toBe('title');
    expect(s.nickname).toBe('');
    expect(s.currentTemp).toBe(TEMP_INITIAL);
    expect(s.inSafeZoneTicks).toBe(0);
    expect(s.totalTicks).toBe(0);
    expect(s.chosenCold).toBeNull();
    expect(s.chosenHot).toBeNull();
    expect(s.actualCold).toBeNull();
    expect(s.actualHot).toBeNull();
    expect(s.completedCountries).toEqual([]);
    expect(s.airportQuizFirstCorrect).toBe(0);
    expect(s.airportQuizAttemptedIds).toEqual([]);
  });

  it('setPhase로 phase 전환', () => {
    useGameStore.getState().setPhase('classroom_intro');
    expect(useGameStore.getState().phase).toBe('classroom_intro');
  });

  it('setNickname 저장', () => {
    useGameStore.getState().setNickname('태형');
    expect(useGameStore.getState().nickname).toBe('태형');
  });

  it('adjustTemp는 누적', () => {
    useGameStore.getState().adjustTemp(0.3);
    expect(useGameStore.getState().currentTemp).toBeCloseTo(TEMP_INITIAL + 0.3, 5);
    useGameStore.getState().adjustTemp(-0.5);
    expect(useGameStore.getState().currentTemp).toBeCloseTo(TEMP_INITIAL - 0.2, 5);
  });

  it('chooseCold / chooseHot 저장', () => {
    useGameStore.getState().chooseCold('finland');
    expect(useGameStore.getState().chosenCold).toBe('finland');
    useGameStore.getState().chooseHot('egypt');
    expect(useGameStore.getState().chosenHot).toBe('egypt');
  });

  it('setActualCountries 저장', () => {
    useGameStore.getState().setActualCountries('canada', 'dubai');
    expect(useGameStore.getState().actualCold).toBe('canada');
    expect(useGameStore.getState().actualHot).toBe('dubai');
  });

  it('completeCountry는 중복 없이 누적', () => {
    useGameStore.getState().completeCountry('finland');
    useGameStore.getState().completeCountry('finland');
    useGameStore.getState().completeCountry('egypt');
    expect(useGameStore.getState().completedCountries).toEqual(['finland', 'egypt']);
  });

  it('recordTick은 적정 범위에서만 inSafeZone 증가', () => {
    const s = useGameStore.getState();
    s.recordTick(); // currentTemp = 36.5 (적정)
    expect(useGameStore.getState().inSafeZoneTicks).toBe(1);
    expect(useGameStore.getState().totalTicks).toBe(1);

    useGameStore.getState().adjustTemp(2); // 38.5 → 고체온
    useGameStore.getState().recordTick();
    expect(useGameStore.getState().inSafeZoneTicks).toBe(1); // 증가 안 함
    expect(useGameStore.getState().totalTicks).toBe(2);
  });

  it('recordQuizAttempt — 첫 시도 정답 시 firstCorrect 증가', () => {
    const s = useGameStore.getState();
    s.setPhase('airport_start');
    s.recordQuizAttempt('c1', true);
    expect(useGameStore.getState().airportQuizFirstCorrect).toBe(1);
    expect(useGameStore.getState().airportQuizAttemptedIds).toContain('c1');
  });

  it('recordQuizAttempt — 첫 시도 오답이면 firstCorrect 변화 없음', () => {
    const s = useGameStore.getState();
    s.setPhase('airport_start');
    s.recordQuizAttempt('c1', false);
    expect(useGameStore.getState().airportQuizFirstCorrect).toBe(0);
    expect(useGameStore.getState().airportQuizAttemptedIds).toContain('c1');
  });
  it('일시정지는 켜고 끌 수 있다', () => {
    expect(useGameStore.getState().paused).toBe(false);
    useGameStore.getState().setPaused(true);
    expect(useGameStore.getState().paused).toBe(true);
    useGameStore.getState().setPaused(false);
    expect(useGameStore.getState().paused).toBe(false);
  });
});
