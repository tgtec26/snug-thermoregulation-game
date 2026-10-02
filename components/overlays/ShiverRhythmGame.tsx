'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as Tone from 'tone';
import { isMuted } from '@/lib/audio';
import {
  TWINKLE_CHART, TWINKLE_BPM, SONG_DURATION_SEC,
  beatsToSeconds, type ChartNote,
} from '@/game/audio/twinkleChart';

const LANE_COUNT = 4;
const FALL_DURATION_SEC = 1.6;     // 노트가 화면 위에서 hit-zone까지 내려오는 시간
const HIT_WINDOW_SEC = 0.18;       // 판정 허용 오차 (±)
const PERFECT_WINDOW_SEC = 0.08;   // 퍼펙트 판정
const COMBO_FOR_SHIVER = 5;        // 연속 N회 → 떨림 성공

const LANE_COLORS = ['#22d3ee', '#f472b6', '#facc15', '#34d399']; // cyan, pink, yellow, green
const LANE_KEYS = ['1', '2', '3', '4'];

type LiveNote = ChartNote & {
  id: string;
  hitTimeSec: number;   // 노트가 hit-zone에 닿아야 하는 절대 시각 (song time)
  state: 'pending' | 'hit' | 'miss';
};

interface Props {
  onFinish: (result: { hits: number; misses: number; shiverPops: number }) => void;
  onShiverSuccess: () => void;  // 콤보 N회 달성
  onMiss: () => void;           // 매 미스
}

