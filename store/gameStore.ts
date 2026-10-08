import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  Phase, Country, VesselState, SceneNodes,
} from '@/game/types';
import { TEMP_INITIAL, TEMP_SAFE_MIN, TEMP_SAFE_MAX } from '@/game/config';
import { isPhase, isCold, isHot, isCountry, isMapPosition, isMinigame, minigameIntro, safeCheckpointPhase, migrateLegacyV2, type MapPosition } from '@/game/systems/checkpoint';

export interface GameState {
  // 식별
  nickname: string;

  // 진행 상태
  phase: Phase;
  chosenCold: Country | null;
  chosenHot: Country | null;
  actualCold: Country | null;
  actualHot: Country | null;
  completedCountries: Country[];
  mapPosition: MapPosition;
  challengeCheckpoint: { phase: Phase; currentTemp: number; inSafeZoneTicks: number; totalTicks: number; vesselState: VesselState; sweatLevel: number; thyroxineLevel: number } | null;
  quizWrongPhases: Phase[];
  quizPassedPhases: Phase[];

  // 체온 시스템
  currentTemp: number;
  inSafeZoneTicks: number;
  totalTicks: number;

  // 보조 인디케이터
  vesselState: VesselState;
  sweatLevel: number;        // 0~100
  thyroxineLevel: number;    // 0~100

  // 퀴즈
  airportQuizAttemptedIds: string[];   // 출제된 적 있는 문제 ID (모든 공항 합산)
  airportQuizFirstCorrect: number;     // 첫 시도에 정답 맞춘 수
  airportQuizTotalAttempts: number;    // 공항 퀴즈 총 시도 수 (오답 포함)

  // 위치 (저장/복원)
  characterPos: { x: number; y: number };

  // 토스트 (UI 알림)
  currentToast: string;

  // 노드 오버레이 (Phaser → React 브릿지)
  activeNodes: SceneNodes | null;
  pendingNodeClick: string | null;
  // 현재 강조 표시할 목표 노드 id (CountryMapScene에서 설정 → NodeLabelOverlay에서 pin/blink)
  targetNodeId: string | null;

  // 영구 안내 배너 (토스트와 별개 — 명시적으로 clear 호출 시까지 유지)
  guidance: string;

  // 수업 중 멈춤 (저장하지 않는다)
  paused: boolean;

  // 액션
  setPhase: (p: Phase) => void;
  setMapPosition: (p: MapPosition) => void;
  setNickname: (n: string) => void;
  chooseCold: (c: Country) => void;
  chooseHot: (c: Country) => void;
  setActualCountries: (cold: Country, hot: Country) => void;
  completeCountry: (c: Country) => void;
  adjustTemp: (delta: number) => void;
  setVesselState: (v: VesselState) => void;
  setSweatLevel: (n: number) => void;
  setThyroxineLevel: (n: number) => void;
  recordTick: () => void;
  recordQuizAttempt: (questionId: string, wasFirstAttempt: boolean) => void;
  completeQuiz: () => void;
  setCharacterPos: (x: number, y: number) => void;
  showToast: (message: string) => void;
  setGuidance: (text: string) => void;
  setActiveNodes: (nodes: SceneNodes | null) => void;
  clickNode: (nodeId: string) => void;
  clearNodeClick: () => void;
  setTargetNodeId: (id: string | null) => void;
  setPaused: (p: boolean) => void;
  reset: () => void;
}

const initialState: Omit<GameState,
  | 'setPhase' | 'setMapPosition' | 'setNickname' | 'chooseCold' | 'chooseHot' | 'setActualCountries'
  | 'completeCountry' | 'adjustTemp' | 'setVesselState' | 'setSweatLevel'
  | 'setThyroxineLevel' | 'recordTick' | 'recordQuizAttempt' | 'completeQuiz' | 'setCharacterPos'
  | 'showToast' | 'setGuidance' | 'setActiveNodes' | 'clickNode' | 'clearNodeClick'
  | 'setTargetNodeId' | 'setPaused' | 'reset'
