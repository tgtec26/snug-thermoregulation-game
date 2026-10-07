import * as Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '@/game/config';
import { useGameStore } from '@/store/gameStore';
import type { SceneNodes, Country, WorldmapPaths, WorldmapRouteKey } from '@/game/types';
import { bezierPoint, bezierAngle } from '@/game/utils/bezier';

export class WorldMapScene extends Phaser.Scene {
  constructor() { super({ key: 'worldmap' }); }

  preload() {
    this.load.json('nodes_worldmap', '/data/nodes-worldmap.json');
    this.load.json('paths_worldmap', '/data/paths-worldmap.json');
  }

  create() {
    // HUD 미표시 씬이므로 풀 폭(1280) 사용
    this.add.image(0, 0, 'bg_worldmap').setOrigin(0, 0).setDisplaySize(GAME_WIDTH, GAME_HEIGHT);

    const nodesData = this.cache.json.get('nodes_worldmap') as SceneNodes;
    const pathsData = this.cache.json.get('paths_worldmap') as WorldmapPaths;

    const { phase, actualCold, actualHot } = useGameStore.getState();
    let from: Country | 'korea' = 'korea';
    let to: Country | 'korea' = 'korea';
    let routeKey: WorldmapRouteKey | null = null;

    if (phase === 'worldmap_to_1' && actualCold) {
      from = 'korea'; to = actualCold;
      routeKey = `korea_${actualCold}` as WorldmapRouteKey;
    } else if (phase === 'worldmap_to_2' && actualCold && actualHot) {
      from = actualCold; to = actualHot;
      routeKey = `${actualCold}_${actualHot}` as WorldmapRouteKey;
    } else if (phase === 'worldmap_to_home' && actualHot) {
      from = actualHot; to = 'korea';
      routeKey = `${actualHot}_korea` as WorldmapRouteKey;
    }

    const fromNode = nodesData?.nodes.find(n => n.id === from);
    const toNode   = nodesData?.nodes.find(n => n.id === to);

    if (!fromNode || !toNode) {
      console.error('[WorldMapScene] from/to node missing', { from, to });
      this.advanceAfterCutscene();
      return;
    }

    this.add.text(GAME_WIDTH / 2, 40, `${fromNode.label ?? from} → ${toNode.label ?? to}`, {
      fontFamily: 'Pretendard, system-ui',
      fontSize: '26px',
      color: '#1a3a5a',
      backgroundColor: '#ffffffcc',
      padding: { x: 12, y: 6 },
    }).setOrigin(0.5, 0.5);

    const cps = routeKey ? pathsData?.[routeKey] : null;
    const midX = (fromNode.x + toNode.x) / 2;
    const midY = Math.min(fromNode.y, toNode.y) - 100;
    const cp1 = cps?.cp1 ?? { x: midX, y: midY };
    const cp2 = cps?.cp2 ?? { x: midX, y: midY - 20 };

    const BASE_W = 60, BASE_H = 40;
    const PEAK_ZOOM = 0.3;   // 순항 시 최대 +30% (1.0 → 1.3 → 1.0)
    const isImage = this.textures.exists('move_airplane');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plane: any = isImage
      ? this.add.image(fromNode.x, fromNode.y, 'move_airplane').setOrigin(0.5, 0.5).setDisplaySize(BASE_W, BASE_H)
      : this.add.text(fromNode.x, fromNode.y, '✈️', { fontSize: '36px' }).setOrigin(0.5, 0.5);

    const progress = { t: 0 };
    this.tweens.add({
      targets: progress,
      t: 1,
      duration: 2500,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        const pos   = bezierPoint(progress.t, fromNode.x, fromNode.y, cp1.x, cp1.y, cp2.x, cp2.y, toNode.x, toNode.y);
        const angle = bezierAngle(progress.t, fromNode.x, fromNode.y, cp1.x, cp1.y, cp2.x, cp2.y, toNode.x, toNode.y);
        plane.setPosition(pos.x, pos.y);
        // airplane.png의 선두가 위쪽(↑)을 향하고 있음 → 경로 진행 방향에 맞추려면 +π/2 오프셋 필요
        plane.setRotation(angle + Math.PI / 2);
        // 이륙(처음) → 순항(중간 +30%) → 착륙(끝 원래) 줌
        const zoom = 1 + Math.sin(progress.t * Math.PI) * PEAK_ZOOM;
        if (isImage) plane.setDisplaySize(BASE_W * zoom, BASE_H * zoom);
        else plane.setScale(zoom);
      },
      onComplete: () => {
        this.time.delayedCall(500, () => this.advanceAfterCutscene());
      },
    });
  }

  private advanceAfterCutscene() {
    const { phase, setPhase, actualCold, actualHot } = useGameStore.getState();

    if (phase === 'worldmap_to_1') {
      useGameStore.getState().setMapPosition('airport');
      setPhase('country_1_arrived');
      this.scene.start('country_map', { country: actualCold!, slot: 1, position: 'airport' });
    } else if (phase === 'worldmap_to_2') {
      useGameStore.getState().setMapPosition('airport');
      setPhase('country_2_arrived');
      this.scene.start('country_map', { country: actualHot!, slot: 2, position: 'airport' });
    } else if (phase === 'worldmap_to_home') {
      setPhase('korea_bus_to_school');
      this.scene.start('korea_bus', { direction: 'to_school' });
    }
  }
}
