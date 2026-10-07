'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { GameContainer } from '@/components/GameContainer';
import { UIOverlay } from '@/components/UIOverlay';
import { MuteButton } from '@/components/overlays/MuteButton';
import { TapToStartOverlay } from '@/components/overlays/TapToStartOverlay';
import { StagePreview } from '@/components/StagePreview';

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
      </div>
      <TapToStartOverlay />
    </main>
  );
}
