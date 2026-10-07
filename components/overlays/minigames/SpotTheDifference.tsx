'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useGameStore } from '@/store/gameStore';
import { playSfx } from '@/lib/audio';
import type { MinigameResult } from '../MinigameModal';

/**
 * 더운 나라 실내 — 다른 그림 찾기 (풀스크린).
 * variant 별로 배경/정답 데이터 분리:
 *  - ski:      두바이 실내 스키장 (diff_img_ski.png)
 *  - catacomb: 이집트 알렉산드리아 카타콤 (diff_img_catacomb.png, 4곳)
 * 정답 클릭 영역은 /data/spot-difference-targets-{variant}.json 에서 로드 (어드민 편집).
 */

export type SpotDiffVariant = 'ski' | 'catacomb';

const VARIANT_BG: Record<SpotDiffVariant, string> = {
  ski:      '/assets/backgrounds/diff_img_ski.png',
  catacomb: '/assets/backgrounds/diff_img_catacomb.png',
};
const TIME_LIMIT_SEC = 90;

interface Point { x: number; y: number; }
interface Target {
  id: string;
  label: string;
  r: number;
  left: Point;
  right: Point;
}

interface TargetsData {
  imageSize: { w: number; h: number };
  targets: Target[];
}

const DEFAULT_TARGETS: Record<SpotDiffVariant, TargetsData> = {
  ski: {
    imageSize: { w: 1376, h: 768 },
    targets: [
      { id: 't1', label: '차이 1', r: 40, left: { x: 200, y: 200 }, right: { x: 888, y: 200 } },
      { id: 't2', label: '차이 2', r: 40, left: { x: 400, y: 350 }, right: { x: 1088, y: 350 } },
      { id: 't3', label: '차이 3', r: 40, left: { x: 300, y: 500 }, right: { x: 988, y: 500 } },
      { id: 't4', label: '차이 4', r: 40, left: { x: 500, y: 250 }, right: { x: 1188, y: 250 } },
      { id: 't5', label: '차이 5', r: 40, left: { x: 250, y: 450 }, right: { x: 938, y: 450 } },
    ],
  },
  catacomb: {
    imageSize: { w: 1344, h: 752 },
    targets: [
      { id: 't1', label: '차이 1', r: 40, left: { x: 200, y: 200 }, right: { x: 872, y: 200 } },
      { id: 't2', label: '차이 2', r: 40, left: { x: 400, y: 350 }, right: { x: 1072, y: 350 } },
      { id: 't3', label: '차이 3', r: 40, left: { x: 300, y: 500 }, right: { x: 972, y: 500 } },
      { id: 't4', label: '차이 4', r: 40, left: { x: 500, y: 250 }, right: { x: 1172, y: 250 } },
    ],
  },
};

interface Props {
  onFinish: (result: MinigameResult) => void;
  variant?: SpotDiffVariant;
}

