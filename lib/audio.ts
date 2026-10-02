/**
 * 단일 BGM 트랙 + one-shot SFX 매니저.
 * - playBgm(key): 같은 키면 재생 중인 한 무시. 같은 키 + paused면 재생 재시도(autoplay unlock).
 * - stopBgm(): 현재 BGM 정지. 위치 저장(RESUMABLE 키만).
 * - playSfx(key): WebAudio 로 재생(같은 소리 90ms 연타 제한).
 * - 음소거는 localStorage 에 유지, 탭이 숨겨지면 BGM 정지.
 * - 음량·음원 경로는 public/data/audio.json (어드민).
 * 브라우저는 첫 사용자 입력 전 재생을 막으므로, 호출 실패는 조용히 무시.
 */

export type BgmKey =
  | 'start_ending'
  | 'bus'
  | 'airplane'
  | 'finland'
  | 'canada'
  | 'dubai'
  | 'egypt'
  | 'quiz-background'
  | 'mole_game'
  | 'pang'
  | 'diff'
  | 'rock';

export type SfxKey =
  | 'success' | 'correct' | 'error'
  | 'whack_good' | 'whack_bad'
  | 'item_good' | 'item_bad'
  | 'shoot' | 'wrong' | 'fanfare';

/** public/data/audio.json 과 같은 모양. 어드민에서 편집. 불러오기 실패 시 이 기본값을 쓴다. */
export interface AudioConfig {
  bgmVolume: number;
  sfxVolume: number;
  bgm: Record<BgmKey, string>;
  sfx: Record<SfxKey, string>;
}

export const DEFAULT_AUDIO_CONFIG: AudioConfig = {
  bgmVolume: 0.45,
  sfxVolume: 0.7,
  bgm: {
    start_ending:      '/assets/audio/start_ending.mp3',
    bus:               '/assets/audio/bus.mp3',
    airplane:          '/assets/audio/airplane.mp3',
    finland:           '/assets/audio/finland.mp3',
    canada:            '/assets/audio/canada.mp3',
    dubai:             '/assets/audio/dubai.mp3',
    egypt:             '/assets/audio/egypt.mp3',
    'quiz-background': '/assets/audio/quiz-background.mp3',
    mole_game:         '/assets/audio/mole_game.mp3',
    pang:              '/assets/audio/pang.m4a',
    diff:              '/assets/audio/diff.mp3',
    rock:              '/assets/audio/rock.mp3',
  },
  sfx: {
    success:    '/assets/audio/success.mp3',
    correct:    '/assets/audio/correct.mp3',
    error:      '/assets/audio/error.mp3',
    whack_good: '/assets/audio/balloon_pop.mp3',
    whack_bad:  '/assets/audio/error.mp3',
    item_good:  '/assets/audio/book_pickup.mp3',
    item_bad:   '/assets/audio/error.mp3',
    shoot:      '/assets/audio/laser.mp3',
    wrong:      '/assets/audio/error.mp3',
    fanfare:    '/assets/audio/770801_fanfare.mp3',
  },
};

/** 불러온 json 을 기본값 위에 덮어 쓴다(잘못된 값은 무시). */
export function mergeAudioConfig(raw: unknown): AudioConfig {
  const d = DEFAULT_AUDIO_CONFIG;
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof AudioConfig, unknown>>;
  const vol = (v: unknown, fallback: number) =>
    typeof v === 'number' && v >= 0 && v <= 1 ? v : fallback;
  const paths = <K extends string>(base: Record<K, string>, v: unknown): Record<K, string> => {
    const out = { ...base };
    if (v && typeof v === 'object') {
      for (const k of Object.keys(base) as K[]) {
        const p = (v as Record<string, unknown>)[k];
        if (typeof p === 'string' && p) out[k] = p;
      }
    }
    return out;
  };
  return {
    bgmVolume: vol(r.bgmVolume, d.bgmVolume),
    sfxVolume: vol(r.sfxVolume, d.sfxVolume),
    bgm: paths(d.bgm, r.bgm),
    sfx: paths(d.sfx, r.sfx),
  };
}

let config: AudioConfig = DEFAULT_AUDIO_CONFIG;

// 시작 위치 오프셋 (초). 매번 이 지점부터 재생 시작 (lastPos 없을 때).
const START_OFFSET: Partial<Record<BgmKey, number>> = {
  bus: 5,
};

// 재개 가능 키 — stopBgm 시 currentTime 저장, 다음 재생 시 그 지점부터.
const RESUMABLE: Partial<Record<BgmKey, true>> = {
  finland: true,
  canada:  true,
  dubai:   true,
  egypt:   true,
};


const MUTE_KEY = 'snug_thermo_muted';
const SFX_MIN_GAP_MS = 90;

const lastPos: Partial<Record<BgmKey, number>> = {};
let currentBgm: { key: BgmKey; el: HTMLAudioElement } | null = null;

// ───────────── 음소거 (localStorage 유지) ─────────────
let muted = false;
let tabHidden = false;
const muteListeners = new Set<() => void>();

function readMuted(): boolean {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}

export function isMuted() { return muted; }

export function subscribeMute(cb: () => void) {
  muteListeners.add(cb);
  return () => { muteListeners.delete(cb); };
}

