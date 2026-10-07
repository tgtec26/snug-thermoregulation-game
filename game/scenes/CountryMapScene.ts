import * as Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, WALK_SPEED } from '@/game/config';
import { useGameStore } from '@/store/gameStore';
import { getCountryById } from '@/game/data/countries';
import type {
  Country, Phase, SceneNodes,
  CountryMapPaths, CountryMapPathKey,
} from '@/game/types';

type Position = 'airport' | 'outdoor' | 'indoor';

interface CountryMapInit {
  country: Country;
  slot: 1 | 2;
  position?: Position;     // 캐릭터 시작 위치 (비행기 도착 시 'airport')
}

// 한글 받침 유무로 조사(으로/로) 선택. 받침 없음 + ㄹ 받침 → '로', 그 외 → '으로'
function josa(text: string): '로' | '으로' {
  const last = text[text.length - 1];
  if (!last) return '로';
  const code = last.charCodeAt(0) - 0xAC00;
  if (code < 0 || code > 11171) return '로';   // 한글 음절 아님
  const jongseong = code % 28;
  return jongseong === 0 || jongseong === 8 ? '로' : '으로';
}

/**
 * 국가 맵 — 공항/야외/실내 사이를 맨해튼 폴리라인 경로로 캐릭터가 걸어다니는 hub.
 * 순서 고정: airport → outdoor → indoor → airport.
 */
export class CountryMapScene extends Phaser.Scene {
  private country: Country = 'finland';
  private slot: 1 | 2 = 1;
  private position: Position = 'airport';
  private nodesData: SceneNodes | null = null;
  private pathsData: CountryMapPaths | null = null;
  private player!: Phaser.GameObjects.Sprite;
  private isMoving = false;
  private storeUnsub: (() => void) | null = null;

  constructor() { super({ key: 'country_map' }); }

  init(data: CountryMapInit) {
    this.country = data.country;
    this.slot = data.slot;
    this.position = data.position ?? 'airport';
  }

  preload() {
    const scene = `country_${this.country}_map`;
    this.load.json(`nodes_${scene}`, `/data/nodes-${scene}.json`);
    this.load.json(`paths_${scene}`, `/data/paths-${scene}.json`);
  }

