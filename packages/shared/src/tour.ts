import { z } from 'zod';
import type { Photo } from './menu';
import type { PublicSpace, SpaceDraft } from './space';

// Virtual trial (عيش اللحظة): a walk through the place built from the owner's photos. Each photo is a
// scene; scenes play in order as a guided tour; spots on a scene open a dish, a note, or another scene.

export type TourIssue = 'blurry' | 'dark' | 'bright' | 'small';

/** Measured once, when the photo is uploaded. */
export type TourMeasure = {
  /** Variance of the Laplacian on a 1024px greyscale copy: low means soft or shaken. */
  sharpness: number;
  /** Mean grey level, 0 to 255. */
  brightness: number;
  width: number;
  height: number;
};

export type TourQuality = TourMeasure & { score: number; issues: TourIssue[] };

/** Thresholds calibrated on café photos at 1024px: sharp room shots measure 150 to 800, soft but
 *  usable ones 25 to 40, and a shaken shot (a 6px blur on a 12-megapixel photo) 2 to 11. */
export const QUALITY = { blurry: 12, sharp: 40, dark: 40, bright: 215, minSide: 720 } as const;

/** A score out of 100 and the problems worth a retake. */
export function quality(m: TourMeasure): TourQuality {
  const issues: TourIssue[] = [];
  let score = 100;
  if (m.sharpness < QUALITY.blurry) {
    issues.push('blurry');
    score -= 40;
  } else if (m.sharpness < QUALITY.sharp) {
    // Usable but soft: a gentle penalty, no retake asked for.
    score -= Math.round((15 * (QUALITY.sharp - m.sharpness)) / (QUALITY.sharp - QUALITY.blurry));
  }
  if (m.brightness < QUALITY.dark) {
    issues.push('dark');
    score -= 30;
  } else if (m.brightness > QUALITY.bright) {
    issues.push('bright');
    score -= 20;
  }
  if (Math.min(m.width, m.height) < QUALITY.minSide) {
    issues.push('small');
    score -= 20;
  }
  return { ...m, score: Math.max(0, score), issues };
}

export type TourSpotKind = 'dish' | 'info' | 'scene';

export type TourSpot = {
  id: string;
  /** Position on the photo, 0 to 1 from the top-left corner. */
  x: number;
  y: number;
  kind: TourSpotKind;
  labelEn: string | null;
  labelAr: string | null;
  noteEn: string | null;
  noteAr: string | null;
  /** kind "dish": the menu item it opens. */
  itemId: string | null;
  /** kind "scene": where it walks to. */
  targetSceneId: string | null;
};

export type TourScene = {
  id: string;
  photo: Photo;
  nameEn: string | null;
  nameAr: string | null;
  /** Time on this scene in the guided tour. */
  seconds: number;
  quality: TourQuality;
  spots: TourSpot[];
};

/** What gets published: the tour as guests will walk it. Dishes are resolved when guests open it,
 *  from the published menu, so prices are never out of date. */
export type TourSnapshot = {
  scenes: Array<Omit<TourScene, 'photo' | 'quality'> & { photoId: string; width: number; height: number }>;
};

export type TourCheck = { key: 'scenes' | 'menu' | 'quality' | 'spots' | 'dishes'; ok: boolean; required: boolean; count: number };

/** The owner's view: the draft, how good it is, and whether it can go live. */
export type TourDraft = {
  location: { id: string; slug: string; currency: string; menuLive: boolean };
  scenes: TourScene[];
  /** Mean scene score, 0 to 100 (0 with no scenes). */
  score: number;
  checks: TourCheck[];
  published: { at: string; scenes: number } | null;
  hasChanges: boolean;
  /** For linking spots: the draft menu's dishes. */
  dishes: Array<{ id: string; nameEn: string | null; nameAr: string | null; priceMinor: number; photo: Photo | null }>;
  /** The 3D walk-through, built from a video. Published separately from the photo tour. */
  space: SpaceDraft;
};

/** What guests get: the 3D walk-through when there is one, and the photo tour (possibly empty)
 *  as its fallback. A spot whose dish left the menu is dropped. */
