'use client';

import { useEffect, useState, useRef } from 'react';
import { useGameStore } from '@/store/gameStore';
import { getCountriesByGroup, getCountryById } from '@/game/data/countries';
import type { Country, RPSChoice, RPSResult } from '@/game/types';

const CHOICES: RPSChoice[] = ['scissors', 'rock', 'paper'];
// 스프라이트시트 1098×455, 3프레임 가로 배열: [scissors, rock, paper]
const SPRITE_INDEX: Record<RPSChoice, number> = {
  scissors: 0,
  rock: 1,
  paper: 2,
};
const LABEL: Record<RPSChoice, string> = {
  scissors: '가위',
  rock: '바위',
  paper: '보',
};

const FRIEND_NAME = '김한결';
const CYCLE_MS = 80; // 빠르게 바뀌는 주기
const TARGET_WINS = 2; // 3판 2선승

function judge(player: RPSChoice, npc: RPSChoice): RPSResult {
  if (player === npc) return 'draw';
  if (
    (player === 'rock' && npc === 'scissors') ||
    (player === 'paper' && npc === 'rock') ||
    (player === 'scissors' && npc === 'paper')
  ) return 'win';
  return 'lose';
}

function randomChoice(): RPSChoice {
  return CHOICES[Math.floor(Math.random() * 3)];
}

// 프레임별 손 그림이 프레임 중앙에서 살짝 어긋나 있어 시각적 정렬 보정 (px, +면 오른쪽 이동)
const FRAME_NUDGE_PX: Record<RPSChoice, number> = {
  scissors: 40,
  rock: 10,
  paper: -20,
};

function RPSSprite({ choice, size = 240 }: { choice: RPSChoice; size?: number }) {
  // 컨테이너 비율 = 프레임 비율 (366:455). size = 가로 px.
  const w = size;
  const h = Math.round((size * 455) / 366);
  return (
    <div
      className="bg-no-repeat"
      style={{
        width: w,
        height: h,
        backgroundImage: 'url(/assets/sprites/rock_paper_scissors.png)',
        backgroundSize: '300% 100%',
        backgroundPosition: `calc(${SPRITE_INDEX[choice] * 50}% + ${FRAME_NUDGE_PX[choice]}px) 0%`,
        imageRendering: 'pixelated',
      }}
      aria-label={LABEL[choice]}
    />
  );
}

// 승점 원 (캐릭터 이름 옆 인라인 표시).
// filled=초록(획득), empty=흐릿한 원형 윤곽.
function WinDot({ filled }: { filled: boolean }) {
  return (
    <span
      className={`inline-block w-5 h-5 rounded-full border-2 ${
        filled
          ? 'bg-emerald-400 border-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.7)]'
          : 'bg-white/5 border-white/40'
      }`}
    />
  );
}