  create() {
    useGameStore.getState().setMapPosition(this.position);
    // HUD 미표시 씬이므로 풀 폭(1280) 사용 — 어드민에서 저장한 노드/경로 좌표(1280 viewBox)와 일치
    this.add.image(0, 0, `map_${this.country}`).setOrigin(0, 0).setDisplaySize(GAME_WIDTH, GAME_HEIGHT);

    const scene = `country_${this.country}_map`;
    this.nodesData = this.cache.json.get(`nodes_${scene}`) as SceneNodes;
    this.pathsData = this.cache.json.get(`paths_${scene}`) as CountryMapPaths;
    if (!this.nodesData || !this.pathsData) {
      console.error(`[CountryMapScene] failed to load ${scene} data`);
      return;
    }

    // 캐릭터 배치
    const startNode = this.nodesData.nodes.find(n => n.id === this.position);
    if (!startNode) {
      console.error(`[CountryMapScene] start node "${this.position}" not found`);
      return;
    }
    const playerKey = this.getPlayerKey();
    // <char>_walk_down frame 0 = idle 포즈 (자매 프로젝트 패턴)
    this.player = this.add.sprite(startNode.x, startNode.y, `${playerKey}_walk_down`, 0)
      .setOrigin(0.5, 1)
      .setDisplaySize(64, 120);

    // React 오버레이가 SVG 버튼 자동 렌더 (NodeLabelOverlay)
    useGameStore.getState().setActiveNodes(this.nodesData);

    // 다음 목적지 + 영구 안내 배너 (학생이 클릭할 때까지 유지)
    // 게시판 텍스트는 노드의 `label` 필드 기반 — "{label}{으로/로} 이동하세요"
    const nextDest = this.computeNextDest();
    const destNode = this.nodesData.nodes.find(n => n.id === nextDest);
    const destLabel = destNode?.label ?? nextDest;
    useGameStore.getState().setGuidance(`${destLabel}${josa(destLabel)} 이동하세요`);
    useGameStore.getState().setTargetNodeId(nextDest);

    // 노드 클릭 브릿지 (NodeLabelOverlay가 pendingNodeClick 설정)
    // 잘못된 노드 클릭은 무시(경고 토스트 표시 없음) — 강조된 정답 노드만 반응
    // 방어적: 이전 인스턴스의 subscriber가 남아 있을 가능성 차단 (Phaser 씬 재진입 시 closure leak 방지)
    if (this.storeUnsub) { this.storeUnsub(); this.storeUnsub = null; }
    const unsub = useGameStore.subscribe((state, prev) => {
      if (!this.scene) { unsub(); return; }
      if (state.pendingNodeClick && state.pendingNodeClick !== prev.pendingNodeClick) {
        const clicked = state.pendingNodeClick;
        useGameStore.getState().clearNodeClick();
        if (clicked === nextDest) {
          this.walkTo(nextDest);
        }
      }
    });
    this.storeUnsub = unsub;
    // shutdown/destroy 이벤트로도 한 번 더 정리 (shutdown() 메서드 + 이중 안전망)
    const cleanup = () => {
      unsub();
      if (this.storeUnsub === unsub) this.storeUnsub = null;
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
  }

  shutdown() {
    this.storeUnsub?.();
    this.storeUnsub = null;
    useGameStore.getState().setActiveNodes(null);
    useGameStore.getState().setGuidance('');
    useGameStore.getState().setTargetNodeId(null);
  }

  private computeNextDest(): Position {
    return this.position === 'airport' ? 'outdoor'
         : this.position === 'outdoor' ? 'indoor'
         : 'airport';
  }

  private getPlayerKey(): string {
    const cfg = getCountryById(this.country);
    return cfg?.group === 'hot' ? 'player_hot' : 'player_cold';
  }

  private walkTo(dest: Position) {
    if (this.isMoving || !this.nodesData || !this.pathsData) return;
    this.isMoving = true;

    const pathKey = `${this.position}_${dest}` as CountryMapPathKey;
    const wps = this.pathsData[pathKey]?.waypoints ?? [];
    const fromN = this.nodesData.nodes.find(n => n.id === this.position);
    const toN   = this.nodesData.nodes.find(n => n.id === dest);
    if (!fromN || !toN) { this.isMoving = false; return; }

    const polyline = [
      { x: fromN.x, y: fromN.y },
      ...wps,
      { x: toN.x, y: toN.y },
    ];

    // 이동 중에는 React SVG 버튼 + 안내 배너 + 핀 모두 일시 제거 (중복 클릭/혼란 방지)
    useGameStore.getState().setActiveNodes(null);
    useGameStore.getState().setGuidance('');
    useGameStore.getState().setTargetNodeId(null);

    this.walkSegments(polyline, 0, () => {
      this.isMoving = false;
      this.player.stop();
      if (this.player.texture.frameTotal > 1) this.player.setFrame(0);
      this.onArrive(dest);
    });
  }

  private walkSegments(pts: { x: number; y: number }[], i: number, onDone: () => void) {
    if (i >= pts.length - 1) { onDone(); return; }
    const from = pts[i];
    const to = pts[i + 1];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) { this.walkSegments(pts, i + 1, onDone); return; }
    const dur = (dist / WALK_SPEED) * 1000;

    const dir: 'left' | 'right' | 'up' | 'down' =
      Math.abs(dx) > Math.abs(dy)
        ? (dx > 0 ? 'right' : 'left')
        : (dy > 0 ? 'down' : 'up');
    const animKey = `anim_${this.getPlayerKey()}_walk_${dir}`;
    if (this.anims.exists(animKey)) this.player.play(animKey, true);

    this.tweens.add({
      targets: this.player,
      x: to.x,
      y: to.y,
      duration: dur,
      ease: 'Linear',
      onComplete: () => this.walkSegments(pts, i + 1, onDone),
    });
  }

  private onArrive(dest: Position) {
    const store = useGameStore.getState();
    if (dest === 'outdoor') {
      // 인트로 phase 먼저 → TeacherIntro 종료 시 country_<slot>_outdoor 로 자동 전환
      store.setPhase((this.slot === 1 ? 'country_1_outdoor_intro' : 'country_2_outdoor_intro') as Phase);
      this.scene.start('country', { country: this.country, slot: this.slot, area: 'outdoor' });
    } else if (dest === 'indoor') {
      store.setPhase((this.slot === 1 ? 'country_1_indoor_intro' : 'country_2_indoor_intro') as Phase);
      this.scene.start('country', { country: this.country, slot: this.slot, area: 'indoor' });
    } else {
      // 공항 복귀 → 해당 국가 공항 퀴즈
      store.completeCountry(this.country);
      store.setPhase((this.slot === 1 ? 'airport_1' : 'airport_2') as Phase);
      this.scene.start('airport', { airportKey: `airport_${this.country}` });
    }
  }
}
