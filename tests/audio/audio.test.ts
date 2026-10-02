import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DEFAULT_AUDIO_CONFIG, mergeAudioConfig, sfxThrottled, setMuted, isMuted,
} from '@/lib/audio';
import { pickBgm } from '@/components/overlays/AudioRunner';
import fs from 'fs';
import path from 'path';

describe('pickBgm (장면별 BGM)', () => {
  it('시작·결과 장면은 start_ending', () => {
    expect(pickBgm('title', null, null)).toBe('start_ending');
    expect(pickBgm('ending', null, null)).toBe('start_ending');
  });
  it('플레이 장면은 각자의 곡', () => {
    expect(pickBgm('classroom_rps_cold', null, null)).toBe('rock');
    expect(pickBgm('country_1_indoor', 'finland', 'dubai')).toBe('mole_game');
    expect(pickBgm('country_2_outdoor', 'finland', 'dubai')).toBe('pang');
    expect(pickBgm('country_2_indoor', 'finland', 'dubai')).toBe('diff');
    expect(pickBgm('country_1_arrived', 'canada', 'egypt')).toBe('canada');
    expect(pickBgm('country_2_arrived', 'canada', 'egypt')).toBe('egypt');
  });
  it('떨림 리듬게임은 자체 음악이라 BGM 없음', () => {
    expect(pickBgm('country_1_outdoor', 'finland', 'dubai')).toBeNull();
  });
});

describe('음소거 저장', () => {
  beforeEach(() => localStorage.clear());
  it('setMuted 가 localStorage 에 기록하고 상태를 바꾼다', () => {
    setMuted(true);
    expect(isMuted()).toBe(true);
    expect(localStorage.getItem('snug_thermo_muted')).toBe('1');
    setMuted(false);
    expect(isMuted()).toBe(false);
    expect(localStorage.getItem('snug_thermo_muted')).toBe('0');
  });
  it('localStorage 가 막혀도 던지지 않는다', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => setMuted(true)).not.toThrow();
    expect(isMuted()).toBe(true);
    spy.mockRestore();
    setMuted(false);
  });
});

describe('효과음 연타 제한', () => {
  it('90ms 안의 같은 효과음은 막고, 다른 효과음·간격 이후는 허용', () => {
    expect(sfxThrottled('correct', 1000)).toBe(false);
    expect(sfxThrottled('correct', 1050)).toBe(true);
    expect(sfxThrottled('error', 1050)).toBe(false);
    expect(sfxThrottled('correct', 1100)).toBe(false);
  });
});

describe('음향 설정 json', () => {
  it('audio.json 은 기본값과 일치(소리 유지)하고 모든 경로의 파일이 있다', () => {
    const json = JSON.parse(fs.readFileSync(path.resolve('public/data/audio.json'), 'utf-8'));
    expect(mergeAudioConfig(json)).toEqual(DEFAULT_AUDIO_CONFIG);
    const cfg = mergeAudioConfig(json);
    for (const p of [...Object.values(cfg.bgm), ...Object.values(cfg.sfx)]) {
      expect(fs.existsSync(path.resolve('public' + p)), p).toBe(true);
    }
  });
  it('잘못된 값은 기본값으로 대체', () => {
    const c = mergeAudioConfig({ bgmVolume: 5, sfxVolume: 0.2, bgm: { rock: '' }, sfx: { error: 3 } });
    expect(c.bgmVolume).toBe(0.45);
    expect(c.sfxVolume).toBe(0.2);
    expect(c.bgm.rock).toBe(DEFAULT_AUDIO_CONFIG.bgm.rock);
    expect(c.sfx.error).toBe(DEFAULT_AUDIO_CONFIG.sfx.error);
  });
});