export function RPSModal() {
  const phase = useGameStore(s => s.phase);
  const nickname = useGameStore(s => s.nickname);
  const chosenCold = useGameStore(s => s.chosenCold);
  const chosenHot = useGameStore(s => s.chosenHot);
  const setPhase = useGameStore(s => s.setPhase);
  const setActualCountries = useGameStore(s => s.setActualCountries);

  const [playerChoice, setPlayerChoice] = useState<RPSChoice>('scissors');
  const [npcChoice, setNpcChoice] = useState<RPSChoice>('rock');
  const [decided, setDecided] = useState(false);
  const [result, setResult] = useState<RPSResult | null>(null);
  const [playerWins, setPlayerWins] = useState(0);
  const [npcWins, setNpcWins] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isActive = phase === 'classroom_rps_cold' || phase === 'classroom_rps_hot';
  const group = phase === 'classroom_rps_cold' ? 'cold' : 'hot';
  const chosen = group === 'cold' ? chosenCold : chosenHot;

  // phase 진입 시 cycling 시작 / 떠나면 정리
  useEffect(() => {
    if (!isActive) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      const resetTimer = setTimeout(() => { setDecided(false); setResult(null); setPlayerWins(0); setNpcWins(0); }, 0);
      return () => clearTimeout(resetTimer);
    }
    if (decided) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      return;
    }
    intervalRef.current = setInterval(() => {
      setPlayerChoice(randomChoice());
      setNpcChoice(randomChoice());
    }, CYCLE_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [isActive, decided]);

  if (!isActive) return null;
  if (!chosen) return null;

  const npcCountry: Country = getCountriesByGroup(group).find(c => c.id !== chosen)!.id;
  const npcCountryCfg = getCountryById(npcCountry)!;
  const playerCountryCfg = getCountryById(chosen)!;

  const decide = () => {
    // 현재 표시 중인 두 선택을 그대로 확정 + 승점 가산 (비김은 가산 없음)
    const r = judge(playerChoice, npcChoice);
    setResult(r);
    setDecided(true);
    if (r === 'win') setPlayerWins(w => w + 1);
    else if (r === 'lose') setNpcWins(w => w + 1);
  };

  const nextRound = () => {
    setDecided(false);
    setResult(null);
  };

  const proceed = () => {
    if (!result) return;
    // 비김 → 그 판 다시 (승점 영향 없음)
    if (result === 'draw') { nextRound(); return; }

    // 매치 미종료 → 다음 라운드
    if (playerWins < TARGET_WINS && npcWins < TARGET_WINS) {
      nextRound();
      return;
    }

    // 매치 종료 → 우승국 확정 + phase 진행
    const winnerCountry: Country = playerWins >= TARGET_WINS ? chosen : npcCountry;

    if (group === 'cold') {
      setActualCountries(winnerCountry, useGameStore.getState().actualHot ?? winnerCountry);
      setPhase('classroom_rps_cold_result');
    } else {
      const finalCold = useGameStore.getState().actualCold!;
      setActualCountries(finalCold, winnerCountry);
      setPhase('classroom_rps_hot_result');
    }
    setDecided(false);
    setResult(null);
    setPlayerWins(0);
    setNpcWins(0);
  };

  const groupLabel = group === 'cold' ? '추운 나라' : '더운 나라';
  const playerName = nickname || '플레이어';

  return (
    <div className="absolute inset-0 flex items-center justify-center z-40 bg-black/50 backdrop-blur-[2px] px-6">
      <div
        className="bg-black/70 backdrop-blur-sm border border-white/20 rounded-3xl shadow-2xl px-10 py-8 w-full max-w-[1100px] flex flex-col gap-6"
        style={{ wordBreak: 'keep-all', overflowWrap: 'break-word' }}
      >
        <div className="flex flex-col items-center gap-1">
          <h2 className="text-amber-300 font-bold text-[36px] tracking-wide">
            ✊✋✌️ {groupLabel} 결정
          </h2>
          <p className="text-white/70 text-[18px]">
            {playerCountryCfg.displayName.replace(playerCountryCfg.flagEmoji + ' ', '')}
            {' vs '}
            {npcCountryCfg.displayName.replace(npcCountryCfg.flagEmoji + ' ', '')}
          </p>
        </div>

        <div className="grid grid-cols-[1fr_280px_1fr] items-center gap-6">
          {/* 왼쪽: 플레이어 — 이름 옆에 승점 원 인라인 */}
          <div className="flex flex-col items-center gap-3">
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center gap-2 text-white text-[28px] font-bold">
                <span>{playerName}</span>
                <span className="flex gap-1.5" aria-label={`player wins ${playerWins}`}>
                  {Array.from({ length: TARGET_WINS }).map((_, i) => (
                    <WinDot key={i} filled={playerWins > i} />
                  ))}
                </span>
              </div>
              <img
                src="/assets/etc/player.png"
                alt={playerName}
                className="h-28 w-auto drop-shadow-lg"
                style={{ imageRendering: 'pixelated' }}
              />
            </div>
            <div className="bg-white/10 border border-white/20 rounded-2xl p-4 shadow-inner">
              <RPSSprite choice={playerChoice} size={240} />
            </div>
            <div className="text-white/80 text-[28px] font-bold min-h-[1.5em]">
              {decided ? LABEL[playerChoice] : ' '}
            </div>
          </div>

          {/* 가운데: 3판 2선승 라벨 + VS + 결정/결과 */}
          <div className="flex flex-col items-center gap-4 px-2">
            <div className="text-white/80 text-[28px] font-bold whitespace-nowrap">3판 2선승</div>
            <div className="text-white/40 text-5xl font-bold">VS</div>
            {!decided ? (
              <button
                onClick={decide}
                className="bg-amber-500 hover:bg-amber-400 text-black font-bold text-[28px] rounded-full px-8 py-4 shadow-2xl transition-transform hover:scale-105 active:scale-95"
              >
                결정
              </button>
            ) : (() => {
              // 매치 종료 여부 — decide()의 setState로 이미 갱신된 값 사용
              const matchEnding = playerWins >= TARGET_WINS || npcWins >= TARGET_WINS;
              const playerOverallWin = playerWins >= TARGET_WINS;

              let label: string;
              let color: string;
              if (result === 'draw') {
                label = '😅 비겼어요!';
                color = '#fbbf24';
              } else if (matchEnding) {
                label = playerOverallWin ? '🏆 승리!' : '💔 졌어요';
                color = playerOverallWin ? '#34d399' : '#f87171';
              } else {
                label = result === 'win' ? '🎉 이번 판 승!' : '😢 이번 판 패';
                color = result === 'win' ? '#34d399' : '#f87171';
              }
              const btnLabel = result === 'draw' ? '다시 하기'
                              : matchEnding ? '다음 단계로'
                              : '다음 판으로';

              return (
                <div className="flex flex-col items-center gap-3">
                  <div className="text-[32px] font-extrabold" style={{ color }}>
                    {label}
                  </div>
                  <button
                    onClick={proceed}
                    className="bg-sky-600 hover:bg-sky-500 text-white font-bold text-xl rounded-full px-6 py-3 shadow-lg"
                  >
                    {btnLabel}
                  </button>
                </div>
              );
            })()}
          </div>

          {/* 오른쪽: 친구(김한결) — 원이 이름 왼쪽에 인라인 */}
          <div className="flex flex-col items-center gap-3">
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center gap-2 text-white text-[28px] font-bold">
                <span className="flex gap-1.5" aria-label={`npc wins ${npcWins}`}>
                  {Array.from({ length: TARGET_WINS }).map((_, i) => (
                    <WinDot key={i} filled={npcWins > i} />
                  ))}
                </span>
                <span>{FRIEND_NAME}</span>
              </div>
              <img
                src="/assets/etc/friend.png"
                alt={FRIEND_NAME}
                className="h-28 w-auto drop-shadow-lg"
                style={{ imageRendering: 'pixelated' }}
              />
            </div>
            <div className="bg-white/10 border border-white/20 rounded-2xl p-4 shadow-inner">
              <RPSSprite choice={npcChoice} size={240} />
            </div>
            <div className="text-white/80 text-[28px] font-bold min-h-[1.5em]">
              {decided ? LABEL[npcChoice] : ' '}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
