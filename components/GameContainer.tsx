'use client';

import { useEffect, useRef } from 'react';
import { setPhaserGame, type PausableGame } from '@/game/phaserGame';

export function GameContainer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<PausableGame | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    (async () => {
      const Phaser = (await import('phaser')).default;
      const { makePhaserConfig } = await import('@/game/phaserConfig');
      if (cancelled || !containerRef.current) return;
      const config = makePhaserConfig(containerRef.current);
      gameRef.current = new Phaser.Game(config) as unknown as PausableGame;
      setPhaserGame(gameRef.current);
    })();

    return () => {
      cancelled = true;
      gameRef.current?.destroy(true);
      gameRef.current = null;
      setPhaserGame(null);
    };
  }, []);

  return <div ref={containerRef} className="w-full h-full" />;
}