function canPlay() { return !muted && !tabHidden; }

export function setMuted(next: boolean) {
  muted = next;
  try { localStorage.setItem(MUTE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
  syncBgm();
  muteListeners.forEach(cb => cb());
}

function syncBgm() {
  if (!currentBgm) return;
  if (canPlay()) safePlay(currentBgm.el);
  else currentBgm.el.pause();
}

// ───────────── BGM ─────────────
function safePlay(el: HTMLAudioElement) {
  const p = el.play();
  if (p && typeof (p as Promise<void>).catch === 'function') {
    (p as Promise<void>).catch(() => { /* autoplay blocked — silent */ });
  }
}

function applyStartTime(el: HTMLAudioElement, key: BgmKey) {
  const resumed = RESUMABLE[key] ? lastPos[key] : undefined;
  const offset = resumed ?? START_OFFSET[key] ?? 0;
  if (offset <= 0) return;
  const set = () => {
    try { el.currentTime = offset; } catch { /* ignore */ }
  };
  if (el.readyState >= 1) set();
  else el.addEventListener('loadedmetadata', set, { once: true });
}

export function playBgm(key: BgmKey, opts: { loop?: boolean } = {}) {
  if (typeof window === 'undefined') return;

  if (currentBgm && currentBgm.key === key) {
    // 같은 키 — autoplay 차단으로 paused 상태면 재시도 (사용자 첫 제스처 직후 unlock)
    if (currentBgm.el.paused && canPlay()) safePlay(currentBgm.el);
    return;
  }

  if (currentBgm) {
    if (RESUMABLE[currentBgm.key]) {
      lastPos[currentBgm.key] = currentBgm.el.currentTime;
    }
    currentBgm.el.pause();
    currentBgm = null;
  }

  const el = new Audio(config.bgm[key]);
  el.loop = opts.loop !== false;
  el.volume = config.bgmVolume;
  applyStartTime(el, key);
  currentBgm = { key, el };
  if (canPlay()) safePlay(el);
}

export function stopBgm() {
  if (!currentBgm) return;
  if (RESUMABLE[currentBgm.key]) {
    lastPos[currentBgm.key] = currentBgm.el.currentTime;
  }
  currentBgm.el.pause();
  currentBgm = null;
}

// ───────────── 효과음 (WebAudio) ─────────────
// 아이폰 Safari 는 HTMLAudio 음량 조절이 안 되므로 AudioContext 로 재생한다.
let ctx: AudioContext | null = null;
const buffers = new Map<string, Promise<AudioBuffer>>();
const lastSfxAt = new Map<SfxKey, number>();

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

function loadBuffer(c: AudioContext, path: string): Promise<AudioBuffer> {
  let p = buffers.get(path);
  if (!p) {
    p = fetch(path).then(r => r.arrayBuffer()).then(b => c.decodeAudioData(b));
    p.catch(() => buffers.delete(path));
    buffers.set(path, p);
  }
  return p;
}

/** 같은 효과음이 간격 안에 다시 요청되면 true(막아야 함). 허용되면 시각을 기록한다. */
export function sfxThrottled(key: SfxKey, now: number, gapMs = SFX_MIN_GAP_MS): boolean {
  const last = lastSfxAt.get(key);
  if (last !== undefined && now - last < gapMs) return true;
  lastSfxAt.set(key, now);
  return false;
}

export function playSfx(key: SfxKey) {
  if (typeof window === 'undefined' || muted) return;
  if (sfxThrottled(key, performance.now())) return;
  const path = config.sfx[key];
  const c = getCtx();
  if (!c) {
    const el = new Audio(path);
    el.volume = config.sfxVolume;
    safePlay(el);
    return;
  }
  if (c.state === 'suspended') c.resume().catch(() => { /* ignore */ });
  loadBuffer(c, path).then(buf => {
    const src = c.createBufferSource();
    const gain = c.createGain();
    gain.gain.value = config.sfxVolume;
    src.buffer = buf;
    src.connect(gain).connect(c.destination);
    src.start();
  }).catch(() => { /* decode/network failure — silent */ });
}

/** 첫 사용자 제스처 직후 호출 — AudioContext 를 풀고, autoplay 차단으로 paused 된 BGM 재시도. */
export function unlockAudio() {
  if (typeof window === 'undefined') return;
  const c = getCtx();
  if (c?.state === 'suspended') c.resume().catch(() => { /* ignore */ });
  if (c) Object.values(config.sfx).forEach(p => { loadBuffer(c, p).catch(() => { /* ignore */ }); });
  if (currentBgm && currentBgm.el.paused && canPlay()) safePlay(currentBgm.el);
}

// ───────────── 초기화 (브라우저 한 번) ─────────────
if (typeof window !== 'undefined') {
  muted = readMuted();
  document.addEventListener('visibilitychange', () => {
    tabHidden = document.hidden;
    syncBgm();
  });
  fetch('/data/audio.json')
    .then(r => (r.ok ? r.json() : null))
    .then(d => {
      config = mergeAudioConfig(d);
      if (currentBgm) currentBgm.el.volume = config.bgmVolume;
    })
    .catch(() => { /* 기본값 사용 */ });
}
