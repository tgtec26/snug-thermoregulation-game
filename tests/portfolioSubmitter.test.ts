import { describe, expect, it } from 'vitest';
import { createPortfolioRequestTracker } from '@/game/portfolio.js';

describe('portfolio async request guard', () => {
  it('discards a delayed preview when the destination changes before PNG generation finishes', async () => {
    const tracker = createPortfolioRequestTracker();
    const previewRequest = tracker.snapshot();
    let resolvePng!: (blob: Blob) => void;
    const delayedPng = new Promise<Blob>(resolve => { resolvePng = resolve; });

    tracker.invalidate();
    resolvePng(new Blob(['old target'], { type: 'image/png' }));
    await delayedPng;

    expect(tracker.isCurrent(previewRequest)).toBe(false);
    expect(tracker.isCurrent(tracker.snapshot())).toBe(true);
  });

  it('discards async completion after unmount', () => {
    const tracker = createPortfolioRequestTracker();
    const request = tracker.snapshot();
    tracker.unmount();
    expect(tracker.isCurrent(request)).toBe(false);
  });
});
