import { describe, expect, it } from 'vitest';
import { COORDINATE_SYSTEM } from '../src/hooks/vision/pose-landmark-recorder';
import type {
  LandmarkPoint,
  PoseObservationFrame,
} from '../src/hooks/vision/pose-landmark-recorder';
import {
  HandRetargetMapper,
  NEUTRAL_TARGET,
  classifyHands,
  computeHandOpen,
  computeHandTarget,
  sideFromHandedness,
} from '../src/hooks/vision/hand-retarget-mapper';
import type {
  HandRetargetMapperOptions,
  RetargetHandTarget,
} from '../src/hooks/vision/hand-retarget-mapper';

const MCP_DISTANCE = 0.1;

function point(x: number, y: number): LandmarkPoint {
  return { index: 0, x, y, z: 0, visibility: null, visible: true };
}

function buildHandLandmarks(
  wrist: [number, number],
  extension: number,
): LandmarkPoint[] {
  const fingerDirections: Array<[number, number]> = [
    [2, -1],
    [1, -1],
    [0, -1],
    [-1, -1],
    [-2, -1],
  ];
  const joints: Array<{ index: number; finger: number; tip: boolean }> = [
    { index: 2, finger: 0, tip: false },
    { index: 4, finger: 0, tip: true },
    { index: 5, finger: 1, tip: false },
    { index: 8, finger: 1, tip: true },
    { index: 9, finger: 2, tip: false },
    { index: 12, finger: 2, tip: true },
    { index: 13, finger: 3, tip: false },
    { index: 16, finger: 3, tip: true },
    { index: 17, finger: 4, tip: false },
    { index: 20, finger: 4, tip: true },
  ];
  const landmarks: LandmarkPoint[] = [];
  for (let i = 0; i < 21; i += 1) {
    if (i === 0) {
      landmarks.push(point(wrist[0], wrist[1]));
      continue;
    }
    const joint = joints.find((candidate) => candidate.index === i);
    if (!joint) {
      landmarks.push(point(wrist[0] + 0.01 * i, wrist[1]));
      continue;
    }
    const [dx, dy] = fingerDirections[joint.finger];
    const offset = joint.tip ? MCP_DISTANCE * extension : MCP_DISTANCE;
    landmarks.push(point(wrist[0] + dx * offset, wrist[1] + dy * offset));
  }
  return landmarks;
}

function buildFrame(
  hands: Array<{
    landmarks: LandmarkPoint[];
    handedness?: string;
    score?: number;
  }>,
): PoseObservationFrame {
  return {
    version: 1,
    relativeTimeMs: 0,
    mediaTimestampMs: 0,
    coordinateSystem: COORDINATE_SYSTEM,
    body: { detected: false, landmarks: [] },
    face: { detected: false, landmarks: [] },
    hands: {
      detected: hands.length > 0,
      landmarks: hands.map((hand) => hand.landmarks),
      handedness: hands.map((hand) => ({
        handedness: hand.handedness ?? 'unknown',
        score: hand.score ?? 0,
      })),
    },
  };
}

const EMPTY_FRAME = buildFrame([]);

function openHand(wrist: [number, number] = [0.5, 0.5]): LandmarkPoint[] {
  return buildHandLandmarks(wrist, 2);
}

function fistHand(wrist: [number, number] = [0.5, 0.5]): LandmarkPoint[] {
  return buildHandLandmarks(wrist, 1);
}

describe('computeHandOpen', () => {
  it('reports an open hand near full openness', () => {
    const openness = computeHandOpen(openHand());
    expect(openness).toBeGreaterThan(0.9);
  });

  it('reports a fist near zero openness', () => {
    const openness = computeHandOpen(fistHand());
    expect(openness).toBeLessThan(0.1);
  });

  it('is monotonic between a fist and an open hand', () => {
    const half = computeHandOpen(buildHandLandmarks([0.5, 0.5], 1.5));
    expect(computeHandOpen(fistHand())).toBeLessThan(half);
    expect(half).toBeLessThan(computeHandOpen(openHand()));
  });

  it('returns zero for incomplete landmark lists', () => {
    expect(computeHandOpen(openHand().slice(0, 5))).toBe(0);
    expect(computeHandOpen([])).toBe(0);
  });

  it('skips fingers with a collapsed mcp distance', () => {
    const landmarks = openHand();
    const indexMcp = landmarks[5];
    landmarks[5] = { ...indexMcp, x: landmarks[0].x, y: landmarks[0].y };
    const openness = computeHandOpen(landmarks);
    expect(Number.isFinite(openness)).toBe(true);
    expect(openness).toBeGreaterThan(0.9);
  });

  it('returns zero when every finger has a collapsed mcp distance', () => {
    const landmarks = openHand();
    for (const index of [5, 9, 13, 17]) {
      landmarks[index] = {
        ...landmarks[index],
        x: landmarks[0].x,
        y: landmarks[0].y,
      };
    }
    expect(computeHandOpen(landmarks)).toBe(0);
  });
});

