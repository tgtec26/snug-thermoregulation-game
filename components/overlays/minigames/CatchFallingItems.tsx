'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useGameStore } from '@/store/gameStore';
import type { MinigameResult } from '../MinigameModal';
import { playSfx } from '@/lib/audio';

/**
 * 사막 (더운 환경) — PANG 스타일 슈팅 게임.
 *
 * 조작: ← → (또는 A/D) 좌우 이동, Space 위로 발사.
 * 큰 공을 쏘면 작은 공 2개로 쪼개지며 티어2 아이템(±2) 드롭.
 * 작은 공을 쏘면 소멸하며 티어1 아이템(±1) 드롭.
 * 떨어지는 아이템을 받으면 점수 변화.
 *
 * 티어1: 냉수·수박·얼음 = +1 / 태양·불·고추 = -1
 * 티어2: 혈관 확장·땀 분비·티록신 감소 = +2 / 혈관 수축·근육 떨림·티록신 증가 = -2
 *
 * 공에 닿으면 0.5초 정지 + 떨림 + 붉은 실루엣 (실패 없음, 약한 페널티).
 */

const GAME_DURATION_SEC = 40;
const SUCCESS_SCORE = 8;
const FIELD_W = 760;
const FIELD_H = 480;

// 플레이어
const PLAYER_W = 51;
const PLAYER_H = 88;
const MOVE_SPEED = 380;

// 공
const LARGE_R = 28;
const SMALL_R = 18;
const GRAVITY = 540;
const LARGE_SPAWN_MS = 4500;
// 공 누적 가중치: 큰 공=2, 작은 공=1. 합이 이 값 이상이면 큰 공 신규 스폰 중단.
const MAX_BALL_WEIGHT = 4;
// 바닥에서 튕길 때 위로 솟는 초기 속도. 최고점 = V²/(2g)
// FIELD_H=480, g=540 기준 → 큰 공 80%(384px) ≈ 644, 작은 공 50%(240px) ≈ 509
const LARGE_BOUNCE_VY = 644;
const SMALL_BOUNCE_VY = 509;

// 총알
const BULLET_W = 5;
const BULLET_H = 18;
const BULLET_SPEED = 760;
const BULLET_COOLDOWN_MS = 360;

// 아이템 (스프라이트 캡션 포함 → 세로가 더 김)
const ITEM_W = 56;
const ITEM_H = 80;
const ITEM_FALL = 230;

// 타격
const HIT_FREEZE_MS = 500;
const HIT_INVULN_MS = 900;

// 아이템 풀 — 스프라이트 시트에서 추출한 개별 PNG (캡션 포함)
const ITEMS_DIR = '/assets/sprites/items';
const T1_GOOD = [`${ITEMS_DIR}/cold_water.png`, `${ITEMS_DIR}/watermelon.png`, `${ITEMS_DIR}/ice.png`] as const;
const T1_BAD = [`${ITEMS_DIR}/sun.png`, `${ITEMS_DIR}/fire.png`, `${ITEMS_DIR}/pepper.png`] as const;
const T2_GOOD = [`${ITEMS_DIR}/vessel_dilate.png`, `${ITEMS_DIR}/sweat.png`, `${ITEMS_DIR}/thyroxine_down.png`] as const;
const T2_BAD = [`${ITEMS_DIR}/vessel_constrict.png`, `${ITEMS_DIR}/muscle_shiver.png`, `${ITEMS_DIR}/thyroxine_up.png`] as const;

interface Ball { id: number; x: number; y: number; vx: number; vy: number; size: 'L' | 'S'; }
interface Bullet { id: number; x: number; y: number; }
interface ItemDrop { id: number; x: number; y: number; src: string; delta: number; tier: 1 | 2; }
interface Splash { id: number; x: number; y: number; r: number; t0: number; }

interface Props { onFinish: (result: MinigameResult) => void; }

