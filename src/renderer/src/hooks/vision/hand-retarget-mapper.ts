import type {
  LandmarkPoint,
  PoseObservationFrame,
} from './pose-landmark-recorder';

export type RetargetSide = 'left' | 'right';

export interface RetargetHandTarget {
  armRaise: number;
  armSwing: number;
  handOpen: number;
}

export interface HandRetargetTargets {
  left: RetargetHandTarget;
  right: RetargetHandTarget;
  tracking: { left: boolean; right: boolean };
}

export interface HandRetargetMapperOptions {
  smoothing?: number;
  confidenceThreshold?: number;
  neutral?: RetargetHandTarget;
}

export interface ClassifiedHand {
  landmarks: LandmarkPoint[];
  score: number;
}

export type ClassifiedHands = {
  left: ClassifiedHand | null;
  right: ClassifiedHand | null;
};

const SIDES: RetargetSide[] = ['left', 'right'];

const MIN_HAND_LANDMARK_COUNT = 21;
const WRIST_INDEX = 0;
const PALM_LANDMARK_INDEXES = [0, 5, 9, 13, 17];
const FINGER_MCP_INDEXES = [5, 9, 13, 17];
const FINGER_TIP_INDEXES = [8, 12, 16, 20];
const EXTENSION_RATIO_MIN = 1;
const EXTENSION_RATIO_MAX = 2;

export const NEUTRAL_TARGET: RetargetHandTarget = {
  armRaise: 0,
  armSwing: 0,
  handOpen: 0,
};

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clampNumber(value, 0, 1);
}

function clampSigned(value: number): number {
  return clampNumber(value, -1, 1);
}

function distance(a: LandmarkPoint, b: LandmarkPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function palmCenter(landmarks: LandmarkPoint[]): { x: number; y: number } {
  const points = PALM_LANDMARK_INDEXES.map((index) => landmarks[index]);
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

export function computeHandOpen(landmarks: LandmarkPoint[]): number {
  if (landmarks.length < MIN_HAND_LANDMARK_COUNT) return 0;
  const wrist = landmarks[WRIST_INDEX];
  const scores: number[] = [];
  FINGER_MCP_INDEXES.forEach((mcpIndex, fingerIndex) => {
    const mcpDistance = distance(landmarks[mcpIndex], wrist);
    if (mcpDistance <= 0) return;
    const tipDistance = distance(
      landmarks[FINGER_TIP_INDEXES[fingerIndex]],
      wrist,
    );
    const ratio = tipDistance / mcpDistance;
    const openness =
      (ratio - EXTENSION_RATIO_MIN) /
      (EXTENSION_RATIO_MAX - EXTENSION_RATIO_MIN);
    scores.push(clamp01(openness));
  });
  if (scores.length === 0) return 0;
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

export function computeHandTarget(
  landmarks: LandmarkPoint[],
): RetargetHandTarget {
  if (landmarks.length < MIN_HAND_LANDMARK_COUNT) {
    return { ...NEUTRAL_TARGET };
  }
  const palm = palmCenter(landmarks);
  const wrist = landmarks[WRIST_INDEX];
  return {
    armRaise: clamp01(1 - palm.y),
    armSwing: clampSigned((wrist.x - 0.5) * 2),
    handOpen: computeHandOpen(landmarks),
  };
}

export function sideFromHandedness(
  label: string | undefined,
): RetargetSide | null {
  const normalized = (label ?? '').trim().toLowerCase();
  if (normalized === 'left') return 'left';
  if (normalized === 'right') return 'right';
  return null;
}

export function classifyHands(
  frame: PoseObservationFrame,
  confidenceThreshold = 0.5,
): ClassifiedHands {
  const result: ClassifiedHands = { left: null, right: null };
  frame.hands.landmarks.forEach((landmarks, index) => {
    const info = frame.hands.handedness[index];
    const side = sideFromHandedness(info?.handedness);
    if (!side) return;
    const score = info?.score ?? 0;
    if (score < confidenceThreshold) return;
    const existing = result[side];
    if (!existing || score > existing.score) {
      result[side] = { landmarks, score };
    }
  });
  return result;
}

function smoothToward(
  current: RetargetHandTarget,
  target: RetargetHandTarget,
  alpha: number,
): RetargetHandTarget {
  return {
    armRaise: current.armRaise + alpha * (target.armRaise - current.armRaise),
    armSwing: current.armSwing + alpha * (target.armSwing - current.armSwing),
    handOpen: current.handOpen + alpha * (target.handOpen - current.handOpen),
  };
}

function clampTarget(target: RetargetHandTarget): RetargetHandTarget {
  return {
    armRaise: clamp01(target.armRaise),
    armSwing: clampSigned(target.armSwing),
    handOpen: clamp01(target.handOpen),
  };
}

export class HandRetargetMapper {
  private readonly smoothing: number;
  private readonly confidenceThreshold: number;
  private readonly neutral: RetargetHandTarget;
  private readonly state: Record<RetargetSide, RetargetHandTarget>;

  constructor(options: HandRetargetMapperOptions = {}) {
    this.smoothing = clamp01(options.smoothing ?? 0.35);
    this.confidenceThreshold = clamp01(options.confidenceThreshold ?? 0.5);
    this.neutral = {
      armRaise: clamp01(options.neutral?.armRaise ?? 0),
      armSwing: clampSigned(options.neutral?.armSwing ?? 0),
      handOpen: clamp01(options.neutral?.handOpen ?? 0),
    };
    this.state = {
      left: { ...this.neutral },
      right: { ...this.neutral },
    };
  }

  process(frame: PoseObservationFrame): HandRetargetTargets {
    const hands = classifyHands(frame, this.confidenceThreshold);
    const tracking: { left: boolean; right: boolean } = {
      left: false,
      right: false,
    };
    for (const side of SIDES) {
      const hand = hands[side];
      if (hand) {
        tracking[side] = true;
        this.state[side] = smoothToward(
          this.state[side],
          computeHandTarget(hand.landmarks),
          this.smoothing,
        );
      } else {
        this.state[side] = smoothToward(
          this.state[side],
          this.neutral,
          this.smoothing,
        );
      }
    }
    return {
      left: clampTarget(this.state.left),
      right: clampTarget(this.state.right),
      tracking,
    };
  }

  reset(): void {
    this.state.left = { ...this.neutral };
    this.state.right = { ...this.neutral };
  }
}
