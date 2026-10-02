'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_AUDIO_CONFIG, mergeAudioConfig, type AudioConfig } from '@/lib/audio';

/** 어드민: BGM·효과음 음량(따로)과 음원 경로. 저장 후 게임을 새로고침하면 적용된다. */
export function AudioAdminSection() {
  const [cfg, setCfg] = useState<AudioConfig>(DEFAULT_AUDIO_CONFIG);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`/data/audio.json?t=${Date.now()}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => setCfg(mergeAudioConfig(d)))
      .catch(() => { /* 기본값 */ });
  }, []);

  const save = async () => {
    const r = await fetch('/api/audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: cfg }),
    });
    if (r.ok) { setSaved(true); setTimeout(() => setSaved(false), 1500); }
    else alert('저장 실패 (음향): ' + await r.text());
  };

  const pathRow = (kind: 'bgm' | 'sfx', key: string, value: string) => (
    <label key={key} className="flex items-center gap-2 text-sm">
      <span className="w-36 font-mono text-slate-300">{key}</span>
      <input
        type="text"
        value={value}
        onChange={e => setCfg(prev => ({ ...prev, [kind]: { ...prev[kind], [key]: e.target.value } }))}
        className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 font-mono"
      />
    </label>
  );

  return (
    <section className="border-t border-slate-700 pt-4 mt-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-bold">음향 — 음량·음원</h2>
        <button onClick={save} className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-sm font-bold">
          {saved ? '저장됨' : '저장'}
        </button>
      </div>
      <div className="flex gap-6 text-sm">
        {(['bgmVolume', 'sfxVolume'] as const).map(k => (
          <label key={k} className="flex items-center gap-2">
            {k === 'bgmVolume' ? '배경음 음량' : '효과음 음량'}
            <input
              type="range" min={0} max={1} step={0.05}
              value={cfg[k]}
              onChange={e => setCfg(prev => ({ ...prev, [k]: parseFloat(e.target.value) }))}
            />
            <span className="w-10 font-mono">{cfg[k].toFixed(2)}</span>
          </label>
        ))}
      </div>
      <div className="grid gap-1">
        {Object.entries(cfg.bgm).map(([k, v]) => pathRow('bgm', k, v))}
        {Object.entries(cfg.sfx).map(([k, v]) => pathRow('sfx', k, v))}
      </div>
    </section>
  );
}