describe('computeHandTarget', () => {
  it('maps a raised wrist to a high armRaise', () => {
    const target = computeHandTarget(openHand([0.5, 0.1]));
    expect(target.armRaise).toBeGreaterThan(0.8);
  });

  it('maps a low wrist to a low armRaise', () => {
    const target = computeHandTarget(openHand([0.5, 0.95]));
    expect(target.armRaise).toBeLessThan(0.2);
  });

  it('maps left and right lateral wrist positions to opposite armSwing signs', () => {
    const left = computeHandTarget(openHand([0.2, 0.5]));
    const right = computeHandTarget(openHand([0.8, 0.5]));
    expect(left.armSwing).toBeLessThan(0);
    expect(right.armSwing).toBeGreaterThan(0);
    expect(Math.abs(left.armSwing)).toBeCloseTo(Math.abs(right.armSwing), 1);
  });

  it('returns neutral for incomplete landmark lists', () => {
    expect(computeHandTarget(openHand().slice(0, 3))).toEqual(NEUTRAL_TARGET);
  });

  it('clamps out-of-range inputs to the value domain', () => {
    const offLeft = computeHandTarget(openHand([0, 0.5]));
    const offRight = computeHandTarget(openHand([1, 0.5]));
    const offTop = computeHandTarget(openHand([0.5, -0.2]));
    const offBottom = computeHandTarget(openHand([0.5, 1.2]));
    expect(offLeft.armSwing).toBe(-1);
    expect(offRight.armSwing).toBe(1);
    expect(offTop.armRaise).toBe(1);
    expect(offBottom.armRaise).toBe(0);
  });
});

describe('sideFromHandedness', () => {
  it('recognizes MediaPipe left and right labels', () => {
    expect(sideFromHandedness('Left')).toBe('left');
    expect(sideFromHandedness('right')).toBe('right');
    expect(sideFromHandedness('left')).toBe('left');
  });

  it('returns null for unknown or missing labels', () => {
    expect(sideFromHandedness('unknown')).toBeNull();
    expect(sideFromHandedness(undefined)).toBeNull();
    expect(sideFromHandedness('')).toBeNull();
  });
});

describe('classifyHands', () => {
  it('assigns hands to the matching parameter side', () => {
    const frame = buildFrame([
      { landmarks: openHand(), handedness: 'Left', score: 0.95 },
      { landmarks: openHand([0.8, 0.5]), handedness: 'Right', score: 0.9 },
    ]);
    const hands = classifyHands(frame);
    expect(hands.left).not.toBeNull();
    expect(hands.right).not.toBeNull();
    expect(hands.left?.score).toBe(0.95);
  });

  it('drops hands below the confidence threshold', () => {
    const frame = buildFrame([
      { landmarks: openHand(), handedness: 'Left', score: 0.3 },
    ]);
    expect(classifyHands(frame).left).toBeNull();
    expect(classifyHands(frame, 0.5).left).toBeNull();
  });

  it('keeps hands at or above the confidence threshold', () => {
    const frame = buildFrame([
      { landmarks: openHand(), handedness: 'Left', score: 0.5 },
    ]);
    expect(classifyHands(frame).left).not.toBeNull();
  });

  it('ignores hands with unknown handedness', () => {
    const frame = buildFrame([{ landmarks: openHand(), score: 0.9 }]);
    expect(classifyHands(frame)).toEqual({ left: null, right: null });
  });

  it('keeps only the highest-scoring hand per side', () => {
    const frame = buildFrame([
      { landmarks: fistHand(), handedness: 'Left', score: 0.7 },
      { landmarks: openHand(), handedness: 'Left', score: 0.95 },
    ]);
    const hands = classifyHands(frame);
    expect(hands.left?.score).toBe(0.95);
    expect(hands.left?.landmarks).toBe(frame.hands.landmarks[1]);
  });

  it('returns both sides null when no hands are detected', () => {
    expect(classifyHands(EMPTY_FRAME)).toEqual({ left: null, right: null });
  });
});

