'use client';

import { useSyncExternalStore } from 'react';
import { isMuted, setMuted, subscribeMute } from '@/lib/audio';

/** 오른쪽 위 음소거 버튼. 누른 뒤 포커스를 풀어 Enter·Space 가 다시 누르지 않게 한다. */
export function MuteButton() {
  const muted = useSyncExternalStore(subscribeMute, isMuted, () => false);

  return (
    <button
      type="button"
      aria-label={muted ? '소리 켜기' : '소리 끄기'}
      aria-pressed={muted}
      onClick={e => { setMuted(!muted); e.currentTarget.blur(); }}
      className="absolute top-2 right-2 z-[70] w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center border border-white/30"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
        {muted ? (
          <>
            <line x1="17" y1="9" x2="22" y2="15" />
            <line x1="22" y1="9" x2="17" y2="15" />
          </>
        ) : (
          <>
            <path d="M16.5 8.5a5 5 0 0 1 0 7" />
            <path d="M19 6a8.5 8.5 0 0 1 0 12" />
          </>
        )}
      </svg>
    </button>
  );
}
