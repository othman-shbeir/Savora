import { z } from 'zod';
import type { Photo } from './menu';

// The 3D walk-through: a Gaussian-splat model of the place, built by a scanning service from a
// video the owner records. Guests walk around inside it and tap tags on dishes. The photo tour
// stays as the fallback for places without a scan and phones that can't draw 3D.

export type Vec3 = [number, number, number];
/** A rotation as a unit quaternion: x, y, z, w. */
export type Quat = [number, number, number, number];

/** Where the build is. "queued" and "processing" are both waiting on the scanning service. */
export type SpaceStatus = 'queued' | 'processing' | 'ready' | 'failed';

/** Why a build failed, in words the owner can act on. */
export type SpaceError = 'rejected' | 'failed' | 'expired' | 'convert_failed';

/**
 * How the model is shown. Scans come out in the camera's own axes, so the owner levels the model
 * once (rotation) and picks where guests start (eye position and the direction they face).
 * Positions are in the levelled model's metres.
 */
export type SpacePose = { rotation: Quat; start: Vec3; yaw: number };

/** A model as scanned: no rotation, starting at the origin looking down -Z. */
export const DEFAULT_POSE: SpacePose = { rotation: [0, 0, 0, 1], start: [0, 1.5, 0], yaw: 0 };

/** Something guests can tap in the room. Positions are in the model's own coordinates (before
 *  the pose rotation), so levelling the model later keeps every tag on its spot. */
export type SpaceSpot = {
  id: string;
  position: Vec3;
  kind: 'dish' | 'info';
  labelEn: string | null;
  labelAr: string | null;
  noteEn: string | null;
  noteAr: string | null;
  /** kind "dish": the menu item it opens. */
  itemId: string | null;
};

export const MAX_SPACE_SPOTS = 24;

/** Recording limits the scanning service accepts. Checked in the browser before uploading. */
export const SPACE_VIDEO = { maxSeconds: 180, minSeconds: 20, maxSide: 1920, maxShortSide: 1080, maxBytes: 1024 * 1024 * 1024 } as const;

/** The owner's view of the 3D walk-through. */
export type SpaceDraft = {
  /** Whether a scanning service is configured on the server. */
  available: boolean;
  /** Null until the first video is sent. */
  status: SpaceStatus | null;
  error: SpaceError | null;
  /** When the current build was sent, ISO. */
  startedAt: string | null;
  /** The model to show, once a build is ready. */
  model: { url: string; bytes: number } | null;
  pose: SpacePose;
  spots: SpaceSpot[];
  /** The still guests see on the menu card and while the model loads. */
  poster: Photo | null;
  published: { at: string } | null;
  hasChanges: boolean;
};

/** What gets published. */
export type SpaceSnapshot = { modelKey: string; bytes: number; pose: SpacePose; spots: SpaceSpot[]; posterId: string | null };

/** What guests get. A tag whose dish left the menu is dropped. */
export type PublicSpace = {
  model: { url: string; bytes: number };
  pose: SpacePose;
  poster: Photo | null;
  spots: Array<Omit<SpaceSpot, 'itemId'> & { dish: { id: string; nameEn: string | null; nameAr: string | null; descriptionEn: string | null; descriptionAr: string | null; priceMinor: number; photo: Photo | null } | null }>;
};

/** Public address of a stored model, served by the API under /api. */
export const modelUrl = (key: string) => `/api/spaces/${key}`;

// ---------- Validation ----------

const text = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);
const finite = z.number().finite().min(-10_000).max(10_000);
const vec3 = z.tuple([finite, finite, finite]);

export const SpacePoseInput = z.object({
  rotation: z
    .tuple([finite, finite, finite, finite])
    .refine((q) => Math.abs(Math.hypot(...q) - 1) < 0.01, 'unit_quaternion')
    .transform((q) => {
      const n = Math.hypot(...q);
      return q.map((v) => v / n) as Quat;
    }),
  start: vec3,
  yaw: z.number().finite().min(-Math.PI * 4).max(Math.PI * 4),
});

export const SpaceSpotInput = z
  .object({
    position: vec3,
    kind: z.enum(['dish', 'info']),
    labelEn: text(60),
    labelAr: text(60),
    noteEn: text(200),
    noteAr: text(200),
    itemId: z.string().uuid().nullish().transform((v) => v ?? null),
  })
  .refine((s) => s.kind !== 'dish' || s.itemId, { message: 'dish_required', path: ['itemId'] })
  .refine((s) => s.kind !== 'info' || s.labelEn || s.labelAr, { message: 'label_required', path: ['labelEn'] });
export type SpaceSpotPayload = z.input<typeof SpaceSpotInput>;