export function CatchFallingItems({ onFinish }: Props) {
  const adjustTemp = useGameStore(s => s.adjustTemp);

  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [score, setScore] = useState(0);
  const scoreRef = useRef(0);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION_SEC);
  const timeLeftRef = useRef(GAME_DURATION_SEC);
  const [timeUp, setTimeUp] = useState(false);
  const timeUpRef = useRef(false);

  const playerXRef = useRef(FIELD_W / 2);
  const playerDirRef = useRef<'L' | 'R'>('R');
  const [playerX, setPlayerX] = useState(FIELD_W / 2);
  const [playerDir, setPlayerDir] = useState<'L' | 'R'>('R');
  const [shootingPose, setShootingPose] = useState(false);
  const shootPoseUntilRef = useRef(0);

  // shoot-up sprite: tries shoot_up.png, falls back to walk_up.png
  const [shootSprite, setShootSprite] = useState('/assets/sprites/player_hot_walk_up.png');
  useEffect(() => {
    const img = new Image();
    img.onload = () => setShootSprite('/assets/sprites/player_hot_shoot_up.png');
    img.src = '/assets/sprites/player_hot_shoot_up.png';
  }, []);

  const ballsRef = useRef<Ball[]>([]);
  const [balls, setBalls] = useState<Ball[]>([]);
  const bulletsRef = useRef<Bullet[]>([]);
  const [bullets, setBullets] = useState<Bullet[]>([]);
  const itemsRef = useRef<ItemDrop[]>([]);
  const [items, setItems] = useState<ItemDrop[]>([]);
  const splashesRef = useRef<Splash[]>([]);
  const [splashes, setSplashes] = useState<Splash[]>([]);
  const [popText, setPopText] = useState<{ id: number; x: number; y: number; text: string; good: boolean } | null>(null);

  const idRef = useRef(0);
  const nextId = () => ++idRef.current;

  const keysRef = useRef({ left: false, right: false });
  const lastShotRef = useRef(0);
  const lastFrameRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const finishedRef = useRef(false);

  const hitUntilRef = useRef(0);
  const invulnUntilRef = useRef(0);
  const [hit, setHit] = useState(false);

  // viewport에 맞춰 게임 컨테이너 자동 스케일 (두 축 독립 → viewport 가득)
  const containerRef = useRef<HTMLDivElement>(null);
  const [scaleX, setScaleX] = useState(1);
  const [scaleY, setScaleY] = useState(1);
  useEffect(() => {
    const BASE_W = FIELD_W + 32;    // 게임 필드 + 벽돌 보더(32)
    const BASE_H = FIELD_H + 32;    // 게임 필드 + 벽돌 보더(32)
    const calc = () => {
      setScaleX(window.innerWidth / BASE_W);
      setScaleY(window.innerHeight / BASE_H);
    };
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);

  const handleStart = useCallback(() => {
    setStarted(true);
    const el = containerRef.current;
    if (el && document.fullscreenEnabled && !document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
    }
  }, []);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setFinished(true);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    const success = scoreRef.current >= SUCCESS_SCORE;
    setTimeout(() => onFinish({ success, score: scoreRef.current }), 800);
  }, [onFinish]);

  // 타이머
  useEffect(() => {
    if (!started || finished) return;
    const id = setInterval(() => {
      timeLeftRef.current = Math.max(0, timeLeftRef.current - 1);
      setTimeLeft(timeLeftRef.current);
      if (timeLeftRef.current <= 0) {
        clearInterval(id);
        timeUpRef.current = true;
        setTimeUp(true);
        // 시간 종료 즉시 끝내지 않고, 남아있는 공이 모두 제거되면 종료 (게임 루프에서 처리)
      }
    }, 1000);
    return () => clearInterval(id);
  }, [started, finished, finish]);

  // 발사
  const tryShoot = useCallback(() => {
    const now = performance.now();
    if (now - lastShotRef.current < BULLET_COOLDOWN_MS) return;
    if (now < hitUntilRef.current) return;
    lastShotRef.current = now;
    playSfx('shoot');
    bulletsRef.current = [
      ...bulletsRef.current,
      { id: nextId(), x: playerXRef.current, y: FIELD_H - PLAYER_H + 12 },
    ];
    shootPoseUntilRef.current = now + 220;
    setShootingPose(true);
  }, []);

  // 키 입력
  useEffect(() => {
    if (!started || finished) return;
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (e.key === 'ArrowLeft' || k === 'a') { keysRef.current.left = true; e.preventDefault(); }
      if (e.key === 'ArrowRight' || k === 'd') { keysRef.current.right = true; e.preventDefault(); }
      if (e.key === ' ' || e.code === 'Space' || k === 'arrowup' || k === 'w') {
        e.preventDefault();
        tryShoot();
      }
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (e.key === 'ArrowLeft' || k === 'a') keysRef.current.left = false;
      if (e.key === 'ArrowRight' || k === 'd') keysRef.current.right = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [started, finished, tryShoot]);

  // 큰 공 spawn
  useEffect(() => {
    if (!started || finished || timeUp) return;
    const spawn = () => {
      if (timeUpRef.current) return;
      const weight = ballsRef.current.reduce((w, b) => w + (b.size === 'L' ? 2 : 1), 0);
      if (weight >= MAX_BALL_WEIGHT) return;
      const fromLeft = Math.random() < 0.5;
      ballsRef.current = [
        ...ballsRef.current,
        {
          id: nextId(),
          x: fromLeft ? LARGE_R + 10 : FIELD_W - LARGE_R - 10,
          y: 60 + Math.random() * 30,
          vx: (fromLeft ? 1 : -1) * (90 + Math.random() * 60),
          vy: 0,
          size: 'L',
        },
      ];
    };
    spawn();
    const id = setInterval(spawn, LARGE_SPAWN_MS);
    return () => clearInterval(id);
  }, [started, finished, timeUp]);

  // 게임 루프
  useEffect(() => {
    if (!started || finished) return;
    lastFrameRef.current = performance.now();

    const loop = (now: number) => {
      const dt = Math.min(0.033, (now - lastFrameRef.current) / 1000);
      lastFrameRef.current = now;
      const frozen = now < hitUntilRef.current;

      // 플레이어 이동
      if (!frozen) {
        let nx = playerXRef.current;
        if (keysRef.current.left) { nx -= MOVE_SPEED * dt; playerDirRef.current = 'L'; }
        if (keysRef.current.right) { nx += MOVE_SPEED * dt; playerDirRef.current = 'R'; }
        nx = Math.max(PLAYER_W / 2, Math.min(FIELD_W - PLAYER_W / 2, nx));
        playerXRef.current = nx;
        setPlayerX(nx);
        setPlayerDir(playerDirRef.current);
      }
      if (now >= shootPoseUntilRef.current) setShootingPose(false);

      // 공 물리
      const ballsMoved: Ball[] = ballsRef.current.map(b => {
        let { x, y, vx, vy } = b;
        const r = b.size === 'L' ? LARGE_R : SMALL_R;
        vy += GRAVITY * dt;
        x += vx * dt;
        y += vy * dt;
        if (x < r) { x = r; vx = Math.abs(vx); }
        if (x > FIELD_W - r) { x = FIELD_W - r; vx = -Math.abs(vx); }
        if (y > FIELD_H - r) {
          y = FIELD_H - r;
          vy = -(b.size === 'L' ? LARGE_BOUNCE_VY : SMALL_BOUNCE_VY);
        }
        if (y < r) { y = r; vy = Math.abs(vy); }
        return { ...b, x, y, vx, vy };
      });

      // 총알 이동
      const bulletsMoved = bulletsRef.current
        .map(bu => ({ ...bu, y: bu.y - BULLET_SPEED * dt }))
        .filter(bu => bu.y > -20);

      // 총알 ↔ 공 충돌
      const newItems: ItemDrop[] = [];
      const newSplashes: Splash[] = [];
      const ballsAfter: Ball[] = [];
      const bulletsAlive = bulletsMoved.slice();
      for (const b of ballsMoved) {
        const r = b.size === 'L' ? LARGE_R : SMALL_R;
        let hitIdx = -1;
        for (let i = 0; i < bulletsAlive.length; i++) {
          const bu = bulletsAlive[i];
          if (bu.x > b.x - r - BULLET_W && bu.x < b.x + r + BULLET_W
              && bu.y > b.y - r && bu.y < b.y + r + BULLET_H) {
            hitIdx = i;
            break;
          }
        }
        if (hitIdx < 0) {
          ballsAfter.push(b);
          continue;
        }
        bulletsAlive.splice(hitIdx, 1);
        newSplashes.push({ id: nextId(), x: b.x, y: b.y, r, t0: now });
        if (b.size === 'L') {
          ballsAfter.push({ id: nextId(), x: b.x - 4, y: b.y, vx: -160, vy: -260, size: 'S' });
          ballsAfter.push({ id: nextId(), x: b.x + 4, y: b.y, vx: 160, vy: -260, size: 'S' });
          const isGood = Math.random() < 0.55;
          const pool = isGood ? T2_GOOD : T2_BAD;
          newItems.push({
            id: nextId(), x: b.x, y: b.y,
            src: pool[Math.floor(Math.random() * pool.length)],
            delta: isGood ? 2 : -1, tier: 2,
          });
        } else {
          const isGood = Math.random() < 0.55;
          const pool = isGood ? T1_GOOD : T1_BAD;
          newItems.push({
            id: nextId(), x: b.x, y: b.y,
            src: pool[Math.floor(Math.random() * pool.length)],
            delta: isGood ? 2 : -1, tier: 1,
          });
        }
      }
      ballsRef.current = ballsAfter;
      bulletsRef.current = bulletsAlive;
      setBalls(ballsAfter);
      setBullets(bulletsAlive);

      // 아이템 낙하 + 캐치
      const playerTop = FIELD_H - PLAYER_H;
      const itemsAlive: ItemDrop[] = [];
      let popped: { delta: number; tier: 1 | 2; x: number; y: number } | null = null;
      for (const it of [...itemsRef.current, ...newItems]) {
        const ny = it.y + ITEM_FALL * dt;
        if (ny > playerTop && Math.abs(it.x - playerXRef.current) < PLAYER_W / 2 + ITEM_W / 2 - 6) {
          scoreRef.current = Math.max(-99, Math.min(99, scoreRef.current + it.delta));
          setScore(scoreRef.current);
          adjustTemp(-0.08 * it.delta);
          playSfx(it.delta > 0 ? 'item_good' : 'item_bad');
          popped = { delta: it.delta, tier: it.tier, x: it.x, y: ny - 36 };
          continue;
        }
        if (ny > FIELD_H + ITEM_H) continue;
        itemsAlive.push({ ...it, y: ny });
      }
      itemsRef.current = itemsAlive;
      setItems(itemsAlive);
      if (popped) {
        setPopText({
          id: nextId(),
          x: popped.x, y: popped.y - 24,
          text: (popped.delta > 0 ? '+' : '') + popped.delta,
          good: popped.delta > 0,
        });
        setTimeout(() => setPopText(null), 1500);
      }

      // splash decay (200ms)
      splashesRef.current = [...splashesRef.current, ...newSplashes].filter(s => now - s.t0 < 250);
      setSplashes(splashesRef.current);

      // 공 ↔ 플레이어
      if (now > invulnUntilRef.current) {
        const px = playerXRef.current;
        const py = FIELD_H - PLAYER_H / 2;
        for (const b of ballsAfter) {
          const r = b.size === 'L' ? LARGE_R : SMALL_R;
          if (Math.abs(b.x - px) < PLAYER_W / 2 + r - 6
              && Math.abs(b.y - py) < PLAYER_H / 2 + r - 8) {
            hitUntilRef.current = now + HIT_FREEZE_MS;
            invulnUntilRef.current = now + HIT_INVULN_MS;
            setHit(true);
            setTimeout(() => setHit(false), HIT_FREEZE_MS);
            break;
          }
        }
      }

      // 시간 종료 후 남은 공이 모두 사라지면 종료
      if (timeUpRef.current && ballsRef.current.length === 0 && !finishedRef.current) {
        finish();
      }

      if (!finishedRef.current) {
        rafRef.current = requestAnimationFrame(loop);
      }
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [started, finished, adjustTemp, finish]);

  // 사막 자동 체온 상승
  useEffect(() => {
    if (!started || finished) return;
    const id = setInterval(() => adjustTemp(+0.03), 300);
    return () => clearInterval(id);
  }, [started, finished, adjustTemp]);

  const sandRatio = timeLeft / GAME_DURATION_SEC;
  const topSandY = 6 + 44 * (1 - sandRatio);
  const botSandY = 94 - 44 * (1 - sandRatio);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-40 flex items-center justify-center overflow-hidden"
      style={{
        wordBreak: 'keep-all',
        overflowWrap: 'break-word',
        backgroundImage: 'url(/assets/backgrounds/dubai_desert.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        imageRendering: 'pixelated',
      }}
    >
      <div
        style={{
          transform: `scale(${scaleX}, ${scaleY})`,
          transformOrigin: 'center center',
        }}
      >
        {/* 게임 필드 */}
        <div
          className="relative overflow-hidden rounded-lg select-none"
          style={{
            width: FIELD_W,
            height: FIELD_H,
            boxSizing: 'content-box',
            backgroundImage: 'url(/assets/backgrounds/dubai_desert.png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            border: '16px solid transparent',
            borderImage: 'repeating-linear-gradient(45deg, #c2410c 0 16px, #92400e 16px 32px) 16',
            imageRendering: 'pixelated',
            animation: hit ? 'field-shake 0.4s ease-in-out' : undefined,
          }}
        >
          {/* 모래시계 (게임 필드 안 우상단) */}
          <div className="absolute top-3 right-3 z-10 flex flex-row items-start gap-2 bg-black/55 rounded-lg px-3 py-2 pointer-events-none">
            <svg width="48" height="72" viewBox="0 0 70 100">
              <rect x="0" y="0" width="70" height="6" fill="#8b6914" rx="2"/>
              <rect x="0" y="94" width="70" height="6" fill="#8b6914" rx="2"/>
              <defs>
                <clipPath id="hgTop"><polygon points="5,6 65,6 36,50 34,50"/></clipPath>
                <clipPath id="hgBot"><polygon points="34,50 36,50 65,94 5,94"/></clipPath>
              </defs>
              <polygon points="5,6 65,6 36,50 34,50" fill="rgba(0,0,0,0.25)" stroke="#a16207" strokeWidth="1.5"/>
              <polygon points="34,50 36,50 65,94 5,94" fill="rgba(0,0,0,0.25)" stroke="#a16207" strokeWidth="1.5"/>
              {sandRatio > 0.01 && (
                <rect x="5" y={topSandY} width="60" height={50 - topSandY} fill="#fbbf24" clipPath="url(#hgTop)"/>
              )}
              {sandRatio < 0.99 && (
                <rect x="5" y={botSandY} width="60" height={94 - botSandY} fill="#fbbf24" clipPath="url(#hgBot)"/>
              )}
              {sandRatio > 0.02 && sandRatio < 0.98 && (
                <rect x="34" y="50" width="2" height="6" fill="#fbbf24"/>
              )}
            </svg>
            <div className="flex flex-col items-center justify-start leading-none">
              <div className="text-2xl font-bold text-yellow-200">{timeLeft}</div>
              <div className="text-2xl font-bold text-white mt-1">{score}</div>
            </div>
          </div>

          {/* 공 */}
          {balls.map(b => {
            const r = b.size === 'L' ? LARGE_R : SMALL_R;
            return (
              <div
                key={b.id}
                style={{
                  position: 'absolute',
                  left: b.x - r, top: b.y - r,
                  width: r * 2, height: r * 2,
                  borderRadius: '50%',
                  background: b.size === 'L'
                    ? 'radial-gradient(circle at 35% 35%, #fef2f2 0%, #ef4444 50%, #991b1b 100%)'
                    : 'radial-gradient(circle at 35% 35%, #fef2f2 0%, #f97316 50%, #9a3412 100%)',
                  boxShadow: '0 4px 8px rgba(0,0,0,0.35)',
                  pointerEvents: 'none',
                }}
              />
            );
          })}

          {/* 총알 */}
          {bullets.map(bu => (
            <div
              key={bu.id}
              style={{
                position: 'absolute',
                left: bu.x - BULLET_W / 2, top: bu.y,
                width: BULLET_W, height: BULLET_H,
                background: 'linear-gradient(180deg, #fde047 0%, #f59e0b 100%)',
                borderRadius: 2,
                boxShadow: '0 0 6px rgba(253,224,71,0.8)',
                pointerEvents: 'none',
              }}
            />
          ))}

          {/* 떨어지는 아이템 — 스프라이트 PNG (캡션 포함) */}
          {items.map(it => (
            <img
              key={it.id}
              src={it.src}
              alt=""
              draggable={false}
              style={{
                position: 'absolute',
                left: it.x - ITEM_W / 2,
                top: it.y - ITEM_H / 2,
                width: ITEM_W,
                height: ITEM_H,
                objectFit: 'contain',
                imageRendering: 'pixelated',
                filter: it.tier === 2
                  ? `drop-shadow(0 0 3px ${it.delta > 0 ? '#06b6d4' : '#f43f5e'}) drop-shadow(0 2px 4px rgba(0,0,0,0.5))`
                  : 'drop-shadow(0 2px 3px rgba(0,0,0,0.4))',
                pointerEvents: 'none',
                userSelect: 'none',
              }}
            />
          ))}

          {/* 공 쪼개짐 스플래시 */}
          {splashes.map(s => (
            <div
              key={s.id}
              style={{
                position: 'absolute',
                left: s.x - s.r * 1.6, top: s.y - s.r * 1.6,
                width: s.r * 3.2, height: s.r * 3.2,
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(255,255,255,0.85) 0%, rgba(253,224,71,0.5) 40%, transparent 70%)',
                animation: 'splash-fade 0.25s ease-out forwards',
                pointerEvents: 'none',
              }}
            />
          ))}

          {/* 점수 팝업 */}
          {popText && (
            <div
              key={popText.id}
              style={{
                position: 'absolute',
                left: popText.x - 30, top: popText.y,
                width: 60, textAlign: 'center',
                fontWeight: 900, fontSize: 33,
                color: popText.good ? '#22c55e' : '#ef4444',
                textShadow: '0 0 4px #fff, 0 0 4px #fff',
                animation: 'pop-up 1.5s ease-out forwards',
                pointerEvents: 'none',
              }}
            >
              {popText.text}
            </div>
          )}

          {/* 플레이어 */}
          <div
            style={{
              position: 'absolute',
              left: playerX - PLAYER_W / 2,
              top: FIELD_H - PLAYER_H,
              width: PLAYER_W,
              height: PLAYER_H,
              backgroundImage: `url(${
                shootingPose
                  ? shootSprite
                  : playerDir === 'L'
                    ? '/assets/sprites/player_hot_walk_left.png'
                    : '/assets/sprites/player_hot_walk_right.png'
              })`,
              backgroundSize: '500% 100%',
              backgroundPosition: '0% 0%',
              imageRendering: 'pixelated',
              animation: hit ? 'player-tremble 0.1s linear infinite' : undefined,
              pointerEvents: 'none',
            }}
          />

          {/* 타격 붉은 실루엣 오버레이 */}
          {hit && (
            <div
              className="absolute pointer-events-none"
              style={{
                left: playerX - PLAYER_W / 2,
                top: FIELD_H - PLAYER_H,
                width: PLAYER_W,
                height: PLAYER_H,
                background: 'rgba(239,68,68,0.55)',
                mixBlendMode: 'multiply',
                borderRadius: 6,
              }}
            />
          )}
        </div>

        {finished && (
          <div className="absolute inset-0 bg-black/85 rounded-2xl flex flex-col items-center justify-center text-white">
            <h2 className="text-3xl font-bold mb-2">{score >= SUCCESS_SCORE ? '🎉 잘했어요!' : '⏰ 시간 종료'}</h2>
            <p className="text-lg mb-1">점수 <span className="text-amber-300 font-bold">{score}</span> / {SUCCESS_SCORE}</p>
            <p className="text-sm text-slate-300">다음 단계로 진행…</p>
          </div>
        )}
      </div>

      {/* 터치 컨트롤 — 좌하단 이동, 우하단 이동 + 위에 발사 (스케일 컨테이너 밖) */}
      {started && !finished && (
        <>
          {/* 왼쪽 이동 */}
          <button
            type="button"
            aria-label="왼쪽 이동"
            onPointerDown={(e) => { e.preventDefault(); (e.target as Element).setPointerCapture?.(e.pointerId); keysRef.current.left = true; }}
            onPointerUp={() => { keysRef.current.left = false; }}
            onPointerCancel={() => { keysRef.current.left = false; }}
            onPointerLeave={() => { keysRef.current.left = false; }}
            className="absolute z-50 select-none flex items-center justify-center text-white font-bold active:scale-95"
            style={{
              left: 24,
              bottom: 24,
              width: 77,
              height: 77,
              background: 'rgba(0,0,0,0.55)',
              border: '3px solid rgba(255,255,255,0.7)',
              borderRadius: '50%',
              fontSize: 32,
              touchAction: 'none',
            }}
          >
            ◀
          </button>
          {/* 오른쪽 이동 */}
          <button
            type="button"
            aria-label="오른쪽 이동"
            onPointerDown={(e) => { e.preventDefault(); (e.target as Element).setPointerCapture?.(e.pointerId); keysRef.current.right = true; }}
            onPointerUp={() => { keysRef.current.right = false; }}
            onPointerCancel={() => { keysRef.current.right = false; }}
            onPointerLeave={() => { keysRef.current.right = false; }}
            className="absolute z-50 select-none flex items-center justify-center text-white font-bold active:scale-95"
            style={{
              right: 24,
              bottom: 24,
              width: 77,
              height: 77,
              background: 'rgba(0,0,0,0.55)',
              border: '3px solid rgba(255,255,255,0.7)',
              borderRadius: '50%',
              fontSize: 32,
              touchAction: 'none',
            }}
          >
            ▶
          </button>
          {/* 발사 — 오른쪽 이동 버튼 위 */}
          <button
            type="button"
            aria-label="발사"
            onPointerDown={(e) => { e.preventDefault(); tryShoot(); }}
            className="absolute z-50 select-none flex items-center justify-center text-white font-bold active:scale-95"
            style={{
              right: 24,
              bottom: 24 + 77 + 13,
              width: 77,
              height: 77,
              background: 'rgba(220,38,38,0.7)',
              border: '3px solid rgba(255,255,255,0.8)',
              borderRadius: '50%',
              fontSize: 29,
              touchAction: 'none',
              boxShadow: '0 0 16px rgba(220,38,38,0.7)',
            }}
          >
            ●
          </button>
        </>
      )}

      {/* 시작 안내 — viewport 전체 (스케일 컨테이너 밖) */}
      {!started && (
        <div
          className="absolute inset-0 z-50 bg-black/95 flex flex-col items-center justify-center text-white px-8 text-center"
          style={{ wordBreak: 'keep-all' }}
        >
          <h2 className="text-5xl font-bold mb-8">🏜️ 사막의 더위!</h2>
          <p className="text-lg text-yellow-100 mb-3 max-w-3xl leading-relaxed">
            체온이 빠르게 오르고 있어요. <strong>공을 쏴서</strong> 시원한 아이템을 떨어뜨리고,
            떨어진 아이템을 받아 점수를 모아요.
          </p>
          <p className="text-lg text-cyan-200 mb-2">큰 공 = ±2점 아이템 · 작은 공 = ±1점 아이템</p>
          <p className="text-lg text-red-200 mb-8">공에 닿으면 잠시 멈춰요!</p>
          <button
            onClick={handleStart}
            className="bg-amber-500 hover:bg-amber-600 text-white font-bold px-10 py-4 rounded-full shadow-xl text-lg"
          >
            시작 (←/→ 이동, Space 발사)
          </button>
        </div>
      )}

      <style jsx>{`
        @keyframes splash-fade {
          0%   { opacity: 1; transform: scale(0.4); }
          100% { opacity: 0; transform: scale(1.4); }
        }
        @keyframes pop-up {
          0%   { opacity: 0; transform: translateY(8px); }
          15%  { opacity: 1; }
          100% { opacity: 0; transform: translateY(-30px); }
        }
        @keyframes player-tremble {
          0%   { transform: translateX(-2px); }
          50%  { transform: translateX(2px); }
          100% { transform: translateX(-2px); }
        }
        @keyframes field-shake {
          0%, 100% { transform: translateX(0); }
          25%      { transform: translateX(-3px); }
          75%      { transform: translateX(3px); }
        }
      `}</style>
    </div>
  );
}
