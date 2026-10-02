import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { DEFAULT_AUDIO_CONFIG, mergeAudioConfig } from '@/lib/audio';

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Admin API disabled in production' }, { status: 403 });
  }

  const { data } = await req.json();
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return NextResponse.json({ error: 'invalid payload: data must be object' }, { status: 400 });
  }
  for (const k of ['bgmVolume', 'sfxVolume'] as const) {
    if (typeof data[k] !== 'number' || data[k] < 0 || data[k] > 1) {
      return NextResponse.json({ error: `${k} must be number 0..1` }, { status: 400 });
    }
  }
  const clean = mergeAudioConfig(data);
  const missing = [
    ...Object.keys(DEFAULT_AUDIO_CONFIG.bgm).filter(k => !data.bgm?.[k]),
    ...Object.keys(DEFAULT_AUDIO_CONFIG.sfx).filter(k => !data.sfx?.[k]),
  ];
  if (missing.length) {
    return NextResponse.json({ error: `missing paths: ${missing.join(', ')}` }, { status: 400 });
  }

  const filepath = path.resolve(process.cwd(), 'public', 'data', 'audio.json');
  await fs.writeFile(filepath, JSON.stringify(clean, null, 2), 'utf-8');
  return NextResponse.json({ ok: true, file: 'audio.json' });
}
