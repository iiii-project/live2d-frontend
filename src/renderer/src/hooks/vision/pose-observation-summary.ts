import { COORDINATE_SYSTEM } from './pose-landmark-recorder';
import type {
  HandednessInfo,
  LandmarkPoint,
  PoseObservationFrame,
} from './pose-landmark-recorder';

export const OBSERVATION_WINDOW_MS = 30_000;
export const DEFAULT_SAMPLE_INTERVAL_MS = 200;
export const STATIONARY_SPEED_THRESHOLD = 0.02;
export const STATIONARY_RADIUS = 0.02;
export const MIN_HOLD_DURATION_MS = 1_000;
export const MAX_INTERPOLATION_GAP_SAMPLES = 3;
export const REPETITION_MIN_PEAK_SPEED = 0.05;
export const REPETITION_MIN_CYCLE_GAP_MS = 300;

const BODY_JOINT_COUNT = 33;

const RELATIVE_POSITION_PAIRS: Array<[number, number]> = [
  [0, 23],
  [0, 24],
  [11, 12],
  [15, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [11, 13],
  [13, 15],
  [23, 25],
  [25, 27],
];

const ANGLE_TRIPLES: Array<{ joint: number; first: number; second: number }> = [
  { joint: 13, first: 11, second: 15 },
  { joint: 14, first: 12, second: 16 },
  { joint: 11, first: 13, second: 23 },
  { joint: 12, first: 14, second: 24 },
  { joint: 25, first: 23, second: 27 },
  { joint: 26, first: 24, second: 28 },
];

export interface PoseSampleLandmark extends LandmarkPoint {
  interpolated?: boolean;
}

export interface PoseSample {
  relativeTimeMs: number;
  sourceRelativeTimeMs: number;
  body: {
    detected: boolean;
    landmarks: PoseSampleLandmark[];
  };
  face: {
    detected: boolean;
    landmarks: LandmarkPoint[];
  };
  hands: {
    detected: boolean;
    landmarks: LandmarkPoint[][];
    handedness: HandednessInfo[];
  };
}

export interface PoseObservationPeriod {
  startRelativeTimeMs: number;
  endRelativeTimeMs: number;
  durationMs: number;
  frameCount: number;
  rawCaptureFrameRate: number;
  submittedSampleCount: number;
  submittedSamplingFrequency: number;
  validRecognitionRatio: number;
}

export interface JointTrajectory {
  jointIndex: number;
  sampleCount: number;
  visibleSampleCount: number;
  visibleRatio: number;
  meanX: number;
  meanY: number;
  meanZ: number;
  totalPathLength: number;
  displacement: number;
  meanSpeed: number;
  maxSpeed: number;
  stationaryRatio: number;
  startRelativeTimeMs: number;
  endRelativeTimeMs: number;
}

export interface RelativePositionSeries {
  from: number;
  to: number;
  sampleCount: number;
  meanDistance: number;
  minDistance: number;
  maxDistance: number;
  range: number;
}

export interface JointAngleSeries {
  joint: number;
  first: number;
  second: number;
  sampleCount: number;
  meanAngleDeg: number;
  minAngleDeg: number;
  maxAngleDeg: number;
  changeRangeDeg: number;
}

export interface HoldSegment {
  jointIndex: number;
  startRelativeTimeMs: number;
  endRelativeTimeMs: number;
  durationMs: number;
}

export interface RepetitionTiming {
  jointIndex: number;
  cycleCount: number;
  meanCycleDurationMs: number;
  cycleStartTimesMs: number[];
}

export interface PeopleSummary {
  visiblePersonCount: number;
  meanVisiblePersonCount: number;
  framesWithBodyDetected: number;
  occlusionRatio: number;
}

export interface MissingSummary {
  framesWithoutBody: number;
  framesWithoutFace: number;
  framesWithoutHands: number;
  missingBodyJointSampleCount: number;
  missingBodyJointSampleRatio: number;
  interpolatedBodyJointSampleCount: number;
  interpolatedBodyJointSampleRatio: number;
}

export interface QualitySummary {
  perJointMeanConfidence: Record<number, number>;
  overallMeanConfidence: number;
  overallQualityScore: number;
}

export interface PoseObservationSummary {
  version: 1;
  period: PoseObservationPeriod;
  coordinateSystem: typeof COORDINATE_SYSTEM;
  samplingIntervalMs: number;
  people: PeopleSummary;
  samples: PoseSample[];
  trajectories: JointTrajectory[];
  relativePositions: RelativePositionSeries[];
  angles: JointAngleSeries[];
  holds: HoldSegment[];
  repetitions: RepetitionTiming[];
  missing: MissingSummary;
  quality: QualitySummary;
}

export interface PoseObservationSummaryOptions {
  sampleIntervalMs?: number;
}

export function buildPoseObservationSummary(
  frames: PoseObservationFrame[],
  options: PoseObservationSummaryOptions = {},
): PoseObservationSummary {
  const sampleIntervalMs =
    options.sampleIntervalMs ?? DEFAULT_SAMPLE_INTERVAL_MS;
  const samples = downsampleFrames(frames, sampleIntervalMs);
  interpolateBodyGaps(samples);

  const period = computePeriod(frames, samples);
  const people = computePeopleSummary(frames);
  const missing = computeMissing(samples, frames);

  return {
    version: 1,
    period,
    coordinateSystem: COORDINATE_SYSTEM,
    samplingIntervalMs: sampleIntervalMs,
    people,
    samples,
    trajectories: computeTrajectories(samples),
    relativePositions: computeRelativePositions(samples),
    angles: computeAngles(samples),
    holds: computeHolds(samples),
    repetitions: computeRepetitions(samples),
    missing,
    quality: computeQuality(samples, period, people, missing),
  };
}

function downsampleFrames(
  frames: PoseObservationFrame[],
  intervalMs: number,
): PoseSample[] {
  if (frames.length === 0) return [];
  const start = frames[0].relativeTimeMs;
  const end = frames[frames.length - 1].relativeTimeMs;
  const samples: PoseSample[] = [];
  let index = 0;
  for (let t = start; t <= end; t += intervalMs) {
    while (
      index + 1 < frames.length &&
      Math.abs(frames[index + 1].relativeTimeMs - t) <=
        Math.abs(frames[index].relativeTimeMs - t)
    ) {
      index += 1;
    }
    const frame = frames[index];
    samples.push({
      relativeTimeMs: t,
      sourceRelativeTimeMs: frame.relativeTimeMs,
      body: {
        detected: frame.body.detected,
        landmarks: frame.body.landmarks.map(clonePoint),
      },
      face: {
        detected: frame.face.detected,
        landmarks: frame.face.landmarks.map(clonePoint),
      },
      hands: {
        detected: frame.hands.detected,
        landmarks: frame.hands.landmarks.map((hand) => hand.map(clonePoint)),
        handedness: frame.hands.handedness.map((handedness) => ({
          ...handedness,
        })),
      },
    });
  }
  return samples;
}

function clonePoint(point: LandmarkPoint): PoseSampleLandmark {
  return { ...point };
}

function interpolateBodyGaps(samples: PoseSample[]): void {
  if (samples.length < 2) return;
  const jointCount = samples[0].body.landmarks.length;
  for (let joint = 0; joint < jointCount; joint += 1) {
    let runStart = -1;
    for (let i = 0; i <= samples.length; i += 1) {
      const inGap =
        i < samples.length && !samples[i].body.landmarks[joint]?.visible;
      if (inGap && runStart === -1) {
        runStart = i;
      } else if (!inGap && runStart !== -1) {
        fillShortGap(samples, joint, runStart, i - 1);
        runStart = -1;
      }
    }
  }
}

function fillShortGap(
  samples: PoseSample[],
  joint: number,
  runStart: number,
  runEnd: number,
): void {
  const runLength = runEnd - runStart + 1;
  if (runLength <= 0 || runLength > MAX_INTERPOLATION_GAP_SAMPLES) return;
  const before = samples[runStart - 1]?.body.landmarks[joint];
  const after = samples[runEnd + 1]?.body.landmarks[joint];
  if (!before || !after || !before.visible || !after.visible) return;

  const timeBefore = samples[runStart - 1].relativeTimeMs;
  const timeAfter = samples[runEnd + 1].relativeTimeMs;
  for (let i = runStart; i <= runEnd; i += 1) {
    const ratio =
      (samples[i].relativeTimeMs - timeBefore) / (timeAfter - timeBefore || 1);
    const point = samples[i].body.landmarks[joint];
    point.x = before.x + (after.x - before.x) * ratio;
    point.y = before.y + (after.y - before.y) * ratio;
    point.z = before.z + (after.z - before.z) * ratio;
    point.visibility = Math.min(before.visibility ?? 0, after.visibility ?? 0);
    point.interpolated = true;
  }
}

function computePeriod(
  frames: PoseObservationFrame[],
  samples: PoseSample[],
): PoseObservationPeriod {
  const startRelativeTimeMs = frames[0]?.relativeTimeMs ?? 0;
  const endRelativeTimeMs = frames[frames.length - 1]?.relativeTimeMs ?? 0;
  const durationMs = Math.max(1, endRelativeTimeMs - startRelativeTimeMs);
  const durationSeconds = durationMs / 1000;
  const validCount = frames.filter(
    (frame) =>
      frame.body.detected || frame.face.detected || frame.hands.detected,
  ).length;

  return {
    startRelativeTimeMs,
    endRelativeTimeMs,
    durationMs,
    frameCount: frames.length,
    rawCaptureFrameRate: frames.length / durationSeconds,
    submittedSampleCount: samples.length,
    submittedSamplingFrequency: samples.length / durationSeconds,
    validRecognitionRatio: frames.length ? validCount / frames.length : 0,
  };
}

function computePeopleSummary(frames: PoseObservationFrame[]): PeopleSummary {
  let visiblePersonCount = 0;
  let personSum = 0;
  let framesWithBodyDetected = 0;
  let occludedFrames = 0;

  for (const frame of frames) {
    const persons = frame.body.detected ? 1 : 0;
    if (persons > visiblePersonCount) visiblePersonCount = persons;
    personSum += persons;
    if (persons) {
      framesWithBodyDetected += 1;
      if (frame.body.landmarks.some((point) => !point.visible))
        occludedFrames += 1;
    }
  }

  return {
    visiblePersonCount,
    meanVisiblePersonCount: frames.length ? personSum / frames.length : 0,
    framesWithBodyDetected,
    occlusionRatio: framesWithBodyDetected
      ? occludedFrames / framesWithBodyDetected
      : 0,
  };
}

function bodyJointSeries(
  samples: PoseSample[],
  jointIndex: number,
): Array<{
  t: number;
  x: number;
  y: number;
  z: number;
  visible: boolean;
  interpolated: boolean;
}> {
  return samples.map((sample) => {
    const point = sample.body.landmarks[jointIndex];
    return {
      t: sample.relativeTimeMs,
      x: point?.x ?? 0,
      y: point?.y ?? 0,
      z: point?.z ?? 0,
      visible: point?.visible ?? false,
      interpolated: Boolean(point?.interpolated),
    };
  });
}

function computeTrajectories(samples: PoseSample[]): JointTrajectory[] {
  const trajectories: JointTrajectory[] = [];
  for (let joint = 0; joint < BODY_JOINT_COUNT; joint += 1) {
    const series = bodyJointSeries(samples, joint);
    const usable = series.filter(
      (point) => point.visible || point.interpolated,
    );
    if (usable.length === 0) {
      trajectories.push({
        jointIndex: joint,
        sampleCount: series.length,
        visibleSampleCount: 0,
        visibleRatio: 0,
        meanX: 0,
        meanY: 0,
        meanZ: 0,
        totalPathLength: 0,
        displacement: 0,
        meanSpeed: 0,
        maxSpeed: 0,
        stationaryRatio: 0,
        startRelativeTimeMs: 0,
        endRelativeTimeMs: 0,
      });
      continue;
    }

    const meanPositionValue = meanPosition(usable);
    const meanX = meanPositionValue.x;
    const meanY = meanPositionValue.y;
    const meanZ = meanPositionValue.z;
    let totalPathLength = 0;
    let maxSpeed = 0;
    let stationaryCount = 0;
    const pairs = usable.length - 1;
    for (let i = 1; i < usable.length; i += 1) {
      const segmentLength = distance3(usable[i - 1], usable[i]);
      totalPathLength += segmentLength;
      const dtMs = Math.max(1, usable[i].t - usable[i - 1].t);
      const speed = (segmentLength / dtMs) * 1000;
      if (speed > maxSpeed) maxSpeed = speed;
      if (speed < STATIONARY_SPEED_THRESHOLD) stationaryCount += 1;
    }
    const spanMs = Math.max(1, usable[usable.length - 1].t - usable[0].t);
    const displacement = distance3(usable[0], usable[usable.length - 1]);

    trajectories.push({
      jointIndex: joint,
      sampleCount: series.length,
      visibleSampleCount: usable.length,
      visibleRatio: usable.length / series.length,
      meanX,
      meanY,
      meanZ,
      totalPathLength,
      displacement,
      meanSpeed: (totalPathLength / spanMs) * 1000,
      maxSpeed,
      stationaryRatio: pairs ? stationaryCount / pairs : 0,
      startRelativeTimeMs: usable[0].t,
      endRelativeTimeMs: usable[usable.length - 1].t,
    });
  }
  return trajectories;
}

function computeRelativePositions(
  samples: PoseSample[],
): RelativePositionSeries[] {
  return RELATIVE_POSITION_PAIRS.map(([from, to]) => {
    const distances: number[] = [];
    for (const sample of samples) {
      const first = sample.body.landmarks[from];
      const second = sample.body.landmarks[to];
      const firstUsable = first && (first.visible || first.interpolated);
      const secondUsable = second && (second.visible || second.interpolated);
      if (firstUsable && secondUsable)
        distances.push(distance2(first!, second!));
    }
    const minDistance = distances.length ? Math.min(...distances) : 0;
    const maxDistance = distances.length ? Math.max(...distances) : 0;
    return {
      from,
      to,
      sampleCount: distances.length,
      meanDistance: distances.length ? mean(distances) : 0,
      minDistance,
      maxDistance,
      range: maxDistance - minDistance,
    };
  });
}

function computeAngles(samples: PoseSample[]): JointAngleSeries[] {
  return ANGLE_TRIPLES.map(({ joint, first, second }) => {
    const values: number[] = [];
    for (const sample of samples) {
      const a = sample.body.landmarks[first];
      const b = sample.body.landmarks[joint];
      const c = sample.body.landmarks[second];
      if (!a || !b || !c || !a.visible || !b.visible || !c.visible) continue;
      const angle = angleDeg(a, b, c);
      if (angle !== null) values.push(angle);
    }
    const minAngleDeg = values.length ? Math.min(...values) : 0;
    const maxAngleDeg = values.length ? Math.max(...values) : 0;
    return {
      joint,
      first,
      second,
      sampleCount: values.length,
      meanAngleDeg: values.length ? mean(values) : 0,
      minAngleDeg,
      maxAngleDeg,
      changeRangeDeg: maxAngleDeg - minAngleDeg,
    };
  });
}

function computeHolds(samples: PoseSample[]): HoldSegment[] {
  const holds: HoldSegment[] = [];
  for (let joint = 0; joint < BODY_JOINT_COUNT; joint += 1) {
    const series = bodyJointSeries(samples, joint).filter(
      (point) => point.visible || point.interpolated,
    );
    let i = 0;
    while (i < series.length) {
      const anchor = series[i];
      let k = i;
      while (
        k + 1 < series.length &&
        distance3(anchor, series[k + 1]) <= STATIONARY_RADIUS
      ) {
        k += 1;
      }
      const durationMs = series[k].t - series[i].t;
      if (durationMs >= MIN_HOLD_DURATION_MS) {
        holds.push({
          jointIndex: joint,
          startRelativeTimeMs: series[i].t,
          endRelativeTimeMs: series[k].t,
          durationMs,
        });
      }
      i = k + 1;
    }
  }
  return holds;
}

function computeRepetitions(samples: PoseSample[]): RepetitionTiming[] {
  const repetitions: RepetitionTiming[] = [];
  for (let joint = 0; joint < BODY_JOINT_COUNT; joint += 1) {
    const series = bodyJointSeries(samples, joint).filter(
      (point) => point.visible || point.interpolated,
    );
    const speeds: Array<{ t: number; v: number }> = [];
    for (let i = 0; i + 1 < series.length; i += 1) {
      const dtMs = Math.max(1, series[i + 1].t - series[i].t);
      speeds.push({
        t: (series[i].t + series[i + 1].t) / 2,
        v: (distance3(series[i], series[i + 1]) / dtMs) * 1000,
      });
    }

    const peaks: Array<{ t: number; v: number }> = [];
    for (let i = 1; i + 1 < speeds.length; i += 1) {
      const previous = speeds[i - 1];
      const current = speeds[i];
      const next = speeds[i + 1];
      if (
        current.v >= REPETITION_MIN_PEAK_SPEED &&
        current.v >= previous.v &&
        current.v >= next.v
      ) {
        peaks.push(current);
      }
    }

    const filtered: Array<{ t: number; v: number }> = [];
    for (const peak of peaks) {
      const last = filtered[filtered.length - 1];
      if (!last || peak.t - last.t >= REPETITION_MIN_CYCLE_GAP_MS) {
        filtered.push(peak);
      } else if (peak.v > last.v) {
        filtered[filtered.length - 1] = peak;
      }
    }

    const cycleStartTimesMs = filtered.map((peak) => peak.t);
    const cycleDurations = cycleStartTimesMs
      .slice(1)
      .map((t, i) => t - cycleStartTimesMs[i]);
    repetitions.push({
      jointIndex: joint,
      cycleCount: Math.max(0, cycleStartTimesMs.length - 1),
      meanCycleDurationMs: cycleDurations.length ? mean(cycleDurations) : 0,
      cycleStartTimesMs,
    });
  }
  return repetitions;
}

function computeMissing(
  samples: PoseSample[],
  frames: PoseObservationFrame[],
): MissingSummary {
  let missingCount = 0;
  let interpolatedCount = 0;
  let totalBodyPoints = 0;
  for (const sample of samples) {
    totalBodyPoints += sample.body.landmarks.length;
    for (const point of sample.body.landmarks) {
      if (!point.visible) missingCount += 1;
      if (point.interpolated) interpolatedCount += 1;
    }
  }

  return {
    framesWithoutBody: frames.filter((frame) => !frame.body.detected).length,
    framesWithoutFace: frames.filter((frame) => !frame.face.detected).length,
    framesWithoutHands: frames.filter((frame) => !frame.hands.detected).length,
    missingBodyJointSampleCount: missingCount,
    missingBodyJointSampleRatio: totalBodyPoints
      ? missingCount / totalBodyPoints
      : 0,
    interpolatedBodyJointSampleCount: interpolatedCount,
    interpolatedBodyJointSampleRatio: totalBodyPoints
      ? interpolatedCount / totalBodyPoints
      : 0,
  };
}

function computeQuality(
  samples: PoseSample[],
  period: PoseObservationPeriod,
  people: PeopleSummary,
  missing: MissingSummary,
): QualitySummary {
  const perJointMeanConfidence: Record<number, number> = {};
  const overallMeanConfidences: number[] = [];
  for (let joint = 0; joint < BODY_JOINT_COUNT; joint += 1) {
    const confidences: number[] = [];
    for (const sample of samples) {
      const point = sample.body.landmarks[joint];
      if (point && typeof point.visibility === 'number' && point.visible) {
        confidences.push(point.visibility);
      }
    }
    const jointMean = confidences.length ? mean(confidences) : 0;
    perJointMeanConfidence[joint] = jointMean;
    overallMeanConfidences.push(jointMean);
  }
  const overallMeanConfidence = overallMeanConfidences.length
    ? mean(overallMeanConfidences)
    : 0;

  const score =
    0.25 * period.validRecognitionRatio +
    0.35 * overallMeanConfidence +
    0.2 * (1 - people.occlusionRatio) +
    0.2 * (1 - missing.missingBodyJointSampleRatio);

  return {
    perJointMeanConfidence,
    overallMeanConfidence,
    overallQualityScore: Math.min(1, Math.max(0, score)),
  };
}

function distance3(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function distance2(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function angleDeg(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
): number | null {
  const first = { x: a.x - b.x, y: a.y - b.y };
  const second = { x: c.x - b.x, y: c.y - b.y };
  const magnitude =
    Math.hypot(first.x, first.y) * Math.hypot(second.x, second.y);
  if (magnitude === 0) return null;
  const cosine = Math.min(
    1,
    Math.max(-1, (first.x * second.x + first.y * second.y) / magnitude),
  );
  return (Math.acos(cosine) * 180) / Math.PI;
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function meanPosition(values: Array<{ x: number; y: number; z: number }>): {
  x: number;
  y: number;
  z: number;
} {
  return {
    x: mean(values.map((value) => value.x)),
    y: mean(values.map((value) => value.y)),
    z: mean(values.map((value) => value.z)),
  };
}

export interface PoseObservationBufferOptions
  extends PoseObservationSummaryOptions {
  windowDurationMs?: number;
}

export class PoseObservationBuffer {
  private readonly windowDurationMs: number;
  private readonly summaryOptions: PoseObservationSummaryOptions;
  private frames: PoseObservationFrame[] = [];
  private windowStart: number | null = null;

  constructor(options: PoseObservationBufferOptions = {}) {
    this.windowDurationMs = options.windowDurationMs ?? OBSERVATION_WINDOW_MS;
    this.summaryOptions = { sampleIntervalMs: options.sampleIntervalMs };
  }

  get size(): number {
    return this.frames.length;
  }

  get isWindowComplete(): boolean {
    if (this.windowStart === null || this.frames.length === 0) return false;
    const last = this.frames[this.frames.length - 1].relativeTimeMs;
    return last - this.windowStart >= this.windowDurationMs;
  }

  push(frame: PoseObservationFrame): PoseObservationSummary | null {
    if (this.windowStart === null) this.windowStart = frame.relativeTimeMs;
    this.frames.push(frame);
    if (this.isWindowComplete) {
      const summary = buildPoseObservationSummary(
        this.frames,
        this.summaryOptions,
      );
      this.reset();
      return summary;
    }
    return null;
  }

  reset(): void {
    this.frames = [];
    this.windowStart = null;
  }
}
