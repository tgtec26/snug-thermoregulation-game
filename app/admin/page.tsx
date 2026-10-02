'use client';

import { useEffect, useState, useRef } from 'react';
import type {
  SceneNodes, WorldmapPaths, WorldmapRouteKey, KoreaBusPath,
  CountryMapPaths, CountryMapPathKey, CountryMapKey,
  QuizQuestion,
} from '@/game/types';
import { AudioAdminSection } from '@/components/AudioAdminSection';
import { bezierSvgPath } from '@/game/utils/bezier';
import {
  type TeacherLine,
  type TeacherSize,
  TEACHER_SIZES,
  TEACHER_SIZE_LABEL,
  normalizeTeacherData,
} from '@/game/data/teacherLines';

// ─── 경로 편집 ────────────────────────────────────────────────────────────────
// 모든 단일 화면(classroom·airports·outdoor·indoor·ending)은 오버레이 기반 이벤트로 진행 →
// 별도 노드 편집 불필요. 어드민은 경로(이동) 관련 데이터만 다룬다.

const WORLDMAP_ROUTES: { key: WorldmapRouteKey; label: string }[] = [
  { key: 'korea_finland',  label: '한국 → 핀란드' },
  { key: 'korea_canada',   label: '한국 → 캐나다' },
  { key: 'finland_dubai',  label: '핀란드 → 두바이' },
  { key: 'finland_egypt',  label: '핀란드 → 이집트' },
  { key: 'canada_dubai',   label: '캐나다 → 두바이' },
  { key: 'canada_egypt',   label: '캐나다 → 이집트' },
  { key: 'dubai_korea',    label: '두바이 → 한국' },
  { key: 'egypt_korea',    label: '이집트 → 한국' },
];

const ROUTE_ENDPOINTS: Record<WorldmapRouteKey, { from: string; to: string }> = {
  korea_finland:  { from: 'korea',   to: 'finland' },
  korea_canada:   { from: 'korea',   to: 'canada'  },
  finland_dubai:  { from: 'finland', to: 'dubai'   },
  finland_egypt:  { from: 'finland', to: 'egypt'   },
  canada_dubai:   { from: 'canada',  to: 'dubai'   },
  canada_egypt:   { from: 'canada',  to: 'egypt'   },
  dubai_korea:    { from: 'dubai',   to: 'korea'   },
  egypt_korea:    { from: 'egypt',   to: 'korea'   },
};

// ─── 국가 맵 편집 ─────────────────────────────────────────────────────────────

const COUNTRY_KEYS: CountryMapKey[] = ['finland', 'canada', 'dubai', 'egypt'];
const COUNTRY_LABEL: Record<CountryMapKey, string> = {
  finland: '🇫🇮 핀란드 맵',
  canada:  '🇨🇦 캐나다 맵',
  dubai:   '🇦🇪 두바이 맵',
  egypt:   '🇪🇬 이집트 맵',
};
const COUNTRY_BG: Record<CountryMapKey, string> = {
  finland: '/assets/backgrounds/Finland_map.png',
  canada:  '/assets/backgrounds/canada_map.png',
  dubai:   '/assets/backgrounds/dubai_map.png',
  egypt:   '/assets/backgrounds/egypt_map.png',
};
const COUNTRY_ROUTES: { key: CountryMapPathKey; label: string; color: string; from: 'airport'|'outdoor'|'indoor'; to: 'airport'|'outdoor'|'indoor' }[] = [
  { key: 'airport_outdoor', label: '공항→야외', color: '#22c55e', from: 'airport', to: 'outdoor' },
  { key: 'outdoor_indoor',  label: '야외→실내', color: '#f97316', from: 'outdoor', to: 'indoor'  },
  { key: 'indoor_airport',  label: '실내→공항', color: '#a855f7', from: 'indoor',  to: 'airport' },
];
const DEST_COLOR: Record<'airport'|'outdoor'|'indoor', string> = {
  airport: '#3b82f6',  // 파랑
  outdoor: '#84cc16',  // 라임
  indoor:  '#ec4899',  // 핑크
};
const DEST_EMOJI: Record<'airport'|'outdoor'|'indoor', string> = {
  airport: '✈️',
  outdoor: '🌄',
  indoor:  '🏠',
};

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

type PathMode = 'worldmap' | 'korea' | 'countrymap';

