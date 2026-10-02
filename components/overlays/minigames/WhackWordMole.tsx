'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useGameStore } from '@/store/gameStore';
import type { MinigameResult } from '../MinigameModal';
import { playSfx } from '@/lib/audio';

/**
 * 사우나(추1 실내) — 아이템 두더지 (풀스크린).
 * 사막 PANG 게임과 동일한 아이템 스프라이트를 사용.
 * 체온을 낮추는 아이템(클릭 +1, 체온↓) / 올리는 아이템(클릭 -1, 체온↑).
 * 구멍 좌표는 /data/sauna-mole-holes.json 에서 동적으로 로드 (어드민 편집).
 */

const ITEMS_DIR = '/assets/sprites/items';
const PLAYER_SRC = '/assets/etc/mole.png';
const BG_SRC = '/assets/backgrounds/mole_game.png';

const GOOD_ITEMS = [
  `${ITEMS_DIR}/cold_water.png`,
  `${ITEMS_DIR}/ice.png`,
  `${ITEMS_DIR}/watermelon.png`,
  `${ITEMS_DIR}/sweat.png`,
  `${ITEMS_DIR}/vessel_dilate.png`,
  `${ITEMS_DIR}/thyroxine_down.png`,
] as const;

const BAD_ITEMS = [
  `${ITEMS_DIR}/fire.png`,
  `${ITEMS_DIR}/sun.png`,
  `${ITEMS_DIR}/pepper.png`,
  `${ITEMS_DIR}/muscle_shiver.png`,
  `${ITEMS_DIR}/vessel_constrict.png`,
  `${ITEMS_DIR}/thyroxine_up.png`,
] as const;

const ALL_ITEMS = [...GOOD_ITEMS, ...BAD_ITEMS];

const GAME_DURATION_SEC = 30;
const SPAWN_INTERVAL_MS = 800;
const POP_DURATION_MS = 2500;     // 솟구침 + 정지 + 매우 느린 하강
const HIT_FALL_MS = 150;          // 클릭(정답/오답) 시 빠른 하강
const POPUP_MS = 1300;            // 점수 팝업 표시 시간
const HOLES = 9;
const SUCCESS_SCORE = 10;

interface HolesData {
  imageSize: { w: number; h: number };
  cellSize: { w: number; h: number };
  holes: { x: number; y: number }[];
}

const DEFAULT_HOLES: HolesData = {
  imageSize: { w: 1344, h: 752 },
  cellSize: { w: 200, h: 180 },
  holes: [
    { x: 269, y: 380 },
    { x: 672, y: 380 },
    { x: 1075, y: 380 },
    { x: 269, y: 540 },
    { x: 672, y: 540 },
    { x: 1075, y: 540 },
    { x: 269, y: 700 },
    { x: 672, y: 700 },
    { x: 1075, y: 700 },
  ],
};

interface Mole {
  id: number;
  hole: number;       // 0~5
  src: string;
  isGood: boolean;
  spawnedAt: number;
  state: 'pending' | 'hit' | 'missed';
}

interface Props {
  onFinish: (result: MinigameResult) => void;
}

