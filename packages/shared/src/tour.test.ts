import { describe, expect, it } from 'vitest';
import { quality, SpotInput, tourChecks, tourScore, type TourScene } from './tour';

const sharp = { sharpness: 300, brightness: 120, width: 2400, height: 1600 };

describe('photo quality', () => {
  it('passes a sharp, well-lit photo', () => {
    expect(quality(sharp)).toMatchObject({ score: 100, issues: [] });
  });
  it('asks for a retake when a photo is blurry, dark or small', () => {
    expect(quality({ ...sharp, sharpness: 6 }).issues).toEqual(['blurry']);
    expect(quality({ ...sharp, brightness: 25 }).issues).toEqual(['dark']);
    expect(quality({ ...sharp, brightness: 240 }).issues).toEqual(['bright']);
    expect(quality({ ...sharp, width: 640, height: 480 }).issues).toEqual(['small']);
    expect(quality({ sharpness: 4, brightness: 20, width: 600, height: 400 })).toMatchObject({ score: 10, issues: ['blurry', 'dark', 'small'] });
  });
  it('takes a little off soft photos without flagging them', () => {
    const soft = quality({ ...sharp, sharpness: 30 });
    expect(soft.issues).toEqual([]);
    expect(soft.score).toBeGreaterThan(85);
    expect(soft.score).toBeLessThan(100);
  });
});

const scene = (score: number, issues: string[] = [], spots: Array<{ kind: 'dish' | 'info' | 'scene' }> = []) =>
  ({ quality: { score, issues }, spots }) as unknown as TourScene;

describe('readiness', () => {
  it('needs two scenes and a published menu; quality and spots are advice', () => {
    expect(tourChecks([scene(100)], true).filter((c) => c.required && !c.ok).map((c) => c.key)).toEqual(['scenes']);
    expect(tourChecks([scene(100), scene(60, ['blurry'])], false).filter((c) => !c.ok).map((c) => c.key)).toEqual(['menu', 'quality', 'spots', 'dishes']);
    const ready = tourChecks([scene(100, [], [{ kind: 'dish' }]), scene(100, [], [{ kind: 'info' }])], true);
    expect(ready.every((c) => c.ok)).toBe(true);
    expect(ready.find((c) => c.key === 'spots')!.count).toBe(2);
  });
  it('scores the tour as the mean of its scenes', () => {
    expect(tourScore([])).toBe(0);
    expect(tourScore([scene(100), scene(71)])).toBe(86);
  });
});

describe('spots', () => {
  it('needs what each kind points to', () => {
    const base = { x: 0.4, y: 0.6, labelEn: null, labelAr: null, noteEn: null, noteAr: null };
    expect(SpotInput.safeParse({ ...base, kind: 'dish' }).success).toBe(false);
    expect(SpotInput.safeParse({ ...base, kind: 'dish', itemId: '9f1c2b1e-3a4d-4c5e-8f60-718293a4b5c6' }).success).toBe(true);
    expect(SpotInput.safeParse({ ...base, kind: 'info' }).success).toBe(false);
    expect(SpotInput.safeParse({ ...base, kind: 'info', labelAr: 'الإضاءة' }).success).toBe(true);
    expect(SpotInput.safeParse({ ...base, kind: 'scene' }).success).toBe(false);
    expect(SpotInput.safeParse({ ...base, kind: 'info', labelEn: 'Lamp', x: 1.2 }).success).toBe(false);
  });
});