describe('HandRetargetMapper', () => {
  function mapper(options: HandRetargetMapperOptions = {}): HandRetargetMapper {
    return new HandRetargetMapper(options);
  }

  it('starts at neutral and stays neutral without hands', () => {
    const retarget = mapper();
    const targets = retarget.process(EMPTY_FRAME);
    expect(targets.left).toEqual(NEUTRAL_TARGET);
    expect(targets.right).toEqual(NEUTRAL_TARGET);
    expect(targets.tracking).toEqual({ left: false, right: false });
  });

  it('drives only the detected side for a single hand', () => {
    const retarget = mapper({ smoothing: 1 });
    const targets = retarget.process(
      buildFrame([{ landmarks: openHand(), handedness: 'Left', score: 0.95 }]),
    );
    expect(targets.tracking.left).toBe(true);
    expect(targets.tracking.right).toBe(false);
    expect(targets.left.handOpen).toBeGreaterThan(0.9);
    expect(targets.right).toEqual(NEUTRAL_TARGET);
  });

  it('drives both sides when both hands are present', () => {
    const retarget = mapper({ smoothing: 1 });
    const targets = retarget.process(
      buildFrame([
        { landmarks: fistHand(), handedness: 'Left', score: 0.95 },
        { landmarks: openHand([0.8, 0.4]), handedness: 'Right', score: 0.9 },
      ]),
    );
    expect(targets.tracking).toEqual({ left: true, right: true });
    expect(targets.left.handOpen).toBeLessThan(0.1);
    expect(targets.right.handOpen).toBeGreaterThan(0.9);
    expect(targets.right.armRaise).toBeGreaterThan(0.5);
  });

  it('treats a low-confidence hand as missing', () => {
    const retarget = mapper({ smoothing: 1 });
    const targets = retarget.process(
      buildFrame([{ landmarks: openHand(), handedness: 'Left', score: 0.2 }]),
    );
    expect(targets.tracking.left).toBe(false);
    expect(targets.left).toEqual(NEUTRAL_TARGET);
  });

  it('regresses to neutral smoothly after the hand is lost', () => {
    const retarget = mapper({ smoothing: 0.35 });
    const frame = buildFrame([
      { landmarks: openHand([0.5, 0.1]), handedness: 'Left', score: 0.95 },
    ]);
    let raised = retarget.process(frame);
    for (let i = 0; i < 5; i += 1) {
      raised = retarget.process(frame);
    }
    expect(raised.tracking.left).toBe(true);
    expect(raised.left.armRaise).toBeGreaterThan(0.5);

    const lostFrames: RetargetHandTarget[] = [];
    let lastRaise = raised.left.armRaise;
    for (let i = 0; i < 20; i += 1) {
      const targets = retarget.process(EMPTY_FRAME);
      lostFrames.push(targets.left);
      expect(targets.tracking.left).toBe(false);
      expect(targets.left.armRaise).toBeLessThan(lastRaise);
      lastRaise = targets.left.armRaise;
    }
    expect(lostFrames[lostFrames.length - 1].armRaise).toBeLessThan(0.001);
  });

  it('smooths a target jump across frames instead of snapping', () => {
    const retarget = mapper({ smoothing: 0.2 });
    const frame = buildFrame([
      { landmarks: openHand(), handedness: 'Left', score: 0.95 },
    ]);
    const first = retarget.process(frame);
    expect(first.left.handOpen).toBeCloseTo(0.2, 1);
    let last = first.left.handOpen;
    for (let i = 0; i < 30; i += 1) {
      const targets = retarget.process(frame);
      expect(targets.left.handOpen).toBeGreaterThan(last);
      last = targets.left.handOpen;
    }
    expect(last).toBeGreaterThan(0.9);
  });

  it('uses a configurable neutral target', () => {
    const retarget = mapper({
      smoothing: 1,
      neutral: { armRaise: 0, armSwing: 0, handOpen: 0.3 },
    });
    const targets = retarget.process(EMPTY_FRAME);
    expect(targets.left.handOpen).toBe(0.3);
  });

  it('respects a custom confidence threshold', () => {
    const frame = buildFrame([
      { landmarks: openHand(), handedness: 'Left', score: 0.6 },
    ]);
    const strict = mapper({ smoothing: 1, confidenceThreshold: 0.8 });
    const lenient = mapper({ smoothing: 1, confidenceThreshold: 0.5 });
    expect(strict.process(frame).tracking.left).toBe(false);
    expect(lenient.process(frame).tracking.left).toBe(true);
  });

  it('reset returns all sides to neutral', () => {
    const retarget = mapper({ smoothing: 1 });
    retarget.process(
      buildFrame([
        { landmarks: openHand([0.5, 0.1]), handedness: 'Left', score: 0.95 },
      ]),
    );
    retarget.reset();
    const targets = retarget.process(EMPTY_FRAME);
    expect(targets.left).toEqual(NEUTRAL_TARGET);
    expect(targets.right).toEqual(NEUTRAL_TARGET);
  });
});