export function WhackWordMole({ onFinish }: Props) {
  const adjustTemp = useGameStore(s => s.adjustTemp);

  const [holesData, setHolesData] = useState<HolesData>(DEFAULT_HOLES);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [score, setScore] = useState(0);
  const scoreRef = useRef(0);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION_SEC);
  const timeLeftRef = useRef(GAME_DURATION_SEC);
  const [moles, setMoles] = useState<Mole[]>([]);
  const molesRef = useRef<Mole[]>([]);
  const idCounterRef = useRef(0);
  const finishedRef = useRef(false);

  const popupIdRef = useRef(0);
  const [popups, setPopups] = useState<{ id: number; hole: number; good: boolean }[]>([]);

  // 구멍 좌표 로드
  useEffect(() => {
    fetch(`/data/sauna-mole-holes.json?t=${Date.now()}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: HolesData | null) => { if (d) setHolesData(d); })
      .catch(() => { /* default 사용 */ });
  }, []);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setFinished(true);
    const success = scoreRef.current >= SUCCESS_SCORE;
    setTimeout(() => onFinish({ success, score: scoreRef.current }), 800);
  }, [onFinish]);

  useEffect(() => {
    if (!started || finished) return;
    const tickId = setInterval(() => {
      timeLeftRef.current = Math.max(0, timeLeftRef.current - 1);
      setTimeLeft(timeLeftRef.current);
      if (timeLeftRef.current <= 0) {
        clearInterval(tickId);
        finish();
      }
    }, 1000);
    return () => clearInterval(tickId);
  }, [started, finished, finish]);

  useEffect(() => {
    if (!started || finished) return;
    const spawnId = setInterval(() => {
      // hit 상태(fast-fall 중)도 같은 구멍을 점유 — 새 두더지 스폰 차단
      const occupiedHoles = new Set(molesRef.current.map(m => m.hole));
      const freeHoles: number[] = [];
      for (let i = 0; i < HOLES; i++) if (!occupiedHoles.has(i)) freeHoles.push(i);
      if (freeHoles.length === 0) return;
      const hole = freeHoles[Math.floor(Math.random() * freeHoles.length)];
      const src = ALL_ITEMS[Math.floor(Math.random() * ALL_ITEMS.length)];
      const isGood = (GOOD_ITEMS as readonly string[]).includes(src);
      const m: Mole = {
        id: ++idCounterRef.current,
        hole, src, isGood,
        spawnedAt: performance.now(),
        state: 'pending',
      };
      molesRef.current = [...molesRef.current, m];
      setMoles([...molesRef.current]);
    }, SPAWN_INTERVAL_MS);
    return () => clearInterval(spawnId);
  }, [started, finished]);

  useEffect(() => {
    if (!started || finished) return;
    const expireId = setInterval(() => {
      const now = performance.now();
      let changed = false;
      molesRef.current = molesRef.current.filter(m => {
        // 미클릭 만료: rise-fall 애니메이션 끝나면 자연스럽게 제거
        if (m.state === 'pending' && now - m.spawnedAt > POP_DURATION_MS) {
          changed = true;
          return false;
        }
        return true;
      });
      if (changed) setMoles([...molesRef.current]);
    }, 100);
    return () => clearInterval(expireId);
  }, [started, finished]);

  const whack = (m: Mole) => {
    if (m.state !== 'pending' || finished) return;
    playSfx(m.isGood ? 'whack_good' : 'whack_bad');
    if (m.isGood) {
      scoreRef.current = Math.min(99, scoreRef.current + 2);
      adjustTemp(-0.05);
    } else {
      scoreRef.current = Math.max(-99, scoreRef.current - 1);
      adjustTemp(+0.08);
    }
    setScore(scoreRef.current);
    // 점수 팝업
    const popupId = ++popupIdRef.current;
    setPopups(prev => [...prev, { id: popupId, hole: m.hole, good: m.isGood }]);
    setTimeout(() => {
      setPopups(prev => prev.filter(p => p.id !== popupId));
    }, POPUP_MS);
    // hit 상태로 immutable update — 새 객체로 교체해야 React가 animation 변경 감지
    molesRef.current = molesRef.current.map(x =>
      x.id === m.id ? { ...x, state: 'hit' as const } : x
    );
    setMoles([...molesRef.current]);
    setTimeout(() => {
      molesRef.current = molesRef.current.filter(x => x.id !== m.id);
      setMoles([...molesRef.current]);
    }, HIT_FALL_MS);
  };

  const handleStart = () => {
    if (started) return;
    setStarted(true);
  };

  const { imageSize, cellSize, holes } = holesData;
  const cellWPct = (cellSize.w / imageSize.w) * 100;
  const cellHPct = (cellSize.h / imageSize.h) * 100;

  return (
    <div className="absolute inset-0 z-40 bg-black flex items-center justify-center" style={{ containerType: 'size' }}>
      {/* 게임 영역: 배경 이미지 비율 유지 (letterbox) */}
      <div
        className="relative shadow-2xl"
        style={{
          width: `min(100cqw, calc(100cqh * ${imageSize.w} / ${imageSize.h}))`,
          height: `min(100cqh, calc(100cqw * ${imageSize.h} / ${imageSize.w}))`,
          backgroundImage: `url(${BG_SRC})`,
          backgroundSize: '100% 100%',
          backgroundPosition: 'center',
          imageRendering: 'pixelated',
        }}
      >
        {/* HUD (상단 좌우) */}
        <div className="absolute top-0 left-0 right-0 flex justify-between items-start p-3 pointer-events-none text-white font-mono">
          <div className="bg-black/55 rounded-md px-3 py-1.5">
            <div className="text-[10px] text-amber-200">점수</div>
            <div className="text-2xl font-bold leading-none" style={{ color: score >= SUCCESS_SCORE ? '#fde047' : '#fff' }}>
              {score} / {SUCCESS_SCORE}
            </div>
          </div>
          <div className="bg-black/55 rounded-md px-3 py-1.5 text-right">
            <div className="text-[10px] text-amber-200">남은 시간</div>
            <div className="text-2xl font-bold leading-none text-emerald-300">{timeLeft}s</div>
          </div>
        </div>

        {/* 6개 구멍 */}
        {holes.map((h, hole) => {
          // pending + hit 모두 표시 — hit 상태에서 fast-fall 애니메이션이 끝까지 보여야 하므로
          const m = moles.find(mm => mm.hole === hole);
          const left = (h.x / imageSize.w) * 100;
          const top = (h.y / imageSize.h) * 100;
          return (
            <div
              key={hole}
              className="absolute overflow-hidden"
              style={{
                left: `${left}%`,
                top: `${top}%`,
                width: `${cellWPct}%`,
                height: `${cellHPct}%`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              {m && (
                <button
                  key={m.id}
                  onClick={() => whack(m)}
                  disabled={m.state === 'hit'}
                  className="absolute inset-0 flex flex-col items-center justify-end focus:outline-none bg-transparent border-0 p-0"
                  style={{
                    cursor: m.state === 'hit' ? 'default' : 'pointer',
                    animation: m.state === 'hit'
                      ? `mole-fast-fall ${HIT_FALL_MS}ms ease-in forwards`
                      : `mole-rise-fall ${POP_DURATION_MS}ms linear forwards`,
                  }}
                  aria-label={m.isGood ? '체온을 낮추는 아이템' : '체온을 올리는 아이템'}
                >
                  <img
                    src={m.src}
                    alt=""
                    draggable={false}
                    style={{
                      width: '60%',
                      maxHeight: '55%',
                      objectFit: 'contain',
                      imageRendering: 'pixelated',
                      filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
                    }}
                  />
                  <img
                    src={PLAYER_SRC}
                    alt=""
                    draggable={false}
                    style={{
                      width: '55%',
                      maxHeight: '50%',
                      objectFit: 'contain',
                      imageRendering: 'pixelated',
                      marginTop: -4,
                    }}
                  />
                </button>
              )}
            </div>
          );
        })}

        {/* 점수 팝업 (+2점 / -1점) */}
        {popups.map(p => {
          const h = holes[p.hole];
          if (!h) return null;
          const left = (h.x / imageSize.w) * 100;
          const top = (h.y / imageSize.h) * 100;
          return (
            <div
              key={p.id}
              className="absolute pointer-events-none font-mono font-black"
              style={{
                left: `${left}%`,
                top: `${top}%`,
                transform: 'translate(-50%, -50%)',
                color: p.good ? '#67e8f9' : '#f87171',
                fontSize: 'clamp(20px, 3.5vh, 44px)',
                textShadow: p.good
                  ? '0 0 8px rgba(6,182,212,0.9), 0 2px 4px rgba(0,0,0,0.9)'
                  : '0 0 8px rgba(220,38,38,0.9), 0 2px 4px rgba(0,0,0,0.9)',
                animation: `score-popup ${POPUP_MS}ms ease-out forwards`,
                zIndex: 40,
              }}
            >
              {p.good ? '+2점' : '-1점'}
            </div>
          );
        })}

        {/* 시작 오버레이 */}
        {!started && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-white px-8">
            <h2 className="text-7xl font-bold mb-4">사우나 두더지!</h2>
            <p
              className="text-4xl text-amber-200 mb-8 text-center max-w-4xl"
              style={{ wordBreak: 'keep-all', overflowWrap: 'break-word' }}
            >
              높아지는 체온을 낮추기 위한 아이템만 클릭하세요
            </p>
            <button
              onClick={handleStart}
              className="bg-amber-500 hover:bg-amber-600 text-white font-bold px-10 py-4 rounded-full shadow-xl text-4xl"
            >
              시작
            </button>
          </div>
        )}
        {finished && (
          <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center text-white">
            <h2 className="text-4xl font-bold mb-3">{score >= SUCCESS_SCORE ? '🎉 잘했어요!' : '⏰ 시간 종료'}</h2>
            <p className="text-2xl mb-1">최종 점수 <span className="text-amber-300 font-bold">{score}</span></p>
            <p className="text-sm text-slate-300">다음 단계로 진행…</p>
          </div>
        )}
      </div>

      <style jsx>{`
        /* 미클릭 두더지: 빠르게 솟구침 → 정지 → 매우 느린 하강 (rise:hold:fall ≈ 1 : 4 : 7.5) */
        @keyframes mole-rise-fall {
          0%   { transform: translateY(100%); }
          8%   { transform: translateY(0); }
          40%  { transform: translateY(0); }
          100% { transform: translateY(100%); }
        }
        /* 클릭(정답/오답) 두더지: 매우 빠르게 아래로 사라짐 */
        @keyframes mole-fast-fall {
          0%   { transform: translateY(0); }
          100% { transform: translateY(110%); }
        }
        /* 점수 팝업: 위로 떠오르며 페이드아웃 */
        @keyframes score-popup {
          0%   { opacity: 0;   transform: translate(-50%, -30%) scale(0.6); }
          15%  { opacity: 1;   transform: translate(-50%, -90%) scale(1.15); }
          100% { opacity: 0;   transform: translate(-50%, -200%) scale(1); }
        }
      `}</style>
    </div>
  );
}
