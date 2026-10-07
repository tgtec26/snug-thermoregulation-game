'use client';

import { useEffect, useState } from 'react';
import { useGameStore } from '@/store/gameStore';

/**
 * 토스트는 store의 currentToast 문자열을 표시. 2.5초 후 자동 사라짐 (store에서 처리).
 */
export function Toast() {
  const message = useGameStore(s => s.currentToast);
  const [show, setShow] = useState(false);
  const [text, setText] = useState('');

  useEffect(() => {
    if (message && message.length > 0) {
      const showTimer = setTimeout(() => { setText(message); setShow(true); }, 0);
      const hideTimer = setTimeout(() => setShow(false), 2500);
      return () => { clearTimeout(showTimer); clearTimeout(hideTimer); };
    }
  }, [message]);

  if (!show) return null;
  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 bg-black/80 text-white px-3 py-1.5 rounded-full text-sm shadow-md">
      {text}
    </div>
  );
}