> = {
  nickname: '',
  phase: 'title',
  paused: false,
  chosenCold: null,
  chosenHot: null,
  actualCold: null,
  actualHot: null,
  completedCountries: [],
  mapPosition: 'airport',
  challengeCheckpoint: null,
  quizWrongPhases: [],
  quizPassedPhases: [],
  currentTemp: TEMP_INITIAL,
  inSafeZoneTicks: 0,
  totalTicks: 0,
  vesselState: 'normal',
  sweatLevel: 0,
  thyroxineLevel: 0,
  airportQuizAttemptedIds: [],
  airportQuizFirstCorrect: 0,
  airportQuizTotalAttempts: 0,
  characterPos: { x: 640, y: 700 },
  currentToast: '',
  activeNodes: null,
  pendingNodeClick: null,
  targetNodeId: null,
  guidance: '',
};

export const useGameStore = create<GameState>()(
  persist(
    (set) => ({
      ...initialState,

      setPhase: (phase) => set((s) => {
        const enteringChallenge = (phase.endsWith('_intro') && phase.startsWith('country_') && phase !== s.phase)
          || (isMinigame(phase) && s.phase === minigameIntro(phase) && !s.challengeCheckpoint);
        const checkpoint = enteringChallenge ? {
          phase: minigameIntro(phase), currentTemp: s.currentTemp, inSafeZoneTicks: s.inSafeZoneTicks,
          totalTicks: s.totalTicks, vesselState: s.vesselState,
          sweatLevel: s.sweatLevel, thyroxineLevel: s.thyroxineLevel,
        } : s.challengeCheckpoint;
        const arriving = phase === 'country_1_arrived' || phase === 'country_2_arrived';
        const mapPosition: MapPosition = arriving && s.phase.includes('outdoor') ? 'outdoor'
          : arriving && s.phase.includes('indoor') ? 'indoor'
          : s.mapPosition;
        return { phase, mapPosition, challengeCheckpoint: arriving ? null : checkpoint };
      }),
      setMapPosition: (mapPosition) => set({ mapPosition }),
      setNickname: (nickname) => set({ nickname }),
      chooseCold: (chosenCold) => set({ chosenCold }),
      chooseHot: (chosenHot) => set({ chosenHot }),
      setActualCountries: (actualCold, actualHot) => set({ actualCold, actualHot }),

      completeCountry: (c) => set((s) => ({
        completedCountries: s.completedCountries.includes(c)
          ? s.completedCountries
          : [...s.completedCountries, c],
      })),

      adjustTemp: (delta) => set((s) => ({
        currentTemp: Math.max(33, Math.min(40, s.currentTemp + delta)),
      })),

      setVesselState: (vesselState) => set({ vesselState }),
      setSweatLevel: (sweatLevel) => set({ sweatLevel: Math.max(0, Math.min(100, sweatLevel)) }),
      setThyroxineLevel: (thyroxineLevel) => set({ thyroxineLevel: Math.max(0, Math.min(100, thyroxineLevel)) }),

      recordTick: () => set((s) => {
        const inSafe = s.currentTemp >= TEMP_SAFE_MIN && s.currentTemp <= TEMP_SAFE_MAX;
        return {
          totalTicks: s.totalTicks + 1,
          inSafeZoneTicks: s.inSafeZoneTicks + (inSafe ? 1 : 0),
        };
      }),

      recordQuizAttempt: (questionId, wasFirstAttempt) => set((s) => {
        const phase = s.phase;
        const alreadyAttempted = s.airportQuizAttemptedIds.includes(questionId);
        const isAirport = phase === 'airport_start' || phase === 'airport_1' || phase === 'airport_2';
        if (!isAirport || s.quizPassedPhases.includes(phase)) return {};
        const firstCorrect = wasFirstAttempt && !alreadyAttempted && !s.quizWrongPhases.includes(phase);
        return {
          airportQuizAttemptedIds: alreadyAttempted ? s.airportQuizAttemptedIds : [...s.airportQuizAttemptedIds, questionId],
          airportQuizTotalAttempts: s.airportQuizTotalAttempts + 1,
          airportQuizFirstCorrect: s.airportQuizFirstCorrect + (firstCorrect ? 1 : 0),
          quizWrongPhases: isAirport && !wasFirstAttempt && !s.quizWrongPhases.includes(phase) ? [...s.quizWrongPhases, phase] : s.quizWrongPhases,
        };
      }),

      completeQuiz: () => set((s) => {
        const phase = s.phase;
        if ((phase !== 'airport_start' && phase !== 'airport_1' && phase !== 'airport_2') || s.quizPassedPhases.includes(phase)) return {};
        return { quizPassedPhases: [...s.quizPassedPhases, phase] };
      }),

      setCharacterPos: (x, y) => set({ characterPos: { x, y } }),

      setActiveNodes: (activeNodes) => set({ activeNodes }),
      clickNode: (pendingNodeClick) => set({ pendingNodeClick }),
      clearNodeClick: () => set({ pendingNodeClick: null }),
      setTargetNodeId: (targetNodeId) => set({ targetNodeId }),

      setGuidance: (guidance) => set({ guidance }),

      showToast: (currentToast) => {
        set({ currentToast });
        setTimeout(() => {
          if (typeof window !== 'undefined') {
            const cur = useGameStore.getState().currentToast;
            if (cur === currentToast) set({ currentToast: '' });
          }
        }, 2500);
      },

      reset: () => set(initialState),
      setPaused: (p) => set({ paused: p }),
    }),
    {
      name: 'thermoregulation-game',
      version: 3,
      // Version 2 omitted phase and quiz counters; infer only checkpoints proved by its durable fields.
      migrate: (persisted, version) => version === 2 ? migrateLegacyV2(persisted) : {},
      merge: (persisted, current) => {
        const raw = persisted && typeof persisted === 'object' ? persisted as Record<string, unknown> : {};
        const number = (key: string, fallback: number, min: number, max: number) =>
          typeof raw[key] === 'number' && Number.isFinite(raw[key]) ? Math.min(max, Math.max(min, raw[key])) : fallback;
        const phase = isPhase(raw.phase) ? raw.phase : 'title';
        const challenge = raw.challengeCheckpoint && typeof raw.challengeCheckpoint === 'object'
          ? raw.challengeCheckpoint as Record<string, unknown> : null;
        const validChallenge = challenge && isPhase(challenge.phase) && challenge.phase === minigameIntro(phase)
          && typeof challenge.currentTemp === 'number' && Number.isFinite(challenge.currentTemp)
          && typeof challenge.totalTicks === 'number' && Number.isFinite(challenge.totalTicks)
          && typeof challenge.inSafeZoneTicks === 'number' && Number.isFinite(challenge.inSafeZoneTicks);
        const countryList = Array.isArray(raw.completedCountries) ? raw.completedCountries.filter(isCountry) : [];
        const airportPhases = (value: unknown) => value === 'airport_start' || value === 'airport_1' || value === 'airport_2';
        const passedPhases: Phase[] = Array.isArray(raw.quizPassedPhases) ? [...new Set(raw.quizPassedPhases.filter(airportPhases))] : [];
        const wrongPhases: Phase[] = Array.isArray(raw.quizWrongPhases) ? [...new Set(raw.quizWrongPhases.filter(airportPhases))] : [];
        const state = {
          ...current,
          nickname: typeof raw.nickname === 'string' ? raw.nickname.slice(0, 10) : '',
          phase,
          chosenCold: isCold(raw.chosenCold) ? raw.chosenCold : null,
          chosenHot: isHot(raw.chosenHot) ? raw.chosenHot : null,
          actualCold: isCold(raw.actualCold) ? raw.actualCold : null,
          actualHot: isHot(raw.actualHot) ? raw.actualHot : null,
          completedCountries: [...new Set(countryList)],
          characterPos: raw.characterPos && typeof raw.characterPos === 'object'
            && typeof (raw.characterPos as Record<string, unknown>).x === 'number'
            && typeof (raw.characterPos as Record<string, unknown>).y === 'number'
            && Number.isFinite((raw.characterPos as Record<string, unknown>).x)
            && Number.isFinite((raw.characterPos as Record<string, unknown>).y)
            ? { x: Math.min(1280, Math.max(0, (raw.characterPos as { x: number }).x)),
                y: Math.min(800, Math.max(0, (raw.characterPos as { y: number }).y)) }
            : current.characterPos,
          mapPosition: isMapPosition(raw.mapPosition) ? raw.mapPosition : 'airport' as MapPosition,
          currentTemp: number('currentTemp', TEMP_INITIAL, 33, 40),
          inSafeZoneTicks: number('inSafeZoneTicks', 0, 0, 1_000_000),
          totalTicks: number('totalTicks', 0, 0, 1_000_000),
          vesselState: raw.vesselState === 'constricted' || raw.vesselState === 'dilated' ? raw.vesselState : 'normal' as VesselState,
          sweatLevel: number('sweatLevel', 0, 0, 100),
          thyroxineLevel: number('thyroxineLevel', 0, 0, 100),
          airportQuizAttemptedIds: Array.isArray(raw.airportQuizAttemptedIds) ? raw.airportQuizAttemptedIds.filter((x): x is string => typeof x === 'string').slice(0, 200) : [],
          airportQuizFirstCorrect: number('airportQuizFirstCorrect', 0, 0, 3),
          airportQuizTotalAttempts: number('airportQuizTotalAttempts', 0, 0, 1_000),
          quizWrongPhases: wrongPhases,
          quizPassedPhases: passedPhases,
          challengeCheckpoint: null,
        };
        state.inSafeZoneTicks = Math.min(state.inSafeZoneTicks, state.totalTicks);
        state.airportQuizFirstCorrect = Math.min(state.airportQuizFirstCorrect, passedPhases.length);
        if (isMinigame(phase) && !validChallenge) {
          // A damaged in-progress save cannot safely retain rewards from an unfinished challenge.
          state.phase = 'title';
        } else if (isMinigame(phase) && validChallenge && challenge) {
          state.phase = challenge.phase as Phase;
          state.currentTemp = Math.min(40, Math.max(33, challenge.currentTemp as number));
          state.totalTicks = Math.max(0, challenge.totalTicks as number);
          state.inSafeZoneTicks = Math.min(state.totalTicks, Math.max(0, challenge.inSafeZoneTicks as number));
          state.vesselState = challenge.vesselState === 'constricted' || challenge.vesselState === 'dilated' ? challenge.vesselState : 'normal';
          state.sweatLevel = typeof challenge.sweatLevel === 'number' ? Math.min(100, Math.max(0, challenge.sweatLevel)) : 0;
          state.thyroxineLevel = typeof challenge.thyroxineLevel === 'number' ? Math.min(100, Math.max(0, challenge.thyroxineLevel)) : 0;
        }
        const safePhase = safeCheckpointPhase(state);
        if (safePhase === 'title') {
          return { ...current, nickname: state.nickname };
        }
        state.phase = safePhase;
        return state;
      },
      storage: createJSONStorage(() =>
        typeof window !== 'undefined'
          ? window.localStorage
          : ({ length: 0, clear: () => {}, getItem: () => null, key: () => null,
              removeItem: () => {}, setItem: () => {} } satisfies Storage)
      ),
      partialize: (s) => ({
        nickname: s.nickname, phase: s.quizPassedPhases.includes(s.phase)
          ? (s.phase === 'airport_start' ? 'worldmap_to_1' : s.phase === 'airport_1' ? 'worldmap_to_2' : 'worldmap_to_home')
          : isMinigame(s.phase) && s.challengeCheckpoint ? minigameIntro(s.phase) : s.phase, chosenCold: s.chosenCold, chosenHot: s.chosenHot,
        actualCold: s.actualCold, actualHot: s.actualHot, completedCountries: s.completedCountries,
        mapPosition: s.mapPosition, characterPos: s.characterPos, challengeCheckpoint: s.challengeCheckpoint,
        currentTemp: isMinigame(s.phase) && s.challengeCheckpoint ? s.challengeCheckpoint.currentTemp : s.currentTemp,
        inSafeZoneTicks: isMinigame(s.phase) && s.challengeCheckpoint ? s.challengeCheckpoint.inSafeZoneTicks : s.inSafeZoneTicks,
        totalTicks: isMinigame(s.phase) && s.challengeCheckpoint ? s.challengeCheckpoint.totalTicks : s.totalTicks,
        vesselState: isMinigame(s.phase) && s.challengeCheckpoint ? s.challengeCheckpoint.vesselState : s.vesselState,
        sweatLevel: isMinigame(s.phase) && s.challengeCheckpoint ? s.challengeCheckpoint.sweatLevel : s.sweatLevel,
        thyroxineLevel: isMinigame(s.phase) && s.challengeCheckpoint ? s.challengeCheckpoint.thyroxineLevel : s.thyroxineLevel,
        airportQuizAttemptedIds: s.airportQuizAttemptedIds,
        airportQuizFirstCorrect: s.airportQuizFirstCorrect, airportQuizTotalAttempts: s.airportQuizTotalAttempts,
        quizWrongPhases: s.quizWrongPhases, quizPassedPhases: s.quizPassedPhases,
      }),
    }
  )
);

if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
  (window as unknown as { __gameStore?: typeof useGameStore }).__gameStore = useGameStore;
}