export default function AdminPage() {
  // ── 경로 편집 상태 ──
  const [pathMode, setPathMode]         = useState<PathMode>('worldmap');
  const [selectedRoute, setSelectedRoute] = useState<WorldmapRouteKey>('korea_finland');
  const [worldmapPaths, setWorldmapPaths] = useState<WorldmapPaths | null>(null);
  const [worldmapNodes, setWorldmapNodes] = useState<SceneNodes | null>(null);
  const [koreaPaths, setKoreaPaths]       = useState<KoreaBusPath | null>(null);
  const [pathDrag, setPathDrag]           = useState<string | null>(null);
  const pathWrapRef                       = useRef<HTMLDivElement>(null);
  const [pathSaved, setPathSaved]         = useState(false);

  // ── 국가 맵 편집 상태 ──
  const [country, setCountry]             = useState<CountryMapKey>('finland');
  const [countryNodes, setCountryNodes]   = useState<SceneNodes | null>(null);
  const [countryPaths, setCountryPaths]   = useState<CountryMapPaths | null>(null);

  // ── 선생님 멘트 편집 상태 ──
  // 키별 멘트 묶음 (예: { intro: [...], rps_cold_intro: [...] })
  const [teacherData, setTeacherData]     = useState<Record<string, TeacherLine[]>>({});
  const [teacherSaved, setTeacherSaved]   = useState(false);

  // ── 공항 퀴즈 편집 상태 ──
  const [quizPool, setQuizPool]           = useState<QuizQuestion[] | null>(null);
  const [quizSaved, setQuizSaved]         = useState(false);

  // ── 사우나 두더지 구멍 편집 상태 ──
  type SaunaHoles = {
    imageSize: { w: number; h: number };
    cellSize: { w: number; h: number };
    holes: { x: number; y: number }[];
  };
  const [moleHoles, setMoleHoles]   = useState<SaunaHoles | null>(null);
  const [moleDrag, setMoleDrag]     = useState<number | null>(null);
  const [moleSaved, setMoleSaved]   = useState(false);
  const moleWrapRef                 = useRef<HTMLDivElement>(null);

  // ── 다른 그림 찾기 정답 영역 편집 상태 ──
  type DiffPoint = { x: number; y: number };
  type DiffTarget = { id: string; label: string; r: number; left: DiffPoint; right: DiffPoint };
  type DiffTargets = {
    imageSize: { w: number; h: number };
    targets: DiffTarget[];
  };
  type DiffVariant = 'ski' | 'catacomb';
  const [diffVariant, setDiffVariant]   = useState<DiffVariant>('ski');
  const [diffDataMap, setDiffDataMap]   = useState<Record<DiffVariant, DiffTargets | null>>({ ski: null, catacomb: null });
  const [diffDrag, setDiffDrag]         = useState<{ i: number; side: 'left' | 'right' } | null>(null);
  const [diffSaved, setDiffSaved]       = useState(false);
  const diffWrapRef                     = useRef<HTMLDivElement>(null);
  const diffData = diffDataMap[diffVariant];
  const setDiffData = (next: DiffTargets) =>
    setDiffDataMap(prev => ({ ...prev, [diffVariant]: next }));
  const DIFF_VARIANT_BG: Record<DiffVariant, string> = {
    ski:      '/assets/backgrounds/diff_img_ski.png',
    catacomb: '/assets/backgrounds/diff_img_catacomb.png',
  };
  const DIFF_VARIANT_LABEL: Record<DiffVariant, string> = {
    ski:      '🇦🇪 두바이 실내 스키장',
    catacomb: '🇪🇬 이집트 카타콤',
  };

  // 경로 데이터 로드
  useEffect(() => {
    fetch('/data/paths-worldmap.json').then(r => r.json()).then(setWorldmapPaths);
    fetch('/data/nodes-worldmap.json').then(r => r.json()).then(setWorldmapNodes);
    fetch('/data/paths-korea.json').then(r => r.json()).then(setKoreaPaths);
    fetch('/data/teacher-intro.json')
      .then(r => r.json())
      .then((d: unknown) => setTeacherData(normalizeTeacherData(d)));
    fetch(`/data/quiz-pool.json?t=${Date.now()}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: unknown) => {
        if (Array.isArray(d)) setQuizPool(d as QuizQuestion[]);
      })
      .catch(() => { /* ignore */ });
    fetch(`/data/sauna-mole-holes.json?t=${Date.now()}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: SaunaHoles | null) => { if (d) setMoleHoles(d); })
      .catch(() => { /* ignore */ });
    (['ski', 'catacomb'] as DiffVariant[]).forEach(v => {
      fetch(`/data/spot-difference-targets-${v}.json?t=${Date.now()}`)
        .then(r => r.ok ? r.json() : null)
        .then((d: DiffTargets | null) => {
          if (d) setDiffDataMap(prev => ({ ...prev, [v]: d }));
        })
        .catch(() => { /* ignore */ });
    });
  }, []);

  // 국가 맵 데이터 로드 (국가 변경 시마다)
  useEffect(() => {
    if (pathMode !== 'countrymap') return;
    const scene = `country_${country}_map`;
    fetch(`/data/nodes-${scene}.json`).then(r => r.json()).then(setCountryNodes);
    fetch(`/data/paths-${scene}.json`).then(r => r.json()).then(setCountryPaths);
  }, [pathMode, country]);

  // ── 경로 편집 핸들러 ──
  const onPathMouseMove = (e: React.MouseEvent) => {
    if (!pathDrag || !pathWrapRef.current) return;
    const rect = pathWrapRef.current.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left) * (1280 / rect.width));
    const y = Math.round((e.clientY - rect.top)  * (800  / rect.height));

    if (pathMode === 'worldmap' && worldmapPaths) {
      if (pathDrag.startsWith('node:') && worldmapNodes) {
        const id = pathDrag.slice(5);
        setWorldmapNodes({
          ...worldmapNodes,
          nodes: worldmapNodes.nodes.map(n => n.id === id ? { ...n, x, y } : n),
        });
      } else {
        const cur = worldmapPaths[selectedRoute];
        setWorldmapPaths({
          ...worldmapPaths,
          [selectedRoute]: {
            cp1: pathDrag === 'cp1' ? { x, y } : cur.cp1,
            cp2: pathDrag === 'cp2' ? { x, y } : cur.cp2,
          },
        });
      }
    } else if (pathMode === 'korea' && koreaPaths) {
      setKoreaPaths({ ...koreaPaths, [pathDrag]: { x, y } });
    } else if (pathMode === 'countrymap') {
      if (pathDrag.startsWith('node:') && countryNodes) {
        const id = pathDrag.slice(5);
        setCountryNodes({
          ...countryNodes,
          nodes: countryNodes.nodes.map(n => n.id === id ? { ...n, x, y } : n),
        });
      } else if (pathDrag.startsWith('wp:') && countryPaths) {
        const [, route, idxStr] = pathDrag.split(':');
        const routeKey = route as CountryMapPathKey;
        const i = parseInt(idxStr, 10);
        setCountryPaths({
          ...countryPaths,
          [routeKey]: {
            waypoints: countryPaths[routeKey].waypoints.map((w, j) => j === i ? { x, y } : w),
          },
        });
      }
    }
  };

  const addWaypoint = (route: CountryMapPathKey) => {
    if (!countryPaths || !countryNodes) return;
    const cfg = COUNTRY_ROUTES.find(r => r.key === route)!;
    const fromN = countryNodes.nodes.find(n => n.id === cfg.from);
    const toN   = countryNodes.nodes.find(n => n.id === cfg.to);
    if (!fromN || !toN) return;
    const wps = countryPaths[route].waypoints;
    const lastPt = wps.length > 0 ? wps[wps.length - 1] : { x: fromN.x, y: fromN.y };
    const newWp = { x: Math.round((lastPt.x + toN.x) / 2), y: Math.round((lastPt.y + toN.y) / 2) };
    setCountryPaths({
      ...countryPaths,
      [route]: { waypoints: [...wps, newWp] },
    });
  };

  const removeWaypoint = (route: CountryMapPathKey, i: number) => {
    if (!countryPaths) return;
    setCountryPaths({
      ...countryPaths,
      [route]: { waypoints: countryPaths[route].waypoints.filter((_, j) => j !== i) },
    });
  };

  // ── 선생님 멘트 편집 핸들러 ──
  const updateTeacherText = (key: string, i: number, text: string) => {
    setTeacherData(prev => ({
      ...prev,
      [key]: (prev[key] ?? []).map((l, j) => (j === i ? { ...l, text } : l)),
    }));
  };
  const updateTeacherSize = (key: string, i: number, size: TeacherSize) => {
    setTeacherData(prev => ({
      ...prev,
      [key]: (prev[key] ?? []).map((l, j) => (j === i ? { ...l, size } : l)),
    }));
  };
  const addTeacherLine = (key: string) =>
    setTeacherData(prev => ({ ...prev, [key]: [...(prev[key] ?? []), { text: '' }] }));
  const removeTeacherLine = (key: string, i: number) =>
    setTeacherData(prev => ({
      ...prev,
      [key]: (prev[key] ?? []).filter((_, j) => j !== i),
    }));
  const moveTeacherLine = (key: string, i: number, dir: -1 | 1) => {
    setTeacherData(prev => {
      const arr = prev[key] ?? [];
      const j = i + dir;
      if (j < 0 || j >= arr.length) return prev;
      const next = [...arr];
      [next[i], next[j]] = [next[j], next[i]];
      return { ...prev, [key]: next };
    });
  };
  // ── 국가 맵 노드 라벨 편집 핸들러 ──
  const updateCountryNodeLabel = (id: string, label: string) =>
    setCountryNodes(prev => prev ? {
      ...prev,
      nodes: prev.nodes.map(n => n.id === id ? { ...n, label } : n),
    } : null);

  // ── 공항 퀴즈 편집 핸들러 ──
  const updateQuizField = <K extends keyof QuizQuestion>(i: number, field: K, value: QuizQuestion[K]) =>
    setQuizPool(prev => prev?.map((q, j) => j === i ? { ...q, [field]: value } : q) ?? null);
  const updateQuizChoice = (i: number, ci: number, val: string) =>
    setQuizPool(prev => prev?.map((q, j) =>
      j === i ? { ...q, choices: q.choices.map((c, k) => k === ci ? val : c) } : q
    ) ?? null);
  const saveQuizPool = async () => {
    if (!quizPool) return;
    const r = await fetch('/api/quiz-pool', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: quizPool }),
    });
    if (r.ok) { setQuizSaved(true); setTimeout(() => setQuizSaved(false), 1500); }
    else alert('저장 실패 (공항 퀴즈): ' + await r.text());
  };

  // ── 사우나 두더지 구멍 편집 핸들러 ──
  const onMoleMouseMove = (e: React.MouseEvent) => {
    if (moleDrag === null || !moleWrapRef.current || !moleHoles) return;
    const rect = moleWrapRef.current.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left) * (moleHoles.imageSize.w / rect.width));
    const y = Math.round((e.clientY - rect.top)  * (moleHoles.imageSize.h / rect.height));
    setMoleHoles({
      ...moleHoles,
      holes: moleHoles.holes.map((h, i) => i === moleDrag ? { x, y } : h),
    });
  };
  const updateMoleCell = (axis: 'w' | 'h', value: number) => {
    if (!moleHoles) return;
    setMoleHoles({ ...moleHoles, cellSize: { ...moleHoles.cellSize, [axis]: value } });
  };
  const saveMoleHoles = async () => {
    if (!moleHoles) return;
    const r = await fetch('/api/sauna-mole-holes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: moleHoles }),
    });
    if (r.ok) { setMoleSaved(true); setTimeout(() => setMoleSaved(false), 1500); }
    else alert('저장 실패 (사우나 두더지): ' + await r.text());
  };

  // ── 다른 그림 찾기 정답 영역 핸들러 ──
  const onDiffMouseMove = (e: React.MouseEvent) => {
    if (diffDrag === null || !diffWrapRef.current || !diffData) return;
    const rect = diffWrapRef.current.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left) * (diffData.imageSize.w / rect.width));
    const y = Math.round((e.clientY - rect.top)  * (diffData.imageSize.h / rect.height));
    setDiffData({
      ...diffData,
      targets: diffData.targets.map((t, i) =>
        i === diffDrag.i ? { ...t, [diffDrag.side]: { x, y } } : t
      ),
    });
  };
  const updateDiffField = <K extends keyof DiffTarget>(i: number, field: K, value: DiffTarget[K]) => {
    if (!diffData) return;
    setDiffData({
      ...diffData,
      targets: diffData.targets.map((t, j) => j === i ? { ...t, [field]: value } : t),
    });
  };
  const saveDiffTargets = async () => {
    if (!diffData) return;
    const r = await fetch('/api/spot-difference-targets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: diffData, variant: diffVariant }),
    });
    if (r.ok) { setDiffSaved(true); setTimeout(() => setDiffSaved(false), 1500); }
    else alert('저장 실패 (다른 그림 찾기): ' + await r.text());
  };

  const saveTeacherLines = async () => {
    const r = await fetch('/api/teacher-intro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: teacherData }),
    });
    if (r.ok) { setTeacherSaved(true); setTimeout(() => setTeacherSaved(false), 1500); }
    else alert('저장 실패 (선생님 멘트)');
  };

  // 편집 가능한 멘트 그룹 정의 (키 → 라벨)
  const TEACHER_GROUPS: { key: string; label: string; hint?: string }[] = [
    { key: 'intro',           label: '🏫 학급 회의 도입 멘트', hint: '교실 첫 화면에 등장' },
    { key: 'rps_cold_intro',  label: '❄️ 추운 나라 RPS 진입 멘트', hint: '추운 나라 선택 직후. {playerName} {와과} 토큰 사용 가능' },
    { key: 'rps_cold_result', label: '🏁 추운 나라 RPS 결과 멘트', hint: 'RPS 끝난 직후. {winnerName} {이가} {winnerCountry} 토큰 사용 가능' },
    { key: 'rps_hot_result',  label: '🔥 더운 나라 RPS 결과 멘트', hint: '더운 나라 RPS 끝난 직후. 같은 토큰 사용' },
    // 국가 도착 인트로 — 야외/실내 미니게임 직전 선생님 설명 (마지막에 춥다/덥다 힌트)
    { key: 'finland_outdoor', label: '🇫🇮 핀란드 야외 (라플란드 시내, -15℃)', hint: '도착 시 미니게임 직전' },
    { key: 'finland_indoor',  label: '🇫🇮 핀란드 실내 (핀란드식 사우나, +85℃)', hint: '도착 시 미니게임 직전' },
    { key: 'canada_outdoor',  label: '🇨🇦 캐나다 야외 (옐로나이프 호숫가, -30℃)', hint: '도착 시 미니게임 직전' },
    { key: 'canada_indoor',   label: '🇨🇦 캐나다 실내 (노천 핫스프링, +38℃)', hint: '도착 시 미니게임 직전' },
    { key: 'dubai_outdoor',   label: '🇦🇪 두바이 야외 (사막, +45℃)', hint: '도착 시 미니게임 직전' },
    { key: 'dubai_indoor',    label: '🇦🇪 두바이 실내 (스키두바이, -3℃)', hint: '도착 시 미니게임 직전' },
    { key: 'egypt_outdoor',   label: '🇪🇬 이집트 야외 (기자 피라미드, +40℃)', hint: '도착 시 미니게임 직전' },
    { key: 'egypt_indoor',    label: '🇪🇬 이집트 실내 (알렉산드리아 카타콤, 서늘)', hint: '도착 시 미니게임 직전' },
  ];

  const savePaths = async () => {
    if (pathMode === 'countrymap') {
      if (!countryNodes || !countryPaths) return;
      const scene = `country_${country}_map`;
      const [r1, r2] = await Promise.all([
        fetch('/api/nodes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scene, payload: countryNodes }),
        }),
        fetch('/api/paths', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pathType: scene, payload: countryPaths }),
        }),
      ]);
      if (r1.ok && r2.ok) { setPathSaved(true); setTimeout(() => setPathSaved(false), 1500); }
      else alert('저장 실패 (국가 맵)');
      return;
    }

    if (pathMode === 'worldmap') {
      if (!worldmapPaths || !worldmapNodes) return;
      const [r1, r2] = await Promise.all([
        fetch('/api/paths', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pathType: 'worldmap', payload: worldmapPaths }),
        }),
        fetch('/api/nodes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scene: 'worldmap', payload: worldmapNodes }),
        }),
      ]);
      if (r1.ok && r2.ok) { setPathSaved(true); setTimeout(() => setPathSaved(false), 1500); }
      else alert('저장 실패 (worldmap)');
      return;
    }

    // korea
    if (!koreaPaths) return;
    const res = await fetch('/api/paths', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pathType: 'korea', payload: koreaPaths }),
    });
    if (res.ok) { setPathSaved(true); setTimeout(() => setPathSaved(false), 1500); }
    else alert('저장 실패: ' + await res.text());
  };

  // ── 헬퍼 ──
  const pct = (v: number, max: number) => `${(v / max) * 100}%`;

  const getWorldmapEndpoints = () => {
    if (!worldmapNodes || !worldmapPaths) return null;
    const ep = ROUTE_ENDPOINTS[selectedRoute];
    const p0 = worldmapNodes.nodes.find(n => n.id === ep.from);
    const p1 = worldmapNodes.nodes.find(n => n.id === ep.to);
    const cps = worldmapPaths[selectedRoute];
    if (!p0 || !p1) return null;
    return { p0, p1, ...cps };
  };

  // ── 렌더 ─────────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-slate-900 text-white p-4 flex flex-col gap-4">
      <header className="flex items-center gap-2">
        <h1 className="text-xl font-bold mr-2">Admin · 경로 편집</h1>
        <span className="text-xs text-slate-400">단일 화면(교실·공항·실내외·결말)은 오버레이 이벤트로 진행 — 노드 편집 불필요</span>
      </header>

      {/* ── 경로 편집 ──────────────────────────────────────────────────────── */}
      <>
          <div className="flex items-center gap-3 flex-wrap">
            {(['worldmap', 'korea', 'countrymap'] as PathMode[]).map(pm => (
              <button
                key={pm}
                onClick={() => setPathMode(pm)}
                className={`px-3 py-1 rounded text-sm ${pathMode === pm ? 'bg-indigo-600' : 'bg-slate-700 hover:bg-slate-600'}`}
              >
                {pm === 'worldmap' ? '세계지도 비행 경로' : pm === 'korea' ? '버스 경로(한국)' : '국가 맵 (맨해튼 경로)'}
              </button>
            ))}
            {pathMode === 'worldmap' && (
              <select
                value={selectedRoute}
                onChange={e => setSelectedRoute(e.target.value as WorldmapRouteKey)}
                className="bg-slate-700 border border-slate-600 rounded px-2 py-1"
              >
                {WORLDMAP_ROUTES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
            )}
            {pathMode === 'countrymap' && (
              <select
                value={country}
                onChange={e => setCountry(e.target.value as CountryMapKey)}
                className="bg-slate-700 border border-slate-600 rounded px-2 py-1"
              >
                {COUNTRY_KEYS.map(c => <option key={c} value={c}>{COUNTRY_LABEL[c]}</option>)}
              </select>
            )}
            <button onClick={savePaths} className="bg-sky-600 hover:bg-sky-700 px-3 py-1 rounded ml-auto">저장</button>
            {pathSaved && <span className="text-green-400">✅ 저장 완료</span>}
          </div>

          {/* 경로별 컨트롤 패널 (countrymap 전용) */}
          {pathMode === 'countrymap' && countryPaths && (
            <div className="flex items-center gap-3 flex-wrap">
              {COUNTRY_ROUTES.map(r => (
                <div key={r.key} className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded px-3 py-1.5">
                  <span className="text-sm font-semibold" style={{ color: r.color }}>{r.label}</span>
                  <span className="text-xs text-slate-400">웨이포인트 {countryPaths[r.key].waypoints.length}개</span>
                  <button
                    onClick={() => addWaypoint(r.key)}
                    className="bg-emerald-700 hover:bg-emerald-600 text-xs px-2 py-0.5 rounded"
                  >
                    + WP
                  </button>
                  {countryPaths[r.key].waypoints.length > 0 && (
                    <button
                      onClick={() => removeWaypoint(r.key, countryPaths[r.key].waypoints.length - 1)}
                      className="bg-rose-700 hover:bg-rose-600 text-xs px-2 py-0.5 rounded"
                    >
                      − 마지막
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 노드 라벨 편집 (countrymap 전용) — 게시판 안내 메시지 "OO으로 이동하세요"의 OO에 들어가는 텍스트 */}
          {pathMode === 'countrymap' && countryNodes && (
            <div className="flex flex-col gap-1 bg-slate-800 border border-slate-700 rounded p-3 max-w-3xl">
              <div className="flex items-baseline gap-2 mb-1">
                <h3 className="text-sm font-semibold">🪧 게시판 안내 라벨</h3>
                <span className="text-xs text-slate-400">
                  게임 중앙 게시판에 "<span className="text-slate-200">○○ 이동하세요</span>" 형태로 표시됨
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                {(['airport', 'outdoor', 'indoor'] as const).map(id => {
                  const node = countryNodes.nodes.find(n => n.id === id);
                  if (!node) return null;
                  return (
                    <label key={id} className="flex items-center gap-2 text-sm">
                      <span className="w-16 text-slate-400 shrink-0">
                        {DEST_EMOJI[id]} {id === 'airport' ? '공항' : id === 'outdoor' ? '야외' : '실내'}
                      </span>
                      <input
                        type="text"
                        value={node.label ?? ''}
                        onChange={e => updateCountryNodeLabel(id, e.target.value)}
                        placeholder="예) 라플란드 시내"
                        className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm"
                      />
                    </label>
                  );
                })}
              </div>
              <span className="text-xs text-slate-500 mt-1">
                💡 저장은 위쪽 "저장" 버튼 (노드+경로 동시 저장)
              </span>
            </div>
          )}

          <div
            ref={pathWrapRef}
            className="relative border border-slate-600 mx-auto select-none"
            style={{ width: '100%', maxWidth: 1280, aspectRatio: '16 / 10' }}
            onMouseMove={onPathMouseMove}
            onMouseUp={() => setPathDrag(null)}
            onMouseLeave={() => setPathDrag(null)}
          >
            {/* 배경 */}
            <img
              src={
                pathMode === 'worldmap'   ? '/assets/backgrounds/world_map.png'
              : pathMode === 'korea'      ? '/assets/backgrounds/school_to_airport.png'
              :                             COUNTRY_BG[country]
              }
              alt=""
              className="absolute inset-0 w-full h-full object-fill"
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
            <div className="absolute inset-0 bg-slate-200/30" />

            {/* ── 세계지도 경로 ── */}
            {pathMode === 'worldmap' && (() => {
              const ep = getWorldmapEndpoints();
              if (!ep) return null;
              const { p0, p1, cp1, cp2 } = ep;
              const svgPath = bezierSvgPath(p0.x, p0.y, cp1.x, cp1.y, cp2.x, cp2.y, p1.x, p1.y);

              return (
                <>
                  {/* SVG 곡선 오버레이 */}
                  <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 1280 800" preserveAspectRatio="none">
                    {/* 모든 경로 회색으로 표시 */}
                    {worldmapPaths && WORLDMAP_ROUTES.map(r => {
                      if (r.key === selectedRoute) return null;
                      const ep2 = ROUTE_ENDPOINTS[r.key];
                      const n0 = worldmapNodes?.nodes.find(n => n.id === ep2.from);
                      const n1 = worldmapNodes?.nodes.find(n => n.id === ep2.to);
                      const c = worldmapPaths[r.key];
                      if (!n0 || !n1) return null;
                      return (
                        <path key={r.key}
                          d={bezierSvgPath(n0.x, n0.y, c.cp1.x, c.cp1.y, c.cp2.x, c.cp2.y, n1.x, n1.y)}
                          stroke="#ffffff44" strokeWidth="1.5" fill="none" strokeDasharray="4 3"
                        />
                      );
                    })}
                    {/* 선택 경로 주황 */}
                    <path d={svgPath} stroke="#ff9900" strokeWidth="2.5" fill="none" strokeDasharray="6 3" />
                    {/* CP 연결선 */}
                    <line x1={p0.x} y1={p0.y} x2={cp1.x} y2={cp1.y} stroke="#ff990066" strokeWidth="1.5" strokeDasharray="3 2" />
                    <line x1={p1.x} y1={p1.y} x2={cp2.x} y2={cp2.y} stroke="#ff990066" strokeWidth="1.5" strokeDasharray="3 2" />
                  </svg>

                  {/* 국가 노드 — 드래그 가능 (마커=wrapper 크기, 라벨은 absolute로 위치 영향 X) */}
                  {worldmapNodes?.nodes.map(n => (
                    <div
                      key={n.id}
                      onMouseDown={e => { e.preventDefault(); setPathDrag(`node:${n.id}`); }}
                      className="absolute w-5 h-5 -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing z-30"
                      style={{ left: pct(n.x, 1280), top: pct(n.y, 800) }}
                    >
                      <div className="w-full h-full rounded-full bg-white border-2 border-sky-400 shadow" />
                      <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 text-[10px] bg-black/70 text-white px-1 rounded whitespace-nowrap pointer-events-none">
                        {n.label ?? n.id} ({n.x},{n.y})
                      </div>
                    </div>
                  ))}

                  {/* cp1 드래그 핸들 — wrapper=다이아 크기, 라벨 absolute, z-40 (국가 노드 위) */}
                  <div
                    onMouseDown={e => { e.preventDefault(); setPathDrag('cp1'); }}
                    className="absolute w-5 h-5 -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing z-40"
                    style={{ left: pct(cp1.x, 1280), top: pct(cp1.y, 800) }}
                  >
                    <div className="w-full h-full bg-orange-400 border-2 border-white shadow-lg rotate-45" />
                    <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 text-[10px] bg-black/70 text-white px-1 rounded whitespace-nowrap pointer-events-none">cp1 ({cp1.x},{cp1.y})</div>
                  </div>

                  {/* cp2 드래그 핸들 */}
                  <div
                    onMouseDown={e => { e.preventDefault(); setPathDrag('cp2'); }}
                    className="absolute w-5 h-5 -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing z-40"
                    style={{ left: pct(cp2.x, 1280), top: pct(cp2.y, 800) }}
                  >
                    <div className="w-full h-full bg-yellow-400 border-2 border-white shadow-lg rotate-45" />
                    <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 text-[10px] bg-black/70 text-white px-1 rounded whitespace-nowrap pointer-events-none">cp2 ({cp2.x},{cp2.y})</div>
                  </div>
                </>
              );
            })()}

            {/* ── 버스 경로(한국) ── */}
            {pathMode === 'korea' && koreaPaths && (() => {
              const { school, airport, cp1, cp2 } = koreaPaths;
              const svgPath = bezierSvgPath(school.x, school.y, cp1.x, cp1.y, cp2.x, cp2.y, airport.x, airport.y);

              return (
                <>
                  <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 1280 800" preserveAspectRatio="none">
                    <path d={svgPath} stroke="#22dd88" strokeWidth="2.5" fill="none" strokeDasharray="6 3" />
                    <line x1={school.x}  y1={school.y}  x2={cp1.x} y2={cp1.y} stroke="#22dd8866" strokeWidth="1.5" strokeDasharray="3 2" />
                    <line x1={airport.x} y1={airport.y} x2={cp2.x} y2={cp2.y} stroke="#22dd8866" strokeWidth="1.5" strokeDasharray="3 2" />
                  </svg>

                  {/* school */}
                  <div onMouseDown={e => { e.preventDefault(); setPathDrag('school'); }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing z-10"
                    style={{ left: pct(school.x, 1280), top: pct(school.y, 800) }}>
                    <div className="w-6 h-6 rounded-full bg-blue-400 border-2 border-white shadow-lg" />
                    <div className="text-[10px] bg-black/70 text-white px-1 rounded mt-1 whitespace-nowrap">학교 ({school.x},{school.y})</div>
                  </div>

                  {/* airport */}
                  <div onMouseDown={e => { e.preventDefault(); setPathDrag('airport'); }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing z-10"
                    style={{ left: pct(airport.x, 1280), top: pct(airport.y, 800) }}>
                    <div className="w-6 h-6 rounded-full bg-purple-400 border-2 border-white shadow-lg" />
                    <div className="text-[10px] bg-black/70 text-white px-1 rounded mt-1 whitespace-nowrap">공항 ({airport.x},{airport.y})</div>
                  </div>

                  {/* cp1 */}
                  <div onMouseDown={e => { e.preventDefault(); setPathDrag('cp1'); }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing z-10"
                    style={{ left: pct(cp1.x, 1280), top: pct(cp1.y, 800) }}>
                    <div className="w-5 h-5 bg-orange-400 border-2 border-white shadow-lg rotate-45" />
                    <div className="text-[10px] bg-black/70 text-white px-1 rounded mt-1 whitespace-nowrap">cp1 ({cp1.x},{cp1.y})</div>
                  </div>

                  {/* cp2 */}
                  <div onMouseDown={e => { e.preventDefault(); setPathDrag('cp2'); }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing z-10"
                    style={{ left: pct(cp2.x, 1280), top: pct(cp2.y, 800) }}>
                    <div className="w-5 h-5 bg-yellow-400 border-2 border-white shadow-lg rotate-45" />
                    <div className="text-[10px] bg-black/70 text-white px-1 rounded mt-1 whitespace-nowrap">cp2 ({cp2.x},{cp2.y})</div>
                  </div>
                </>
              );
            })()}

            {/* ── 국가 맵 (맨해튼 경로) ── */}
            {pathMode === 'countrymap' && countryNodes && countryPaths && (() => {
              const destOf = (id: 'airport'|'outdoor'|'indoor') => countryNodes.nodes.find(n => n.id === id);
              return (
                <>
                  {/* SVG 폴리라인 (3개 경로) */}
                  <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 1280 800" preserveAspectRatio="none">
                    {COUNTRY_ROUTES.map(r => {
                      const fromN = destOf(r.from);
                      const toN   = destOf(r.to);
                      if (!fromN || !toN) return null;
                      const pts = [
                        { x: fromN.x, y: fromN.y },
                        ...countryPaths[r.key].waypoints,
                        { x: toN.x, y: toN.y },
                      ];
                      const ptsStr = pts.map(p => `${p.x},${p.y}`).join(' ');
                      return (
                        <g key={r.key}>
                          <polyline points={ptsStr} stroke={r.color} strokeWidth="3" fill="none" strokeDasharray="8 4" strokeLinecap="round" strokeLinejoin="round" />
                          {/* 방향 화살표 (마지막 세그먼트 중간점에) */}
                          {pts.length >= 2 && (() => {
                            const p1 = pts[pts.length - 2];
                            const p2 = pts[pts.length - 1];
                            const mx = (p1.x + p2.x) / 2;
                            const my = (p1.y + p2.y) / 2;
                            const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;
                            return (
                              <polygon
                                points="0,-7 12,0 0,7"
                                fill={r.color}
                                transform={`translate(${mx} ${my}) rotate(${angle})`}
                              />
                            );
                          })()}
                        </g>
                      );
                    })}
                  </svg>

                  {/* 웨이포인트 핸들 (드래그 가능, 작은 다이아) — 마커만 wrapper 크기 결정, 라벨은 absolute */}
                  {COUNTRY_ROUTES.map(r =>
                    countryPaths[r.key].waypoints.map((wp, i) => (
                      <div
                        key={`${r.key}-wp-${i}`}
                        onMouseDown={e => { e.preventDefault(); setPathDrag(`wp:${r.key}:${i}`); }}
                        onContextMenu={e => { e.preventDefault(); removeWaypoint(r.key, i); }}
                        className="absolute w-4 h-4 -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing z-20"
                        style={{ left: pct(wp.x, 1280), top: pct(wp.y, 800) }}
                        title="드래그=이동, 우클릭=삭제"
                      >
                        <div
                          className="w-full h-full border-2 border-white shadow-md rotate-45"
                          style={{ background: r.color }}
                        />
                        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 text-[10px] bg-black/70 text-white px-1 rounded whitespace-nowrap pointer-events-none">
                          {r.label.split('→')[0]}#{i} ({wp.x},{wp.y})
                        </div>
                      </div>
                    ))
                  )}

                  {/* 목적지 노드 3개 — labelSvg 있으면 SVG 버튼, 없으면 색상 원 fallback */}
                  {(['airport', 'outdoor', 'indoor'] as const).map(id => {
                    const n = destOf(id);
                    if (!n) return null;
                    const hasSvg = !!n.labelSvg;
                    return (
                      <div
                        key={id}
                        onMouseDown={e => { e.preventDefault(); setPathDrag(`node:${id}`); }}
                        className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing z-30 ${hasSvg ? '' : 'w-8 h-8'}`}
                        style={{ left: pct(n.x, 1280), top: pct(n.y, 800) }}
                      >
                        {hasSvg ? (
                          <div
                            className="rounded-md bg-white/95 shadow-lg border-2 px-1 py-0.5"
                            style={{ borderColor: DEST_COLOR[id] }}
                          >
                            <img
                              src={n.labelSvg}
                              alt={n.label ?? id}
                              className="block h-8 w-auto pointer-events-none"
                              draggable={false}
                            />
                          </div>
                        ) : (
                          <div
                            className="w-full h-full rounded-full border-2 border-white shadow-lg flex items-center justify-center text-base"
                            style={{ background: DEST_COLOR[id] }}
                          >
                            {DEST_EMOJI[id]}
                          </div>
                        )}
                        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 text-[10px] bg-black/70 text-white px-1 rounded whitespace-nowrap pointer-events-none">
                          {n.label ?? id} ({n.x},{n.y})
                        </div>
                      </div>
                    );
                  })}
                </>
              );
            })()}
          </div>

          <p className="text-sm text-slate-400 mx-auto">
            {pathMode === 'worldmap'
              ? '⚪ 흰 원 = 국가 노드(드래그로 위치 이동), 🔶 다이아몬드(cp1·cp2) = 베지어 제어점 → 저장 시 노드+경로 동시 저장'
            : pathMode === 'korea'
              ? '🔵 파란=학교, 보라=공항 (위치 조정 가능), 🔶 다이아몬드=제어점 → 저장'
            : '✈️ 공항·🌄 야외·🏠 실내 노드 드래그로 위치 조정 / 다이아몬드 = 웨이포인트(드래그 이동, 우클릭 삭제) / + WP 버튼으로 추가 → 저장'}
          </p>
      </>

      {/* ── 선생님 멘트 편집 ─────────────────────────────────────────────── */}
      <section className="border-t border-slate-700 pt-4 mt-4 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold">👩‍🏫 선생님 멘트</h2>
          <span className="text-xs text-slate-400">대화창에 타이핑되는 멘트. 페이지 = 한 대화창. 페이지 내 줄바꿈은 Enter.</span>
          <button
            onClick={saveTeacherLines}
            className="bg-sky-600 hover:bg-sky-700 text-sm px-3 py-1 rounded ml-auto"
          >
            저장 (전체)
          </button>
          {teacherSaved && <span className="text-green-400 text-sm">✅ 저장 완료</span>}
        </div>
        {TEACHER_GROUPS.map(g => {
          const lines = teacherData[g.key] ?? [];
          return (
            <div key={g.key} className="border border-slate-700 rounded-lg p-3 flex flex-col gap-2 max-w-4xl">
              <div className="flex items-center gap-3">
                <h3 className="font-semibold">{g.label}</h3>
                {g.hint && <span className="text-xs text-slate-400">{g.hint}</span>}
                <button
                  onClick={() => addTeacherLine(g.key)}
                  className="bg-emerald-700 hover:bg-emerald-600 text-xs px-2 py-1 rounded ml-auto"
                >
                  + 페이지 추가
                </button>
              </div>
              {lines.length === 0 && (
                <p className="text-slate-500 text-sm italic">멘트가 비어 있습니다. "+ 페이지 추가"로 시작.</p>
              )}
              {lines.map((line, i) => {
                const size: TeacherSize = line.size ?? 'md';
                return (
                <div key={i} className="flex items-start gap-2 bg-slate-800 border border-slate-700 rounded p-2">
                  <div className="flex flex-col items-end gap-1 mt-2 shrink-0">
                    <span className="text-xs text-slate-400 font-mono">{i + 1}</span>
                    <div className="flex gap-0.5" role="radiogroup" aria-label="글자 크기">
                      {TEACHER_SIZES.map(sz => (
                        <button
                          key={sz}
                          type="button"
                          role="radio"
                          aria-checked={size === sz}
                          onClick={() => updateTeacherSize(g.key, i, sz)}
                          className={`text-[10px] px-1.5 py-0.5 rounded border ${
                            size === sz
                              ? 'bg-indigo-500 border-indigo-400 text-white'
                              : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
                          }`}
                          title={`글자 크기: ${TEACHER_SIZE_LABEL[sz]}`}
                        >
                          {TEACHER_SIZE_LABEL[sz]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    value={line.text}
                    onChange={(e) => updateTeacherText(g.key, i, e.target.value)}
                    rows={Math.max(2, (line.text.match(/\n/g)?.length ?? 0) + 1)}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm font-mono resize-y"
                    placeholder="멘트 입력 (Enter로 줄바꿈)"
                  />
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => moveTeacherLine(g.key, i, -1)}
                      disabled={i === 0}
                      className="bg-slate-700 hover:bg-slate-600 disabled:opacity-30 text-xs px-2 py-0.5 rounded"
                      title="위로"
                    >▲</button>
                    <button
                      onClick={() => moveTeacherLine(g.key, i, +1)}
                      disabled={i === lines.length - 1}
                      className="bg-slate-700 hover:bg-slate-600 disabled:opacity-30 text-xs px-2 py-0.5 rounded"
                      title="아래로"
                    >▼</button>
                    <button
                      onClick={() => removeTeacherLine(g.key, i)}
                      className="bg-rose-700 hover:bg-rose-600 text-xs px-2 py-0.5 rounded"
                      title="삭제"
                    >✕</button>
                  </div>
                </div>
              );})}
            </div>
          );
        })}
      </section>

      {/* ── 공항 퀴즈 편집 ─────────────────────────────────────────────── */}
      <section className="border-t border-slate-700 pt-4 mt-4 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold">✈️ 공항 탑승 게이트 퀴즈</h2>
          <span className="text-xs text-slate-400">정답을 맞춰야 비행기표가 발급되는 모달. 문제 추가/삭제는 코드에서.</span>
          <button
            onClick={saveQuizPool}
            disabled={!quizPool}
            className="bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-sm px-3 py-1 rounded ml-auto"
          >
            저장 (전체)
          </button>
          {quizSaved && <span className="text-green-400 text-sm">✅ 저장 완료</span>}
        </div>
        {!quizPool && <p className="text-slate-500 text-sm italic">퀴즈 풀을 로드 중입니다…</p>}
        {quizPool && (() => {
          const CATEGORY_META: Record<QuizQuestion['category'], { label: string; color: string }> = {
            cold_response:    { label: '❄️ 추울 때 반응',  color: 'border-sky-500' },
            hot_response:     { label: '🔥 더울 때 반응',  color: 'border-orange-500' },
            neuro_vs_hormone: { label: '🧠 신경 vs 호르몬', color: 'border-purple-500' },
          };
          const grouped: Record<QuizQuestion['category'], { q: QuizQuestion; i: number }[]> = {
            cold_response: [], hot_response: [], neuro_vs_hormone: [],
          };
          quizPool.forEach((q, i) => grouped[q.category].push({ q, i }));
          return (
            <div className="flex flex-col gap-4 max-w-4xl">
              {(Object.keys(grouped) as QuizQuestion['category'][]).map(cat => (
                <div key={cat} className={`border-l-4 ${CATEGORY_META[cat].color} bg-slate-800/50 rounded p-3 flex flex-col gap-2`}>
                  <h3 className="font-semibold text-sm">{CATEGORY_META[cat].label} <span className="text-slate-400 font-normal">({grouped[cat].length}문제)</span></h3>
                  {grouped[cat].map(({ q, i }) => (
                    <div key={q.id} className="bg-slate-900 border border-slate-700 rounded p-2.5 flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-slate-700 text-slate-300 font-mono px-1.5 py-0.5 rounded">{q.id}</span>
                        <textarea
                          value={q.question}
                          onChange={e => updateQuizField(i, 'question', e.target.value)}
                          rows={Math.max(1, (q.question.match(/\n/g)?.length ?? 0) + 1)}
                          className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm resize-y"
                          placeholder="문제 텍스트"
                        />
                      </div>
                      <div className="flex flex-col gap-1 pl-2">
                        {q.choices.map((c, ci) => (
                          <label key={ci} className="flex items-center gap-2">
                            <input
                              type="radio"
                              name={`ans-${q.id}`}
                              checked={q.answerIndex === ci}
                              onChange={() => updateQuizField(i, 'answerIndex', ci)}
                              className="accent-emerald-500"
                              title="정답으로 설정"
                            />
                            <span className={`text-xs font-mono w-4 ${q.answerIndex === ci ? 'text-emerald-400 font-bold' : 'text-slate-500'}`}>
                              {ci + 1}.
                            </span>
                            <input
                              type="text"
                              value={c}
                              onChange={e => updateQuizChoice(i, ci, e.target.value)}
                              className={`flex-1 bg-slate-800 border rounded px-2 py-1 text-sm ${
                                q.answerIndex === ci ? 'border-emerald-600' : 'border-slate-700'
                              }`}
                              placeholder={`선택지 ${ci + 1}`}
                            />
                          </label>
                        ))}
                      </div>
                      <div className="flex items-start gap-2 pl-2">
                        <span className="text-xs text-emerald-400 font-mono mt-1.5 shrink-0">해설</span>
                        <textarea
                          value={q.explanation}
                          onChange={e => updateQuizField(i, 'explanation', e.target.value)}
                          rows={Math.max(1, (q.explanation.match(/\n/g)?.length ?? 0) + 1)}
                          className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm resize-y"
                          placeholder="정답 시 표시되는 해설"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          );
        })()}
      </section>

      {/* ── 사우나 두더지 구멍 위치 편집 ────────────────────────────────── */}
      <section className="border-t border-slate-700 pt-4 mt-4 flex flex-col gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-lg font-bold">🐹 사우나 두더지 — 구멍 위치</h2>
          <span className="text-xs text-slate-400">배경 위의 6개 핸들을 드래그해 구멍 위치를 맞추세요. 셀 크기는 두더지가 솟구치는 영역.</span>
          {moleHoles && (
            <>
              <label className="text-xs text-slate-300 flex items-center gap-1">
                셀 W
                <input
                  type="number"
                  value={moleHoles.cellSize.w}
                  onChange={e => updateMoleCell('w', Math.max(20, parseInt(e.target.value, 10) || 0))}
                  className="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-0.5 text-sm"
                />
              </label>
              <label className="text-xs text-slate-300 flex items-center gap-1">
                셀 H
                <input
                  type="number"
                  value={moleHoles.cellSize.h}
                  onChange={e => updateMoleCell('h', Math.max(20, parseInt(e.target.value, 10) || 0))}
                  className="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-0.5 text-sm"
                />
              </label>
            </>
          )}
          <button
            onClick={saveMoleHoles}
            disabled={!moleHoles}
            className="bg-sky-600 hover:bg-sky-700 disabled:opacity-40 px-3 py-1 rounded ml-auto"
          >
            저장
          </button>
          {moleSaved && <span className="text-green-400">✅ 저장 완료</span>}
        </div>

        {moleHoles && (
          <div
            ref={moleWrapRef}
            className="relative border border-slate-600 mx-auto select-none bg-black"
            style={{
              width: '100%',
              maxWidth: 1280,
              aspectRatio: `${moleHoles.imageSize.w} / ${moleHoles.imageSize.h}`,
            }}
            onMouseMove={onMoleMouseMove}
            onMouseUp={() => setMoleDrag(null)}
            onMouseLeave={() => setMoleDrag(null)}
          >
            <img
              src="/assets/backgrounds/mole_game.png"
              alt=""
              className="absolute inset-0 w-full h-full object-fill pointer-events-none"
              style={{ imageRendering: 'pixelated' }}
              draggable={false}
            />

            {/* 셀 영역 표시 */}
            {moleHoles.holes.map((h, i) => {
              const leftPct = (h.x / moleHoles.imageSize.w) * 100;
              const topPct  = (h.y / moleHoles.imageSize.h) * 100;
              const wPct    = (moleHoles.cellSize.w / moleHoles.imageSize.w) * 100;
              const hPct    = (moleHoles.cellSize.h / moleHoles.imageSize.h) * 100;
              return (
                <div
                  key={`cell-${i}`}
                  className="absolute border-2 border-yellow-400/70 bg-yellow-400/10 pointer-events-none rounded-sm"
                  style={{
                    left: `${leftPct}%`,
                    top: `${topPct}%`,
                    width: `${wPct}%`,
                    height: `${hPct}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                />
              );
            })}

            {/* 드래그 핸들 (구멍 중심) */}
            {moleHoles.holes.map((h, i) => {
              const leftPct = (h.x / moleHoles.imageSize.w) * 100;
              const topPct  = (h.y / moleHoles.imageSize.h) * 100;
              return (
                <div
                  key={`handle-${i}`}
                  onMouseDown={e => { e.preventDefault(); setMoleDrag(i); }}
                  className="absolute w-7 h-7 -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing z-30"
                  style={{ left: `${leftPct}%`, top: `${topPct}%` }}
                  title={`구멍 ${i + 1} 드래그`}
                >
                  <div className="w-full h-full rounded-full bg-amber-400 border-2 border-white shadow-lg flex items-center justify-center text-xs font-bold text-slate-900">
                    {i + 1}
                  </div>
                  <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 text-[10px] bg-black/70 text-white px-1 rounded whitespace-nowrap pointer-events-none">
                    ({h.x},{h.y})
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="text-sm text-slate-400 mx-auto">
          🟡 노란 박스 = 두더지 솟구치는 셀 영역 / 🟠 1~6 = 구멍 중심 (드래그로 위치 이동) → 저장
        </p>
      </section>

      {/* ── 다른 그림 찾기 정답 영역 편집 ────────────────────────────────── */}
      <section className="border-t border-slate-700 pt-4 mt-4 flex flex-col gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-lg font-bold">🔍 다른 그림 찾기 — 정답 영역 ({diffData?.targets.length ?? 0}곳)</h2>
          <div className="flex items-center gap-1 bg-slate-800 rounded p-1">
            {(['ski', 'catacomb'] as DiffVariant[]).map(v => (
              <button
                key={v}
                onClick={() => setDiffVariant(v)}
                className={`px-3 py-1 rounded text-sm font-bold ${
                  diffVariant === v
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-300 hover:bg-slate-700'
                }`}
              >
                {DIFF_VARIANT_LABEL[v]}
              </button>
            ))}
          </div>
          <span className="text-xs text-slate-400">초록 원 핸들을 드래그해 정답 위치를 맞추세요. 반경(r)과 라벨은 옆 패널에서 편집.</span>
          <button
            onClick={saveDiffTargets}
            disabled={!diffData}
            className="bg-sky-600 hover:bg-sky-700 disabled:opacity-40 px-3 py-1 rounded ml-auto"
          >
            저장
          </button>
          {diffSaved && <span className="text-green-400">✅ 저장 완료</span>}
        </div>

        {diffData && (
          <div className="flex gap-4 items-start flex-wrap">
            {/* 좌: 배경 이미지 + 드래그 핸들 */}
            <div
              ref={diffWrapRef}
              className="relative border border-slate-600 select-none bg-black flex-1"
              style={{
                minWidth: 480,
                maxWidth: 960,
                aspectRatio: `${diffData.imageSize.w} / ${diffData.imageSize.h}`,
              }}
              onMouseMove={onDiffMouseMove}
              onMouseUp={() => setDiffDrag(null)}
              onMouseLeave={() => setDiffDrag(null)}
            >
              <img
                src={DIFF_VARIANT_BG[diffVariant]}
                alt=""
                className="absolute inset-0 w-full h-full object-fill pointer-events-none"
                draggable={false}
              />

              {/* 정답 원 표시 + 중심 핸들 — 왼쪽·오른쪽 2개씩 */}
              {diffData.targets.map((t, i) => {
                const wPct = ((t.r * 2) / diffData.imageSize.w) * 100;
                return (['left', 'right'] as const).map(side => {
                  const p = t[side];
                  const leftPct = (p.x / diffData.imageSize.w) * 100;
                  const topPct  = (p.y / diffData.imageSize.h) * 100;
                  return (
                    <div key={`${t.id}-${side}`}>
                      {/* 반경 원 */}
                      <div
                        className="absolute pointer-events-none rounded-full"
                        style={{
                          left: `${leftPct}%`,
                          top: `${topPct}%`,
                          width: `${wPct}%`,
                          aspectRatio: '1 / 1',
                          transform: 'translate(-50%, -50%)',
                          border: '2px solid #22c55e',
                          background: 'rgba(34,197,94,0.18)',
                        }}
                      />
                      {/* 드래그 핸들 (중심) */}
                      <div
                        onMouseDown={e => { e.preventDefault(); setDiffDrag({ i, side }); }}
                        className="absolute w-6 h-6 -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing z-30"
                        style={{ left: `${leftPct}%`, top: `${topPct}%` }}
                        title={`정답 ${i + 1} (${t.label}) — ${side === 'left' ? '왼쪽' : '오른쪽'} 드래그`}
                      >
                        <div className="w-full h-full rounded-full bg-emerald-400 border-2 border-white shadow-lg flex items-center justify-center text-[9px] font-bold text-slate-900">
                          {i + 1}{side === 'left' ? 'L' : 'R'}
                        </div>
                      </div>
                    </div>
                  );
                });
              })}
            </div>

            {/* 우: 정답별 편집 패널 */}
            <div className="flex flex-col gap-2 min-w-[320px]">
              {diffData.targets.map((t, i) => (
                <div
                  key={t.id}
                  className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded p-2"
                >
                  <span className="w-7 h-7 rounded-full bg-emerald-400 text-slate-900 font-bold text-sm flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <input
                    type="text"
                    value={t.label}
                    onChange={e => updateDiffField(i, 'label', e.target.value)}
                    placeholder="라벨"
                    className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm"
                  />
                  <label className="text-xs text-slate-300 flex items-center gap-1">
                    r
                    <input
                      type="number"
                      value={t.r}
                      onChange={e => updateDiffField(i, 'r', Math.max(5, parseInt(e.target.value, 10) || 0))}
                      className="w-16 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-sm"
                    />
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap">
                    L({t.left.x},{t.left.y}) R({t.right.x},{t.right.y})
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        <p className="text-sm text-slate-400 mx-auto">
          🟢 초록 원 = 정답 클릭 영역 / nL = 왼쪽 그림, nR = 오른쪽 그림 (드래그) / 우측 패널에서 라벨·반경 편집
        </p>
      </section>

      {/* ── 음향 ─────────────────────────────────────────────────────────── */}
      <AudioAdminSection />
    </main>
  );
}
