'use client';

import { useRef } from 'react';
import { toPng } from 'html-to-image';
import { useGameStore } from '@/store/gameStore';
import { PortfolioSubmitter } from '@/components/PortfolioSubmitter';

export function EndingCard() {
  const phase = useGameStore(s => s.phase);
  const reset = useGameStore(s => s.reset);
  const nickname = useGameStore(s => s.nickname);
  const cardRef = useRef<HTMLDivElement>(null);

  if (phase !== 'ending') return null;

  const makePngBlob = async () => {
    if (!cardRef.current) throw new Error('결과 화면이 아직 준비되지 않았습니다.');
    const url = await toPng(cardRef.current, { pixelRatio: 2, cacheBust: true, filter: node => !(node instanceof HTMLElement && node.dataset.noCapture) });
    const blob = await fetch(url).then(r => r.blob());
    URL.revokeObjectURL(url);
    return blob;
  };

  const download = async () => {
    const blob = await makePngBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `체온조절여행_${nickname || '학생'}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div
      ref={cardRef}
      className="absolute inset-0 z-40"
      style={{
        backgroundImage: `url('/assets/backgrounds/ending.png')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* 하단 1줄 대화창 오버레이 */}
      <div className="absolute inset-x-0 bottom-0 pb-6">
        <div className="relative mx-auto w-full max-w-[1200px] px-6">
          <div
            className="relative bg-black/70 backdrop-blur-sm text-white rounded-2xl px-6 py-[14px] shadow-2xl border border-white/20"
            style={{ wordBreak: 'keep-all', overflowWrap: 'break-word' }}
          >
            <p
              className="leading-relaxed text-center text-[31px]"
              style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
            >
              여러분의 체온이 어떻게 조절되는지 배웠습니다. 잊어버리지 않도록 잘 기억합시다.
            </p>

            {/* 우측 상단 '다시 하기' 버튼 */}
            <button
              data-no-capture="1"
              onClick={reset}
              className="absolute right-4 bg-indigo-900 hover:bg-indigo-950 text-white font-bold px-7 py-3 rounded-full shadow-lg border-2 border-white/40 text-[25px] transition-colors"
              style={{ top: -74 }}
            >
              다시 하기
            </button>
          </div>
          <div data-no-capture="1" className="mt-4 rounded-2xl bg-white/95 p-4 text-slate-900 shadow-2xl">
            <PortfolioSubmitter
              playerName={nickname}
              title="체온 조절 여행 결과"
              description={`${nickname || '학생'}의 체온 조절 여행 결과`}
              makePngBlob={makePngBlob}
              summary={nickname ? `${nickname} 결과 화면` : '결과 화면'}
            />
            <div className="mt-3 flex justify-end">
              <button type="button" onClick={download} className="rounded-xl bg-sky-600 px-5 py-2 text-[18px] font-bold text-white">나의 결과 내려받기</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
