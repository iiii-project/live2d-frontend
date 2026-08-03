import type { PoseObservationFrame } from './pose-landmark-recorder';

export const HUMANML3D_FEATURE_DIM = 263;

// The M2T service expects the 22-joint HumanML3D layout. MediaPipe provides
// fewer semantic joints, so the missing hand/toe points reuse the nearest
// available wrist/foot landmarks instead of inventing motion.
const JOINTS = [
  { landmark: null, parent: null }, // pelvis/root
  { landmark: 23, parent: 0 },
  { landmark: 24, parent: 0 },
  { landmark: 25, parent: 1 },
  { landmark: 26, parent: 2 },
  { landmark: 27, parent: 3 },
  { landmark: 28, parent: 4 },
  { landmark: 31, parent: 5 },
  { landmark: 32, parent: 6 },
  { landmark: null, parent: 0 }, // spine
  { landmark: null, parent: 9 }, // neck
  { landmark: 0, parent: 10 }, // head
  { landmark: 11, parent: 10 },
  { landmark: 12, parent: 10 },
  { landmark: 13, parent: 12 },
  { landmark: 14, parent: 13 },
  { landmark: 15, parent: 14 },
  { landmark: 16, parent: 15 },
  { landmark: 15, parent: 16 }, // left hand proxy
  { landmark: 16, parent: 17 }, // right hand proxy
  { landmark: 31, parent: 7 },
  { landmark: 32, parent: 8 },
] as const;

type Point = [number, number, number];

const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Point, factor: number): Point => [a[0] * factor, a[1] * factor, a[2] * factor];
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Point, b: Point): Point => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

function normalize(value: Point): Point {
  const length = Math.sqrt(dot(value, value));
  return length > 1e-8 ? scale(value, 1 / length) : [0, 0, 1];
}

function point(frame: PoseObservationFrame, landmark: number | null): Point | null {
  if (landmark === null) return null;
  const found = frame.body.landmarks.find((item) => item.index === landmark);
  return found ? [found.x, found.y, found.z] : null;
}

function jointPositions(frame: PoseObservationFrame): Point[] {
  const leftHip = point(frame, 23) ?? [0, 0, 0];
  const rightHip = point(frame, 24) ?? leftHip;
  const leftShoulder = point(frame, 11) ?? leftHip;
  const rightShoulder = point(frame, 12) ?? rightHip;
  const pelvis = scale(add(leftHip, rightHip), 0.5);
  const spine = scale(add(pelvis, scale(add(leftShoulder, rightShoulder), 0.5)), 0.5);
  const neck = scale(add(leftShoulder, rightShoulder), 0.5);
  const known = new Map<number, Point>();
  for (const [index, joint] of JOINTS.entries()) {
    const value = point(frame, joint.landmark);
    if (value) known.set(index, value);
  }
  known.set(0, pelvis);
  known.set(9, spine);
  known.set(10, neck);
  known.set(18, known.get(16) ?? leftShoulder);
  known.set(19, known.get(17) ?? rightShoulder);
  return JOINTS.map((joint, index) => known.get(index) ?? known.get(joint.parent ?? 0) ?? pelvis);
}

function rotation6d(positions: Point[], index: number): number[] {
  const parent = JOINTS[index].parent ?? index;
  const direction = normalize(sub(positions[index], positions[parent]));
  const reference: Point = Math.abs(direction[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const side = normalize(cross(reference, direction));
  return [...direction, ...side];
}

function yaw(position: Point, shoulderLeft: Point, shoulderRight: Point): number {
  const axis = sub(shoulderRight, shoulderLeft);
  return Math.atan2(axis[2], axis[0]) + position[1] * 0;
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export function convertPoseFramesToHumanML3D(
  frames: PoseObservationFrame[],
): number[][] {
  if (frames.length === 0) return [];
  const positions = frames.map(jointPositions);
  const features = positions.map((current, frameIndex) => {
    const previous = positions[Math.max(0, frameIndex - 1)];
    const root = current[0];
    const previousRoot = previous[0];
    const leftShoulder = current[12];
    const rightShoulder = current[13];
    const previousLeftShoulder = previous[12];
    const previousRightShoulder = previous[13];
    const rootRotation = frameIndex === 0
      ? 0
      : yaw(root, leftShoulder, rightShoulder)
        - yaw(previousRoot, previousLeftShoulder, previousRightShoulder);
    const rootVelocity = sub(root, previousRoot);
    const values: number[] = [rootRotation, rootVelocity[0], rootVelocity[2], root[1]];

    for (let index = 1; index < positions[0].length; index += 1) {
      values.push(...sub(current[index], root));
    }
    for (let index = 1; index < positions[0].length; index += 1) {
      values.push(...rotation6d(current, index));
    }
    for (let index = 0; index < current.length; index += 1) {
      values.push(...sub(current[index], previous[index]));
    }
    for (const index of [5, 6, 7, 8]) {
      const velocity = sub(current[index], previous[index]);
      values.push(Math.abs(velocity[0]) + Math.abs(velocity[1]) + Math.abs(velocity[2]) < 0.02 ? 1 : 0);
    }
    return values.map(finite);
  });

  const invalidRow = features.find(
    (row) => row.length !== HUMANML3D_FEATURE_DIM,
  );
  if (invalidRow) {
    throw new Error(
      `HumanML3D conversion produced ${invalidRow.length} features, expected ${HUMANML3D_FEATURE_DIM}`,
    );
  }
  return features;
}
