'use client';

import { useEffect, useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { getCountryById } from '@/game/data/countries';
import {
  type TeacherLine,
  type TeacherSize,
  TEACHER_FONT_PX,
  normalizeTeacherData,
} from '@/game/data/teacherLines';

type Phase = ReturnType<typeof useGameStore.getState>['phase'];

const FRIEND_NAME = '김한결';

// phase별 기본 라인 (JSON 로드 실패/누락 시 fallback)
const FALLBACK: Partial<Record<Phase, string[]>> = {
  classroom_intro: [
    '안녕하세요, 여러분! 오늘은 수학여행 떠나기 전 마지막 학급 회의예요.',
    '이번 수학여행에서는 추운 나라 한 곳, 더운 나라 한 곳을 다녀올 거예요.',
    '두 곳에서 우리 몸이 어떻게 체온을 지키는지 직접 확인해 봅시다.',
    '자, 그럼 어디로 갈지 다 같이 골라볼까요?',
  ],
  classroom_rps_cold_intro: [
    '우리반에서 핀란드의 라플란드를 가고 싶은 친구와 캐나다의 옐로나이프를 가고 싶은 친구가 딱 반반이에요.',
    '각 여행지를 선택한 학생의 대표로 {playerName}{와과} 김한결이 서로 가위바위보로 결정해볼게요.',
  ],
  classroom_rps_cold_result: [
    '{winnerName}{이가} 이겼으므로 이번 추운 나라 수학 여행지는 {winnerCountry}입니다.',
  ],
  classroom_rps_hot_result: [
    '{winnerName}{이가} 이겼으므로 이번 더운 나라 수학 여행지는 {winnerCountry}입니다.',
  ],
};

// JSON 키 ↔ phase 매핑 (phase 그대로 키로 쓰기엔 너무 길어서 짧은 키 사용)
// 정적 매핑: phase → JSON key (1:1)
const PHASE_TO_KEY_STATIC: Partial<Record<Phase, string>> = {
  classroom_intro: 'intro',
  classroom_rps_cold_intro: 'rps_cold_intro',
  classroom_rps_cold_result: 'rps_cold_result',
  classroom_rps_hot_result: 'rps_hot_result',
};

// 다음 phase (현재 멘트 끝나면 자동 전환)
const NEXT_PHASE: Partial<Record<Phase, Phase>> = {
  classroom_intro: 'classroom_choose_cold',
  classroom_rps_cold_intro: 'classroom_rps_cold',
  classroom_rps_cold_result: 'classroom_choose_hot',
  classroom_rps_hot_result: 'classroom_depart',
  // 국가 야외/실내 도착 인트로 → 미니게임 단계 (intro 접미사 제거)
  country_1_outdoor_intro: 'country_1_outdoor',
  country_1_indoor_intro:  'country_1_indoor',
  country_2_outdoor_intro: 'country_2_outdoor',
  country_2_indoor_intro:  'country_2_indoor',
};

// 국가 도착 인트로 phase ↔ slot/area 추출
const COUNTRY_INTRO_PHASE_INFO: Partial<Record<Phase, { slot: 1 | 2; area: 'outdoor' | 'indoor' }>> = {
  country_1_outdoor_intro: { slot: 1, area: 'outdoor' },
  country_1_indoor_intro:  { slot: 1, area: 'indoor'  },
  country_2_outdoor_intro: { slot: 2, area: 'outdoor' },
  country_2_indoor_intro:  { slot: 2, area: 'indoor'  },
};

const TYPE_SPEED = 35; // ms/char

// 한글 마지막 글자에 받침이 있는지 → 와/과, 이/가 등 조사 자동 선택
function hasJongsung(name: string): boolean {
  if (!name) return false;
  const last = name.charCodeAt(name.length - 1);
  if (last < 0xAC00 || last > 0xD7A3) return false; // 한글 음절 범위 밖
  return (last - 0xAC00) % 28 !== 0;
}

interface TemplateCtx {
  playerName: string;
  winnerName: string;
  winnerCountry: string;
}

function applyTemplate(line: string, ctx: TemplateCtx): string {
  const player = ctx.playerName || '나';
  const wagwaPlayer = hasJongsung(player) ? '과' : '와';
  const igaWinner = hasJongsung(ctx.winnerName) ? '이' : '가';
  return line
    .replaceAll('{playerName}', player)
    .replaceAll('{와과}', wagwaPlayer)
    .replaceAll('{winnerName}', ctx.winnerName)
    .replaceAll('{winnerCountry}', ctx.winnerCountry)
    .replaceAll('{이가}', igaWinner);
}

export function TeacherIntro() {
  const phase = useGameStore(s => s.phase);
  const playerName = useGameStore(s => s.nickname);
  const chosenCold = useGameStore(s => s.chosenCold);
  const actualCold = useGameStore(s => s.actualCold);
  const chosenHot = useGameStore(s => s.chosenHot);
  const actualHot = useGameStore(s => s.actualHot);
  const setPhase = useGameStore(s => s.setPhase);
  const [allLines, setAllLines] = useState<Record<string, TeacherLine[]>>({});
  const [idx, setIdx] = useState(0);
  const [shown, setShown] = useState(0);

  // 정적 매핑 우선, 그 다음 country_X_<area>_intro → "<country>_<area>" 동적 매핑
  let key: string | undefined = PHASE_TO_KEY_STATIC[phase];
  if (!key) {
    const info = COUNTRY_INTRO_PHASE_INFO[phase];
    if (info) {
      const country = info.slot === 1 ? actualCold : actualHot;
      if (country) key = `${country}_${info.area}`;
    }
  }
  const isActive = !!key;

  // 동적 템플릿 컨텍스트 (phase별로 winnerName/winnerCountry 결정)
  const ctx: TemplateCtx = (() => {
    let winnerName = '';
    let winnerCountry = '';
    if (phase === 'classroom_rps_cold_result' && actualCold) {
      const cfg = getCountryById(actualCold);
      winnerCountry = cfg ? cfg.displayName.replace((cfg.flagEmoji || '') + ' ', '') : '';
      winnerName = actualCold === chosenCold ? (playerName || '나') : FRIEND_NAME;
    } else if (phase === 'classroom_rps_hot_result' && actualHot) {
      const cfg = getCountryById(actualHot);
      winnerCountry = cfg ? cfg.displayName.replace((cfg.flagEmoji || '') + ' ', '') : '';
      winnerName = actualHot === chosenHot ? (playerName || '나') : FRIEND_NAME;
    }
    return { playerName, winnerName, winnerCountry };
  })();

  // 외부 JSON 로드 (캐시 회피)
  useEffect(() => {
    if (!isActive) return;
    fetch(`/data/teacher-intro.json?t=${Date.now()}`)
      .then(r => r.json())
      .then((data: unknown) => setAllLines(normalizeTeacherData(data)))
      .catch(() => { /* fallback */ });
  }, [isActive]);

  // phase 떠나면 진행 상태 리셋
  useEffect(() => {
    if (!isActive) {
      const timer = setTimeout(() => { setIdx(0); setShown(0); }, 0);
      return () => clearTimeout(timer);
    }
  }, [isActive]);

  // 새 phase 진입 시 처음부터 시작
  useEffect(() => {
    const timer = setTimeout(() => { setIdx(0); setShown(0); }, 0);
    return () => clearTimeout(timer);
  }, [key]);

  const rawLines: TeacherLine[] =
    (key && allLines[key]) ||
    (FALLBACK[phase] ?? []).map((s) => ({ text: s }));
  const lines = rawLines.map(l => ({
    text: applyTemplate(l.text, ctx),
    size: (l.size ?? 'md') as TeacherSize,
  }));

  // 타이핑 애니메이션
  useEffect(() => {
    if (!isActive) return;
    const cur = lines[idx]?.text ?? '';
    if (shown >= cur.length) return;
    const t = setTimeout(() => setShown(s => s + 1), TYPE_SPEED);
    return () => clearTimeout(t);
  }, [isActive, idx, shown, lines]);

  if (!isActive) return null;
  if (lines.length === 0) return null;

  const current = lines[idx] ?? { text: '', size: 'md' as TeacherSize };
  const lineText = current.text;
  const fontPx = TEACHER_FONT_PX[current.size];
  const done = shown >= lineText.length;
  const isLast = idx === lines.length - 1;
  const next = NEXT_PHASE[phase];

  const advance = () => {
    if (!done) {
      setShown(lineText.length);
      return;
    }
    if (isLast) {
      if (next) setPhase(next);
    } else {
      setIdx(i => i + 1);
      setShown(0);
    }
  };

  return (
    <div
      onClick={advance}
      className="absolute inset-0 z-40 cursor-pointer bg-black/50 backdrop-blur-[2px] flex items-end justify-center pb-6"
    >
      <div className="relative mx-auto w-full max-w-[922px] px-6">
        {/* 선생님 초상화 */}
        <img
          src="/assets/etc/teacher.png"
          alt="선생님"
          className="absolute left-4 -top-48 h-48 w-auto pointer-events-none drop-shadow-2xl"
          style={{ imageRendering: 'pixelated' }}
        />
        {/* 선생님 이름 (캐릭터 오른쪽 아래) */}
        <div
          className="absolute left-[170px] -top-10 text-amber-300 font-semibold text-[29px] whitespace-nowrap pointer-events-none"
          style={{ textShadow: '0 2px 6px rgba(0,0,0,0.85), 0 0 4px rgba(0,0,0,0.9)' }}
        >
          최종순 선생님
        </div>
        {/* 대화창 */}
        <div
          className="relative bg-black/70 backdrop-blur-sm text-white rounded-2xl px-6 py-5 shadow-2xl border border-white/20"
          style={{ wordBreak: 'keep-all', overflowWrap: 'break-word' }}
        >
          <p
            className="leading-relaxed text-center min-h-[3em] whitespace-pre-wrap transition-[font-size] duration-150"
            style={{ fontSize: `${fontPx}px` }}
          >
            <span>{lineText.slice(0, shown)}</span>
            <span className="opacity-0" aria-hidden="true">{lineText.slice(shown)}</span>
          </p>
          <div className="absolute right-6 bottom-2 text-lg text-white/60 pointer-events-none">
            {done ? (isLast ? '클릭해서 진행 ▶' : '다음 ▶') : '클릭해서 건너뛰기'}
          </div>
        </div>
      </div>
    </div>
  );
}
