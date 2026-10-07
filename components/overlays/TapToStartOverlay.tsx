'use client';

import { useEffect, useState } from 'react';
import { unlockAudio } from '@/lib/audio';

/**
 * 첫 진입 시 전체화면 진입 + BGM 언락을 위한 탭 오버레이.
 * 한 세션 동안 dismiss 상태 유지(sessionStorage).
 */
export function TapToStartOverlay() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      try { if (sessionStorage.getItem('snug_tap_dismissed') !== '1') setShow(true); }
      catch { setShow(true); }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  if (!show) return null;

  const handleTap = () => {
    document.documentElement.requestFullscreen?.().catch(() => { /* ignore */ });
    unlockAudio();
    try { sessionStorage.setItem('snug_tap_dismissed', '1'); } catch { /* ignore */ }
    setShow(false);
  };

  return (
    <button
      onClick={handleTap}
      className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center text-white animate-pulse"
      style={{ wordBreak: 'keep-all' }}
    >
      <div className="text-7xl mb-6">🎵</div>
      <div className="text-3xl font-bold mb-3">화면을 탭하여 시작하세요</div>
      <div className="text-base opacity-80">배경 음악과 전체 화면이 켜집니다</div>
    </button>
  );
}
