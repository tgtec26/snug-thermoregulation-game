'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

const stages = [
  { title: '교실에서 여행 준비', image: '/assets/backgrounds/classroom_start.png', detail: '추운 곳과 더운 곳의 환경을 예상하고 여행지를 고릅니다.' },
  { title: '공항에서 예측', image: '/assets/backgrounds/airport.png', detail: '환경이 바뀔 때 몸의 반응을 먼저 예측합니다.' },
  { title: '추운 야외', image: '/assets/backgrounds/finland_lapland.png', detail: '추운 환경에서 피부 혈관과 떨림의 변화를 관찰합니다.' },
  { title: '따뜻한 실내', image: '/assets/backgrounds/finland_sauna.png', detail: '같은 여행 중 온도가 바뀌면 몸의 반응도 달라짐을 비교합니다.' },
  { title: '더운 야외', image: '/assets/backgrounds/dubai_desert.png', detail: '더운 환경에서 땀과 피부 혈관의 반응을 살핍니다.' },
  { title: '차가운 실내', image: '/assets/backgrounds/dubai_ski.png', detail: '실외와 반대인 실내 온도에서 조절 반응을 다시 추론합니다.' },
  { title: '귀국과 정리', image: '/assets/backgrounds/ending.png', detail: '관찰한 반응을 체온의 항상성으로 연결합니다.' },
];

export function StagePreview() {
  const [index, setIndex] = useState(0);
  const stage = stages[index];
  return <main className="fixed inset-0 grid place-items-center overflow-hidden bg-slate-950 text-white">
    <section className="flex h-[min(100vh,800px)] w-[min(100vw,1280px)] flex-col gap-4 p-7">
      <header className="flex items-center justify-between"><div><p className="text-sm text-cyan-200">합성 단계 미리보기</p><h1 className="text-3xl font-black">체온 조절 여행</h1></div><Link href="/" className="rounded-xl border px-4 py-2">게임으로 돌아가기</Link></header>
      <nav aria-label="단계 미리보기" className="flex flex-wrap gap-2">{stages.map((item, i) => <button key={item.title} type="button" aria-current={i === index ? 'step' : undefined} onClick={() => setIndex(i)} className={`rounded-lg border px-3 py-2 text-sm ${i === index ? 'border-cyan-200 bg-cyan-800' : 'border-slate-500 bg-slate-800'}`}>{i + 1}. {item.title}</button>)}</nav>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-cyan-200/60 bg-slate-900"><Image src={stage.image} alt="" fill unoptimized className="object-contain" /><div className="absolute inset-x-0 bottom-0 bg-slate-950/85 p-5"><h2 className="text-2xl font-bold">{stage.title}</h2><p>{stage.detail}</p><p className="text-sm text-amber-200">장면 설명용 미리보기 · 학생 진행과 점수에 반영되지 않음</p></div></div>
    </section>
  </main>;
}
