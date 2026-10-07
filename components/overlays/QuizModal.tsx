'use client';

import { useEffect, useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { startAirportQuiz, evaluateAnswer } from '@/game/systems/quizSystem';
import { loadQuizPool } from '@/game/data/quizPool';
import { playSfx } from '@/lib/audio';
import type { QuizQuestion, Phase } from '@/game/types';

const AIRPORT_QUIZ_PHASES = new Set<Phase>(['airport_start', 'airport_1', 'airport_2']);

export function QuizModal() {
  const phase = useGameStore(s => s.phase);
  const setPhase = useGameStore(s => s.setPhase);
  const attemptedIds = useGameStore(s => s.airportQuizAttemptedIds);
  const recordQuizAttempt = useGameStore(s => s.recordQuizAttempt);
  const showToast = useGameStore(s => s.showToast);

  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<QuizQuestion | null>(null);
  const [showExplanation, setShowExplanation] = useState<{ correct: boolean; explanation: string } | null>(null);
  const [firstAttemptForThisAirport, setFirstAttemptForThisAirport] = useState(true);
  const [poolReady, setPoolReady] = useState(false);

  // advance: 다음 phase로 진행. early return 이전에 선언해야 TDZ 회피 (useEffect 클로저 캡처).
  const advance = () => {
    showToast('비행기표를 받았어요! 비행기를 타고 출발해요.');
    if (phase === 'airport_start') setPhase('worldmap_to_1');
    else if (phase === 'airport_1') setPhase('worldmap_to_2');
    else if (phase === 'airport_2') setPhase('worldmap_to_home');
  };

  // admin에서 편집된 quiz-pool.json을 한 번 로드 (fetch 실패 시 빌트인 풀 그대로)
  useEffect(() => {
    loadQuizPool().finally(() => setPoolReady(true));
  }, []);

  // phase가 airport_* 가 되면 modal 자동으로 띄움.
  useEffect(() => {
    if (!poolReady) return;
    const timer = setTimeout(() => {
    if (AIRPORT_QUIZ_PHASES.has(phase) && !open) {
      const q = startAirportQuiz(attemptedIds);
      if (q) {
        setCurrent(q);
        setOpen(true);
        setFirstAttemptForThisAirport(true);
      } else {
        // 풀이 다 떨어졌으면 통과 처리 (drama 보존: 사유 토스트 명시)
        showToast('문제 은행이 다 떨어졌어요. 통과!');
        advance();
      }
    }
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, poolReady]);

  if (!open || !current) return null;

  const choose = (idx: number) => {
    const result = evaluateAnswer(current, idx);
    recordQuizAttempt(current.id, result.correct && firstAttemptForThisAirport);
    setShowExplanation(result);
    playSfx(result.correct ? 'correct' : 'error');
    if (result.correct) {
      // 1.8초 후 모달 닫고 phase 진행
      setTimeout(() => {
        setOpen(false);
        setShowExplanation(null);
        advance();
      }, 1800);
    } else {
      // 1.8초 후 새 문제 (정답까지 반복)
      setTimeout(() => {
        setShowExplanation(null);
        setFirstAttemptForThisAirport(false);
        const nextQ = startAirportQuiz([...attemptedIds, current.id]);
        if (nextQ) {
          setCurrent(nextQ);
        } else {
          // 풀 고갈 → 강제 통과
          showToast('문제 은행이 다 떨어졌어요. 통과!');
          setOpen(false);
          advance();
        }
      }, 1800);
    }
  };

  return (
    <div className="absolute inset-0 flex items-center justify-center z-40 bg-black/50 backdrop-blur-[2px] px-6">
      <div
        className="bg-black/70 backdrop-blur-sm border border-white/20 rounded-3xl shadow-2xl px-8 py-6 w-full max-w-[720px] flex flex-col gap-5"
        style={{ wordBreak: 'keep-all', overflowWrap: 'break-word' }}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-amber-300 font-bold text-[24px] tracking-wide">
            ✈️ 탑승 게이트 퀴즈
          </h2>
          <span className="text-white/60 text-[13px]">정답을 맞춰야 비행기표가 발급돼요</span>
        </div>

        <p className="text-white text-[26px] font-bold leading-relaxed text-center whitespace-pre-wrap">
          {current.question}
        </p>

        <div className="flex flex-col gap-2.5">
          {current.choices.map((c, idx) => {
            const disabled = !!showExplanation;
            const isCorrect = showExplanation && idx === current.answerIndex;
            const cls = disabled
              ? isCorrect
                ? 'border-emerald-400/70 bg-emerald-400/20 text-emerald-100 shadow-[0_0_20px_-4px_rgba(52,211,153,0.5)]'
                : 'border-white/10 bg-white/5 text-white/40'
              : 'border-white/25 bg-white/10 text-white hover:bg-white/20 hover:border-white/50 hover:scale-[1.015] active:scale-[0.98]';
            return (
              <button
                key={idx}
                disabled={disabled}
                onClick={() => choose(idx)}
                className={`rounded-2xl px-5 py-3.5 text-left transition-all text-[20px] font-medium border flex items-center gap-3 ${cls}`}
              >
                <span
                  className={`font-bold text-[22px] shrink-0 w-6 text-center ${
                    disabled
                      ? isCorrect ? 'text-emerald-300' : 'text-white/30'
                      : 'text-amber-300'
                  }`}
                >
                  {idx + 1}
                </span>
                <span className="flex-1">{c}</span>
                {isCorrect && <span className="text-emerald-300 text-[22px]">✓</span>}
              </button>
            );
          })}
        </div>

        {showExplanation && (
          <div
            className={`rounded-2xl px-5 py-3.5 text-[17px] font-medium border leading-relaxed ${
              showExplanation.correct
                ? 'border-emerald-400/50 bg-emerald-400/15 text-emerald-100'
                : 'border-rose-400/50 bg-rose-400/15 text-rose-100'
            }`}
            style={{ wordBreak: 'keep-all', overflowWrap: 'break-word' }}
          >
            {showExplanation.correct
              ? showExplanation.explanation
              : '😅 다시 한 번 풀어볼까요? 다음 문제로 갈게요.'}
          </div>
        )}
      </div>
    </div>
  );
}
