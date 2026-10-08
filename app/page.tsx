'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { GameContainer } from '@/components/GameContainer';
import { UIOverlay } from '@/components/UIOverlay';
import { MuteButton } from '@/components/overlays/MuteButton';
import { TapToStartOverlay } from '@/components/overlays/TapToStartOverlay';
import { StagePreview } from '@/components/StagePreview';
import { useGameStore } from '@/store/gameStore';
import { pauseAllScenes, resumeScenes } from '@/game/phaserGame';
import { isMuted, setMuted } from '@/lib/audio';
import { useRef } from 'react';

const STAGE_W = 1280;
const STAGE_H = 800;

/**
 * 무대 시각 크기는 1280×800 비율 유지하며 뷰포트에 letterbox.
 *  - GameContainer 부모는 시각 크기로 직접 사이징 → Phaser FIT 가 자동 처리 (CSS transform 없음).
 *  - UIOverlay 는 1280×800 네이티브 좌표 유지 + transform scale 로 시각 크기에 맞춤.
 * 두 레이어 모두 stage 박스 안에서 동일한 시각 크기 차지 → 정렬됨.
 */
export default function Home() {
  const [preview, setPreview] = useState(false);
  useEffect(() => { const id = setTimeout(() => setPreview(new URLSearchParams(window.location.search).has('preview')), 0); return () => clearTimeout(id); }, []);
  const [size, setSize] = useState({ w: STAGE_W, h: STAGE_H, scale: 1 });
  const paused = useGameStore(s => s.paused);
  const wasMuted = useRef(false);
  const pausedScenes = useRef<string[]>([]);
  const togglePause = () => {
    if (paused) {
      useGameStore.getState().setPaused(false);
      setMuted(wasMuted.current);
      resumeScenes(pausedScenes.current);
      pausedScenes.current = [];
    } else {
      wasMuted.current = isMuted();
      useGameStore.getState().setPaused(true);
      setMuted(true);
      pausedScenes.current = pauseAllScenes();
    }
  };
  const resetAll = () => {
    setMuted(wasMuted.current);
    resumeScenes(pausedScenes.current);
    pausedScenes.current = [];
    useGameStore.getState().reset();
    useGameStore.getState().setPaused(false);
  };

  useLayoutEffect(() => {
    const update = () => {
      const s = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
      setSize({ w: STAGE_W * s, h: STAGE_H * s, scale: s });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  if (preview) return <StagePreview />;
  return (
    <main className="fixed inset-0 overflow-hidden bg-black flex items-center justify-center">
      <div
        className="relative bg-black overflow-hidden"
        style={{ width: size.w, height: size.h }}
      >
        {/* Phaser: stage 시각 크기로 직접 사이징 → FIT 가 자동 맞춤 */}
        <GameContainer />
        {/* UI: 네이티브 1280×800 좌표 유지 + transform 으로 stage 시각 크기에 매칭 */}
        <div
          className="absolute top-0 left-0"
          style={{
            width: STAGE_W,
            height: STAGE_H,
            transform: `scale(${size.scale})`,
            transformOrigin: 'top left',
          }}
        >
          <UIOverlay />
        </div>
        <MuteButton />
        <div className="absolute top-2 right-2 z-40 flex gap-2">
          <button type="button" onClick={togglePause} className="rounded-lg bg-black/75 px-3 py-2 text-white" aria-label={paused ? '계속하기' : '일시정지'}>{paused ? '계속하기' : '일시정지'}</button>
          <button type="button" onClick={resetAll} className="rounded-lg bg-black/75 px-3 py-2 text-white" aria-label="새로 시작">새로 시작</button>
        </div>
        {paused && (
          <div className="absolute inset-0 z-[80] grid place-items-center bg-black/70" role="alertdialog" aria-label="일시정지">
            <div className="rounded-2xl bg-white px-10 py-8 text-center text-black">
              <p className="text-2xl font-bold">일시정지 중</p>
              <button type="button" onClick={togglePause} className="mt-4 rounded-xl bg-amber-500 px-8 py-3 text-xl font-bold text-black">계속하기</button>
            </div>
          </div>
        )}
      </div>
      <TapToStartOverlay />
    </main>
  );
}
