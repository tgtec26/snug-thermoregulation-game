/** 일시정지가 Phaser 씬을 멈추고 이어 하게 쓰는 게임 등록소. GameContainer가 실제 게임을 등록한다. */
export interface PausableGame {
  scene: {
    pause(key: string): void;
    resume(key: string): void;
    getScenes(isActive?: boolean): Array<{ sys: { settings: { key: string } } }>;
  };
  destroy(removeCanvas: boolean): void;
}

let game: PausableGame | null = null;

export function setPhaserGame(next: PausableGame | null) {
  game = next;
}

export function getPhaserGame() {
  return game;
}

/** 현재 돌고 있는 씬을 모두 멈추고, 이어 할 때 쓸 키 목록을 돌려준다. */
export function pauseAllScenes(): string[] {
  const g = getPhaserGame();
  if (!g) return [];
  const keys = g.scene.getScenes(true).map(s => s.sys.settings.key);
  keys.forEach(key => g.scene.pause(key));
  return keys;
}

/** 멈췄던 씬을 다시 돌린다. */
export function resumeScenes(keys: string[]) {
  const g = getPhaserGame();
  if (!g) return;
  keys.forEach(key => g.scene.resume(key));
}