export function SpotTheDifference({ onFinish, variant = 'ski' }: Props) {
  const adjustTemp = useGameStore(s => s.adjustTemp);
  const [data, setData] = useState<TargetsData>(DEFAULT_TARGETS[variant]);
  const bgSrc = VARIANT_BG[variant];
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [found, setFound] = useState<Set<string>>(new Set());
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT_SEC);
  const [wrongFlash, setWrongFlash] = useState<{ x: number; y: number; key: number } | null>(null);
  const [wrongCount, setWrongCount] = useState(0);
  const finishedRef = useRef(false);

  useEffect(() => {
    const resetTimer = setTimeout(() => setData(DEFAULT_TARGETS[variant]), 0);
    fetch(`/data/spot-difference-targets-${variant}.json?t=${Date.now()}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: TargetsData | null) => { if (d) setData(d); })
      .catch(() => { /* default 사용 */ });
    return () => clearTimeout(resetTimer);
  }, [variant]);

  const target = data.targets.length;

  const finish = useCallback((success: boolean) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setFinished(true);
    setTimeout(() => onFinish({ success, score: found.size }), 800);
  }, [onFinish, found.size]);

  useEffect(() => {
    if (!started || finished) return;
    const id = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(id);
          finish(found.size >= target);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [started, finished, finish, found.size, target]);

  // 추운 실내 → 체온 자동 하강 (약하게)
  useEffect(() => {
    if (!started || finished) return;
    const id = setInterval(() => adjustTemp(-0.03), 250);
    return () => clearInterval(id);
  }, [started, finished, adjustTemp]);

  useEffect(() => {
    if (target > 0 && found.size >= target && started && !finished) {
      finish(true);
    }
  }, [found, started, finished, finish, target]);

  // wrongFlash fade
  useEffect(() => {
    if (!wrongFlash) return;
    const id = setTimeout(() => setWrongFlash(null), 500);
    return () => clearTimeout(id);
  }, [wrongFlash]);

  const onImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!started || finished) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * data.imageSize.w;
    const clickY = ((e.clientY - rect.top) / rect.height) * data.imageSize.h;

    // 한 차이점은 왼쪽·오른쪽 양쪽에 영역이 있음 — 둘 중 하나만 클릭해도 정답
    let hit: Target | null = null;
    for (const t of data.targets) {
      if (found.has(t.id)) continue;
      const dl = Math.hypot(clickX - t.left.x, clickY - t.left.y);
      const dr = Math.hypot(clickX - t.right.x, clickY - t.right.y);
      if (dl <= t.r || dr <= t.r) { hit = t; break; }
    }

    if (hit) {
      setFound(prev => new Set(prev).add(hit!.id));
      adjustTemp(-0.1);
      playSfx('correct');
    } else {
      playSfx('wrong');
      setWrongCount(c => c + 1);
      setWrongFlash({ x: clickX, y: clickY, key: Date.now() });
    }
  };

  const { imageSize, targets } = data;

  return (
    <div className="absolute inset-0 z-40 bg-black flex items-center justify-center" style={{ containerType: 'size' }}>
      {/* 게임 영역: 배경 이미지 비율 유지 (letterbox) */}
      <div
        className="relative shadow-2xl select-none"
        style={{
          width: `min(100cqw, calc(100cqh * ${imageSize.w} / ${imageSize.h}))`,
          height: `min(100cqh, calc(100cqw * ${imageSize.h} / ${imageSize.w}))`,
          backgroundImage: `url(${bgSrc})`,
          backgroundSize: '100% 100%',
          backgroundPosition: 'center',
          cursor: started && !finished ? 'crosshair' : 'default',
        }}
        onClick={onImageClick}
      >
        {/* HUD */}
        <div className="absolute top-0 left-0 right-0 flex justify-between items-start p-3 pointer-events-none text-white font-mono">
          <div className="bg-black/55 rounded-md px-3 py-1.5">
            <div className="text-[10px] text-cyan-200">찾은 차이</div>
            <div className="text-2xl font-bold leading-none" style={{ color: found.size >= target ? '#fde047' : '#fff' }}>
              {found.size} / {target}
            </div>
          </div>
          <div className="bg-black/55 rounded-md px-3 py-1.5 text-right">
            <div className="text-[10px] text-cyan-200">남은 시간</div>
            <div className="text-2xl font-bold leading-none text-emerald-300">{timeLeft}s</div>
          </div>
        </div>

        {/* 발견한 정답 위치에 초록 원 — 왼쪽·오른쪽 양쪽 표시 */}
        {targets.map(t => {
          if (!found.has(t.id)) return null;
          const w = ((t.r * 2) / imageSize.w) * 100;
          return ([t.left, t.right] as Point[]).map((p, side) => (
            <div
              key={`${t.id}-${side}`}
              className="absolute pointer-events-none rounded-full"
              style={{
                left: `${(p.x / imageSize.w) * 100}%`,
                top: `${(p.y / imageSize.h) * 100}%`,
                width: `${w}%`,
                aspectRatio: '1 / 1',
                transform: 'translate(-50%, -50%)',
                border: '4px solid #ef4444',
                boxShadow: '0 0 12px #ef4444, inset 0 0 12px rgba(239,68,68,0.3)',
              }}
            />
          ));
        })}

        {/* 오답 X 마크 */}
        {wrongFlash && (
          <div
            key={wrongFlash.key}
            className="absolute pointer-events-none font-bold"
            style={{
              left: `${(wrongFlash.x / imageSize.w) * 100}%`,
              top: `${(wrongFlash.y / imageSize.h) * 100}%`,
              transform: 'translate(-50%, -50%)',
              color: '#dc2626',
              fontSize: 'clamp(28px, 5vh, 56px)',
              textShadow: '2px 2px 0 #fff, 0 0 8px #dc2626',
              animation: 'spot-wrong-x 0.5s ease-out forwards',
            }}
          >
            ✗
          </div>
        )}

        {/* 발견 라벨 리스트 (하단) */}
        <div className="absolute left-1/2 -translate-x-1/2 bottom-3 flex flex-wrap gap-2 justify-center max-w-[90%] pointer-events-none">
          {targets.map(t => {
            const f = found.has(t.id);
            return (
              <span
                key={t.id}
                className="px-3 py-1 rounded-full text-sm font-bold border-2"
                style={{
                  background: f ? '#22c55e' : 'rgba(0,0,0,0.55)',
                  color: f ? '#fff' : '#cbd5e1',
                  borderColor: f ? '#86efac' : '#475569',
                }}
              >
                {f ? `✓ ${t.label}` : '???'}
              </span>
            );
          })}
        </div>

        {/* 시작 오버레이 */}
        {!started && (
          <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center text-white px-8">
            <h2 className="text-5xl font-bold mb-4">다른 그림 찾기</h2>
            <p
              className="text-2xl text-cyan-200 mb-8 text-center max-w-3xl"
              style={{ wordBreak: 'keep-all', overflowWrap: 'break-word' }}
            >
              두 그림에서 다른 {target}곳을 찾아 클릭하세요
            </p>
            <button
              onClick={() => setStarted(true)}
              className="bg-cyan-500 hover:bg-cyan-600 text-white font-bold px-10 py-4 rounded-full shadow-xl text-3xl"
            >
              시작
            </button>
          </div>
        )}
        {finished && (
          <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center text-white">
            <h2 className="text-4xl font-bold mb-3">
              {found.size >= target ? '🎉 모두 찾았어요!' : '⏰ 시간 종료'}
            </h2>
            <p className="text-2xl mb-1">
              찾은 차이 <span className="text-cyan-300 font-bold">{found.size}</span> / {target}
            </p>
            {wrongCount > 0 && (
              <p className="text-base text-red-300 mt-1 font-mono">오답 클릭: {wrongCount}</p>
            )}
            <p className="text-sm text-slate-300 mt-2">다음 단계로 진행…</p>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes spot-wrong-x {
          0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
          15%  { opacity: 1; transform: translate(-50%, -50%) scale(1.3); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(1); }
        }
      `}</style>
    </div>
  );
}