export function ShiverRhythmGame({ onFinish, onShiverSuccess, onMiss }: Props) {
  const [notes, setNotes] = useState<LiveNote[]>([]);
  const [combo, setCombo] = useState(0);
  const [shiverPops, setShiverPops] = useState(0);
  const [feedback, setFeedback] = useState<{ text: string; key: number; lane: number } | null>(null);
  const [comboFeedback, setComboFeedback] = useState<{ text: string; key: number; lane: number } | null>(null);
  const [flash, setFlash] = useState<{ lane: number; perfect: boolean; key: number } | null>(null);
  const [temp, setTemp] = useState(36.5);
  const tempRef = useRef(36.5);
  // 체온 자동 하강 (추운 지역) — 0.1℃/sec. 정상 35.5~37.5, 한계 33~40.
  const updateTemp = useCallback((delta: number) => {
    tempRef.current = Math.max(33, Math.min(40, tempRef.current + delta));
    setTemp(tempRef.current);
  }, []);
  const [songTime, setSongTime] = useState(0);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);

  const startedAtRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const notesRef = useRef<LiveNote[]>([]);
  const comboRef = useRef(0);
  const hitsRef = useRef(0);
  const missesRef = useRef(0);
  const shiverPopsRef = useRef(0);
  const synthRef = useRef<Tone.PolySynth | null>(null);
  const finishedRef = useRef(false);

  // 노트 사전 빌드
  useEffect(() => {
    const built: LiveNote[] = TWINKLE_CHART.map((n, i) => ({
      ...n,
      id: `n${i}`,
      hitTimeSec: beatsToSeconds(n.t),
      state: 'pending',
    }));
    setNotes(built);
    notesRef.current = built;
  }, []);

  // 게임 시작 — Tone.start()는 사용자 제스처가 필요해서 버튼 클릭으로 트리거
  const handleStart = useCallback(async () => {
    if (started) return;
    await Tone.start();

    // 8-bit 느낌의 square 신스
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'square8' },
      envelope: { attack: 0.005, decay: 0.1, sustain: 0.3, release: 0.1 },
      volume: -12,
    }).toDestination();
    synthRef.current = synth;

    // 멜로디 예약 (Tone.Transport 대신 직접 setTimeout 스케줄링 — 단순함)
    // lead-in: 첫 노트가 화면 맨 위에서 hit-zone까지 떨어지는 시간만큼 시작 시각을 미래로 밀어 둠
    const nowSec = performance.now() / 1000;
    const t0 = nowSec + FALL_DURATION_SEC;
    startedAtRef.current = t0;
    TWINKLE_CHART.forEach(n => {
      const delayMs = (beatsToSeconds(n.t) + FALL_DURATION_SEC) * 1000;
      setTimeout(() => {
        if (synthRef.current && !finishedRef.current && !isMuted()) {
          synthRef.current.triggerAttackRelease(n.pitch, beatsToSeconds(n.dur));
        }
      }, delayMs);
    });

    setStarted(true);
  }, [started]);

  // 체온 자동 하강 — 추운 지역이므로 시간 흐를수록 떨어짐
  useEffect(() => {
    if (!started || finished) return;
    const id = setInterval(() => updateTemp(-0.03), 200);  // -0.15℃/sec
    return () => clearInterval(id);
  }, [started, finished, updateTemp]);

  // 게임 루프 (requestAnimationFrame)
  useEffect(() => {
    if (!started || finished) return;

    const tick = () => {
      const now = performance.now() / 1000;
      const t = now - startedAtRef.current;
      setSongTime(t);

      // 놓친 노트 처리
      let missedAny = false;
      for (const note of notesRef.current) {
        if (note.state === 'pending' && t > note.hitTimeSec + HIT_WINDOW_SEC) {
          note.state = 'miss';
          missedAny = true;
          missesRef.current += 1;
          comboRef.current = 0;
          setCombo(0);
          setFeedback({ text: '아우 추워...', key: Date.now() + Math.random(), lane: note.lane });
          onMiss();
        }
      }
      if (missedAny) {
        setNotes([...notesRef.current]);
      }

      // 곡 종료
      if (t > SONG_DURATION_SEC + 0.5) {
        finishedRef.current = true;
        setFinished(true);
        onFinish({
          hits: hitsRef.current,
          misses: missesRef.current,
          shiverPops: shiverPopsRef.current,
        });
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [started, finished, onFinish, onMiss]);

  // 키 입력
  useEffect(() => {
    if (!started || finished) return;

    const handleKey = (e: KeyboardEvent) => {
      const laneIdx = LANE_KEYS.indexOf(e.key);
      if (laneIdx < 0) return;
      e.preventDefault();
      tryHit(laneIdx);
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, finished]);

  const tryHit = (lane: number) => {
    const now = performance.now() / 1000 - startedAtRef.current;
    // 해당 레인의 가장 가까운 pending 노트
    let best: LiveNote | null = null;
    let bestDelta = Infinity;
    for (const n of notesRef.current) {
      if (n.lane !== lane || n.state !== 'pending') continue;
      const delta = Math.abs(n.hitTimeSec - now);
      if (delta < bestDelta && delta <= HIT_WINDOW_SEC) {
        bestDelta = delta;
        best = n;
      }
    }
    if (!best) {
      // 빈 입력 = 미스
      missesRef.current += 1;
      comboRef.current = 0;
      setCombo(0);
      setFeedback({ text: '아우 추워...', key: Date.now(), lane });
      onMiss();
      return;
    }
    best.state = 'hit';
    hitsRef.current += 1;
    comboRef.current += 1;
    setCombo(comboRef.current);
    setNotes([...notesRef.current]);

    const isPerfect = bestDelta <= PERFECT_WINDOW_SEC;
    // 명중 텍스트는 '혈관 수축' ↔ '근육 떨림' 번갈아 표시 (hitsRef 홀짝)
    const hitText = hitsRef.current % 2 === 1 ? '혈관 수축' : '근육 떨림';
    setFeedback({ text: hitText, key: Date.now(), lane });
    setFlash({ lane, perfect: isPerfect, key: Date.now() });
    // 노트 명중 → 체온 회복 (perfect 더 큼)
    updateTemp(isPerfect ? 0.10 : 0.05);

    if (comboRef.current > 0 && comboRef.current % COMBO_FOR_SHIVER === 0) {
      shiverPopsRef.current += 1;
      setShiverPops(shiverPopsRef.current);
      onShiverSuccess();
      // 콤보 이벤트는 별도 피드백으로 출력
      setComboFeedback({ text: `콤보 ${comboRef.current}`, key: Date.now(), lane });
    }
  };

  // 피드백 텍스트 자동 fade
  useEffect(() => {
    if (!feedback) return;
    const id = setTimeout(() => setFeedback(null), 1300);
    return () => clearTimeout(id);
  }, [feedback]);

  // 콤보 피드백 자동 fade
  useEffect(() => {
    if (!comboFeedback) return;
    const id = setTimeout(() => setComboFeedback(null), 1300);
    return () => clearTimeout(id);
  }, [comboFeedback]);

  // 언마운트 정리 — finishedRef는 게임 로직이 관리. cleanup은 신스만 해제.
  // (React 18 StrictMode 가 dev 마운트 시 setup→cleanup→setup 을 시뮬레이트해 ref가 영구 오염되는 것 방지)
  useEffect(() => {
    return () => {
      if (synthRef.current) {
        synthRef.current.releaseAll();
        synthRef.current.dispose();
        synthRef.current = null;
      }
    };
  }, []);

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center"
      style={{
        background: 'radial-gradient(ellipse at center, #0c2a4e 0%, #050a18 100%)',
        imageRendering: 'pixelated' as const,
      }}
    >
      <div
        className="relative"
        style={{
          width: 560,
          height: 640,
          background: '#000',
          border: '6px solid #fbbf24',
          borderRadius: 8,
          boxShadow: '0 0 0 4px #1e293b, 0 8px 32px rgba(0,0,0,0.6), inset 0 0 40px rgba(0,0,0,0.8)',
          padding: 16,
          imageRendering: 'pixelated' as const,
        }}
      >
        {/* 상단 HUD: 콤보 + 떨림 성공 카운터 + 진행률 */}
        <div className="flex justify-between items-center mb-3 text-white font-mono">
          <div className="flex flex-col">
            <span className="text-xs text-slate-300">COMBO</span>
            <span
              className="text-3xl font-bold"
              style={{
                color: combo >= COMBO_FOR_SHIVER ? '#fde047' : '#fff',
                textShadow: combo >= COMBO_FOR_SHIVER ? '0 0 12px #fbbf24' : 'none',
              }}
            >
              {combo}
            </span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-xs text-slate-300">🥶 떨림 성공</span>
            <span className="text-2xl font-bold text-cyan-300">×{shiverPops}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-xs text-slate-300">진행</span>
            <span className="text-xl font-bold text-emerald-300">
              {Math.max(0, Math.min(100, Math.floor((songTime / SONG_DURATION_SEC) * 100)))}%
            </span>
          </div>
        </div>

        {/* 4 lane 영역 + 체온 바 */}
        <div style={{ display: 'flex', gap: 8, width: '100%', height: 480 }}>
        <div
          className="relative"
          style={{
            flex: 1,
            height: '100%',
            background: 'linear-gradient(180deg, rgba(2,6,23,0.9) 0%, rgba(15,23,42,0.95) 100%)',
            border: '3px solid #334155',
            borderRadius: 4,
            overflow: 'hidden',
          }}
        >
          {/* 레인 구분선 */}
          {[1, 2, 3].map(i => (
            <div
              key={i}
              className="absolute top-0 bottom-0"
              style={{
                left: `${(i / LANE_COUNT) * 100}%`,
                width: 2,
                background: 'rgba(100, 116, 139, 0.4)',
              }}
            />
          ))}

          {/* hit-zone */}
          <div
            className="absolute left-0 right-0"
            style={{
              bottom: 8,
              height: 32,
              background: 'linear-gradient(180deg, rgba(251,191,36,0.0) 0%, rgba(251,191,36,0.35) 50%, rgba(251,191,36,0.0) 100%)',
              borderTop: '2px solid #fbbf24',
              borderBottom: '2px solid #fbbf24',
            }}
          />

          {/* 노트 렌더 (게임 시작 전에는 숨김) */}
          {started && notes.map(n => {
            if (n.state !== 'pending') return null;
            const laneArea = 480 - 40;  // hit zone 위까지의 높이
            const timeUntilHit = n.hitTimeSec - songTime;
            // timeUntilHit == FALL_DURATION_SEC → y=0 (top), timeUntilHit == 0 → y=laneArea (hit zone)
            const progress = 1 - (timeUntilHit / FALL_DURATION_SEC);
            if (progress < -0.05 || progress > 1.1) return null;
            const y = progress * laneArea;
            const laneWidth = 100 / LANE_COUNT;
            return (
              <div
                key={n.id}
                style={{
                  position: 'absolute',
                  left: `${n.lane * laneWidth}%`,
                  top: y,
                  width: `${laneWidth}%`,
                  height: 26,
                  padding: '0 4px',
                  pointerEvents: 'none',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    background: LANE_COLORS[n.lane],
                    border: '2px solid #fff',
                    borderRadius: 2,
                    boxShadow: `inset 0 -4px 0 rgba(0,0,0,0.3), inset 0 4px 0 rgba(255,255,255,0.5), 0 0 8px ${LANE_COLORS[n.lane]}`,
                    imageRendering: 'pixelated' as const,
                  }}
                />
              </div>
            );
          })}

          {/* 히트 플래시 — 레인 세로줄 + hit-zone 링 */}
          {flash && (
            <div key={`flash-${flash.key}`} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              {/* 레인 세로 그라데이션 플래시 */}
              <div
                style={{
                  position: 'absolute',
                  left: `${flash.lane * (100 / LANE_COUNT)}%`,
                  top: 0,
                  bottom: 0,
                  width: `${100 / LANE_COUNT}%`,
                  background: `linear-gradient(180deg, ${flash.perfect ? 'rgba(253,224,71,0)' : 'rgba(134,239,172,0)'} 0%, ${flash.perfect ? 'rgba(253,224,71,0.55)' : 'rgba(134,239,172,0.45)'} 100%)`,
                  animation: 'rhythm-hit-flash 0.35s ease-out forwards',
                }}
              />
              {/* hit-zone 위 원형 링 */}
              <div
                style={{
                  position: 'absolute',
                  left: `${(flash.lane + 0.5) * (100 / LANE_COUNT)}%`,
                  bottom: 24,
                  width: 72,
                  height: 72,
                  marginLeft: -36,
                  border: `4px solid ${flash.perfect ? '#fde047' : '#86efac'}`,
                  borderRadius: '50%',
                  boxShadow: `0 0 24px ${flash.perfect ? '#fde047' : '#86efac'}`,
                  animation: 'rhythm-hit-ring 0.45s ease-out forwards',
                }}
              />
            </div>
          )}

          {/* 콤보 이벤트 — 콤보를 일으킨 노트의 레인 부근(피드백 위쪽) */}
          {comboFeedback && (
            <div
              key={`combo-${comboFeedback.key}`}
              style={{
                position: 'absolute',
                left: `${(comboFeedback.lane + 0.5) * (100 / LANE_COUNT)}%`,
                bottom: 130,
                transform: 'translateX(-50%)',
                color: '#fde047',
                fontFamily: 'monospace',
                fontWeight: 900,
                fontSize: 32,
                textShadow: '2px 2px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 0 0 12px #f97316',
                animation: 'rhythm-combo-pop 1.3s ease-out forwards',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              {comboFeedback.text}
            </div>
          )}

          {/* 피드백 텍스트 */}
          {feedback && (
            <div
              key={feedback.key}
              style={{
                position: 'absolute',
                left: `${(feedback.lane + 0.5) * (100 / LANE_COUNT)}%`,
                bottom: 60,
                transform: 'translateX(-50%)',
                color:
                  feedback.text === '근육 떨림' ? '#f472b6' :     // 분홍 — 명중 (혈관 수축과 동일)
                  feedback.text === '혈관 수축' ? '#f472b6' :     // 분홍 — 명중
                  feedback.text === '아우 추워...' ? '#60a5fa' :  // 파랑 — 미스
                  '#fff',
                fontFamily: 'monospace',
                fontWeight: 900,
                fontSize: feedback.text === '아우 추워...' ? 22 : 28,
                textShadow: '2px 2px 0 #000, 0 0 12px currentColor',
                animation: 'rhythm-feedback 1.3s ease-out forwards',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              {feedback.text}
            </div>
          )}
        </div>

        {/* 체온 컬러 바 (오른쪽) */}
        <div
          style={{
            position: 'relative',
            width: 56,
            height: '100%',
            border: '3px solid #334155',
            borderRadius: 4,
            overflow: 'hidden',
            background: 'linear-gradient(180deg, #dc2626 0%, #f97316 18%, #fbbf24 30%, #10b981 38%, #10b981 62%, #06b6d4 70%, #3b82f6 82%, #1e3a8a 100%)',
          }}
        >
          {/* 정상 체온 구간 (35.5~37.5℃) — 점선 박스 */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: `${((40 - 37.5) / 7) * 100}%`,
              height: `${(2 / 7) * 100}%`,
              border: '2px dashed rgba(255,255,255,0.85)',
              borderLeft: 'none',
              borderRight: 'none',
              boxSizing: 'border-box',
              pointerEvents: 'none',
            }}
          />
          {/* 눈금 라벨 */}
          <div style={{ position: 'absolute', top: 2, right: 4, color: '#fff', fontSize: 10, fontFamily: 'monospace', textShadow: '1px 1px 0 #000' }}>40</div>
          <div style={{ position: 'absolute', top: `${((40 - 37.5) / 7) * 100}%`, right: 4, color: '#fff', fontSize: 10, fontFamily: 'monospace', transform: 'translateY(-50%)', textShadow: '1px 1px 0 #000' }}>37.5</div>
          <div style={{ position: 'absolute', top: `${((40 - 35.5) / 7) * 100}%`, right: 4, color: '#fff', fontSize: 10, fontFamily: 'monospace', transform: 'translateY(-50%)', textShadow: '1px 1px 0 #000' }}>35.5</div>
          <div style={{ position: 'absolute', bottom: 2, right: 4, color: '#fff', fontSize: 10, fontFamily: 'monospace', textShadow: '1px 1px 0 #000' }}>33</div>
          {/* 현재 체온 마커 (◀) */}
          <div
            style={{
              position: 'absolute',
              left: -8,
              right: -8,
              bottom: `calc(${((temp - 33) / 7) * 100}% - 3px)`,
              height: 6,
              background: '#fff',
              boxShadow: '0 0 10px #fff, 0 0 4px #000',
              pointerEvents: 'none',
              transition: 'bottom 120ms linear',
            }}
          />
          {/* 현재 온도 텍스트 */}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)',
              bottom: `calc(${((temp - 33) / 7) * 100}% + 6px)`,
              color: '#fff',
              fontSize: 12,
              fontFamily: 'monospace',
              fontWeight: 'bold',
              textShadow: '1px 1px 0 #000, 0 0 4px #000',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              transition: 'bottom 120ms linear',
            }}
          >
            {temp.toFixed(1)}℃
          </div>
        </div>
        </div>

        {/* 키 라벨 + 터치 입력 — 레인 영역에만 맞추기 (오른쪽 체온바 56px + gap 8px 제외) */}
        <div className="flex mt-2" style={{ height: 64, paddingRight: 64 }}>
          {LANE_KEYS.map((k, i) => (
            <button
              key={k}
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                if (started && !finished) tryHit(i);
              }}
              disabled={!started || finished}
              className="flex-1 flex items-center justify-center font-mono font-bold text-white active:scale-95"
              style={{
                margin: '0 2px',
                background: '#1e293b',
                border: `2px solid ${LANE_COLORS[i]}`,
                borderRadius: 6,
                boxShadow: `inset 0 -3px 0 rgba(0,0,0,0.4), 0 0 6px ${LANE_COLORS[i]}`,
                fontSize: 28,
                touchAction: 'manipulation',
                cursor: started && !finished ? 'pointer' : 'default',
              }}
            >
              {k}
            </button>
          ))}
        </div>

        {/* 시작 오버레이 */}
        {!started && (
          <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: 'rgba(0,0,0,0.85)' }}>
            <h2 className="text-3xl font-bold text-white mb-2 font-mono">🥶 떨림 리듬</h2>
            <p className="text-slate-300 text-2xl mb-6" style={{ wordBreak: 'keep-all', overflowWrap: 'break-word' }}>1·2·3·4 키로 박자에 맞춰 노트를 쳐 떨림으로 열을 내요!</p>
            <button
              onClick={handleStart}
              className="px-8 py-3 bg-amber-400 hover:bg-amber-300 text-slate-900 font-bold rounded-md font-mono text-lg"
              style={{ boxShadow: '0 4px 0 #b45309, 0 0 16px rgba(251,191,36,0.6)' }}
            >
              START
            </button>
          </div>
        )}

        {/* 종료 오버레이 */}
        {finished && (
          <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: 'rgba(0,0,0,0.9)' }}>
            <h2 className="text-3xl font-bold text-cyan-300 mb-3 font-mono">🥶 떨림 완료!</h2>
            <p className="text-white text-lg mb-1">떨림 성공 <span className="text-amber-300 font-bold">×{shiverPops}</span></p>
            <p className="text-slate-400 text-sm">
              명중 {hitsRef.current} · 놓침 {missesRef.current}
            </p>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes rhythm-feedback {
          0% { opacity: 0; transform: translateX(-50%) translateY(0) scale(0.8); }
          20% { opacity: 1; transform: translateX(-50%) translateY(-10px) scale(1.1); }
          100% { opacity: 0; transform: translateX(-50%) translateY(-40px) scale(1); }
        }
        @keyframes rhythm-hit-flash {
          0%   { opacity: 0; }
          15%  { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes rhythm-combo-pop {
          0%   { opacity: 0; transform: translateX(-50%) translateY(8px) scale(0.7); }
          15%  { opacity: 1; transform: translateX(-50%) translateY(0) scale(1.2); }
          30%  { transform: translateX(-50%) translateY(-4px) scale(1.05); }
          100% { opacity: 0; transform: translateX(-50%) translateY(-32px) scale(1); }
        }
        @keyframes rhythm-hit-ring {
          0%   { opacity: 0.9; transform: scale(0.6); }
          100% { opacity: 0;   transform: scale(2.4); }
        }
      `}</style>
    </div>
  );
}
