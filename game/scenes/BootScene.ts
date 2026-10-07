import * as Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '@/game/config';
import { useGameStore } from '@/store/gameStore';
import { sceneForCheckpoint } from '@/game/systems/checkpoint';
import { BACKGROUNDS, SPRITES, COUNTRY_MAPS, MOVE_ASSETS, PLACEHOLDER_BG_COLORS } from '@/game/asset-manifest';

export class BootScene extends Phaser.Scene {
  constructor() { super({ key: 'BootScene' }); }

  preload() {
    // 자산이 실제로 있으면 로드, 없으면 onerror 후 BootScene.create()에서 placeholder 생성
    BACKGROUNDS.forEach(b => this.load.image(b.key, b.path));
    SPRITES.forEach(s => {
      if (s.type === 'spritesheet' && s.frameConfig) {
        this.load.spritesheet(s.key, s.path, s.frameConfig);
      } else {
        this.load.image(s.key, s.path);
      }
    });
    COUNTRY_MAPS.forEach(m => this.load.image(m.key, m.path));
    MOVE_ASSETS.forEach(a => this.load.image(a.key, a.path));

    // 누락된 자산 무시 (404 → 다음 자산 계속)
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.warn(`[BootScene] missing asset, will use placeholder: ${file.key}`);
    });
  }

  create() {
    // 자산이 없는 background에는 단색 placeholder 텍스처 생성
    BACKGROUNDS.forEach(b => {
      if (!this.textures.exists(b.key)) {
        const color = PLACEHOLDER_BG_COLORS[b.key] ?? 0x888888;
        const g = this.add.graphics();
        g.fillStyle(color, 1);
        g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        const label = this.add.text(GAME_WIDTH / 2, 40, `[placeholder] ${b.key}`,
          { fontFamily: 'system-ui', fontSize: '22px', color: '#222' }).setOrigin(0.5, 0.5);
        g.generateTexture(b.key, GAME_WIDTH, GAME_HEIGHT);
        g.destroy();
        label.destroy();
      }
    });

    // 플레이어 placeholder (자산 없을 때만): 캐릭터별·방향별 색사각형
    const playerPlaceholderColors: Record<string, number> = {
      player_korea: 0x4488ff,
      player_cold:  0x88ccff,
      player_hot:   0xff8844,
    };
    (['player_korea', 'player_cold', 'player_hot'] as const).forEach(char => {
      (['down', 'left', 'up', 'right'] as const).forEach(dir => {
        const key = `${char}_walk_${dir}`;
        if (!this.textures.exists(key)) {
          const g = this.add.graphics();
          g.fillStyle(playerPlaceholderColors[char], 1);
          g.fillRect(0, 0, 85, 165);
          g.generateTexture(key, 85, 165);
          g.destroy();
        }
      });
    });

    // ── 플레이어 walk 애니메이션 생성 ──
    // 각 방향별 PNG가 5프레임 가로 스트립 → 모두 frame 0..4. 8fps × 5 = 한 사이클 ~0.625s
    (['player_korea', 'player_cold', 'player_hot'] as const).forEach(char => {
      (['down', 'left', 'up', 'right'] as const).forEach(dir => {
        const texKey = `${char}_walk_${dir}`;
        const tex = this.textures.get(texKey);
        if (!tex || tex.frameTotal <= 1) return;   // placeholder(단일 프레임)는 스킵
        const animKey = `anim_${texKey}`;
        if (this.anims.exists(animKey)) return;
        // 위/아래 15fps, 좌/우 18fps — 좌우 보폭 차이로 미끄러짐 보정
        const fps = dir === 'left' || dir === 'right' ? 18 : 15;
        this.anims.create({
          key: animKey,
          frames: this.anims.generateFrameNumbers(texKey, { start: 0, end: 4 }),
          frameRate: fps,
          repeat: -1,
        });
      });
    });

    // 저장된 체크포인트에 맞는 Phaser 씬으로 진입한다. persist 동기 hydration 후 실행된다.
    const checkpoint = sceneForCheckpoint(useGameStore.getState());
    this.scene.start(checkpoint.key, checkpoint.data);
  }
}