export type PublicTour = {
  slug: string;
  space: PublicSpace | null;
  name: { en: string; ar: string | null };
  currency: string;
  scenes: Array<{
    id: string;
    photo: Photo;
    width: number;
    height: number;
    nameEn: string | null;
    nameAr: string | null;
    seconds: number;
    spots: Array<Omit<TourSpot, 'itemId'> & { dish: { id: string; nameEn: string | null; nameAr: string | null; descriptionEn: string | null; descriptionAr: string | null; priceMinor: number; photo: Photo | null } | null }>;
  }>;
};

/** On the guest menu, above the dishes. kind "space" is the 3D walk-through. */
export type TourTeaser = { kind: 'space' | 'photos'; scenes: number; seconds: number; cover: Photo | null };

export const MIN_SCENES = 2;
export const MAX_SCENES = 40;
export const MAX_SPOTS = 12;

export const tourScore = (scenes: Array<{ quality: { score: number } }>) => (scenes.length ? Math.round(scenes.reduce((s, x) => s + x.quality.score, 0) / scenes.length) : 0);

export function tourChecks(scenes: TourScene[], menuLive: boolean): TourCheck[] {
  const spots = scenes.flatMap((s) => s.spots);
  return [
    { key: 'scenes', ok: scenes.length >= MIN_SCENES, required: true, count: scenes.length },
    { key: 'menu', ok: menuLive, required: true, count: 0 },
    { key: 'quality', ok: scenes.every((s) => s.quality.issues.length === 0), required: false, count: scenes.filter((s) => s.quality.issues.length).length },
    { key: 'spots', ok: spots.length > 0, required: false, count: spots.length },
    { key: 'dishes', ok: spots.some((s) => s.kind === 'dish'), required: false, count: spots.filter((s) => s.kind === 'dish').length },
  ];
}

export const tourSeconds = (scenes: Array<{ seconds: number }>) => scenes.reduce((s, x) => s + x.seconds, 0);

// ---------- Validation ----------

const text = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);

export const SceneInput = z.object({ nameEn: text(60), nameAr: text(60), seconds: z.number().int().min(4).max(30) });

export const SpotInput = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    kind: z.enum(['dish', 'info', 'scene']),
    labelEn: text(60),
    labelAr: text(60),
    noteEn: text(200),
    noteAr: text(200),
    itemId: z.string().uuid().nullish().transform((v) => v ?? null),
    targetSceneId: z.string().uuid().nullish().transform((v) => v ?? null),
  })
  .refine((s) => s.kind !== 'dish' || s.itemId, { message: 'dish_required', path: ['itemId'] })
  .refine((s) => s.kind !== 'scene' || s.targetSceneId, { message: 'scene_required', path: ['targetSceneId'] })
  .refine((s) => s.kind !== 'info' || s.labelEn || s.labelAr, { message: 'label_required', path: ['labelEn'] });
export type SpotPayload = z.input<typeof SpotInput>;

/** The studio's Save: every scene in walking order, with its name, time and spots. Scenes only come
 *  from uploads, so each one has an id; scenes left out are deleted. Spots without an id are added,
 *  and spots left out are deleted. */
export const TourSaveInput = z.object({
  scenes: z
    .array(
      z.intersection(
        SceneInput,
        z.object({
          id: z.string().uuid(),
          spots: z.array(z.intersection(z.object({ id: z.string().uuid().nullish().transform((v) => v ?? null) }), SpotInput)).max(MAX_SPOTS),
        }),
      ),
    )
    .max(MAX_SCENES),
});
export type TourSavePayload = z.input<typeof TourSaveInput>;

/** Ids the studio gives spots it has added but not saved yet. They are never sent to the API. */
export const isUnsavedSpot = (id: string) => id.startsWith('new:');

/** The studio's scenes as the API's save payload. */
export function tourSavePayload(scenes: TourScene[]): TourSavePayload {
  return {
    scenes: scenes.map((s) => ({
      id: s.id,
      nameEn: s.nameEn,
      nameAr: s.nameAr,
      seconds: s.seconds,
      spots: s.spots.map(({ id, ...spot }) => ({ ...spot, id: isUnsavedSpot(id) ? null : id })),
    })),
  };
}
