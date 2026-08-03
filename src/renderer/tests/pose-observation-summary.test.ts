import { describe, expect, it } from 'vitest';
import { COORDINATE_SYSTEM } from '../src/hooks/vision/pose-landmark-recorder';
import type { PoseObservationFrame } from '../src/hooks/vision/pose-landmark-recorder';
import {
  DEFAULT_SAMPLE_INTERVAL_MS,
  PoseObservationBuffer,
  buildPoseObservationSummary,
} from '../src/hooks/vision/pose-observation-summary';
import type { PoseObservationSummary } from '../src/hooks/vision/pose-observation-summary';

type JointOverride = Partial<{
  x: number;
  y: number;
  z: number;
  visibility: number;
  visible: boolean;
}>;

const SKELETON: Record<number, JointOverride> = {
  0: { x: 0.4, y: 0.1 },
  11: { x: 0.35, y: 0.3 },
  12: { x: 0.45, y: 0.3 },
  13: { x: 0.35, y: 0.45 },
  14: { x: 0.45, y: 0.45 },
  15: { x: 0.35, y: 0.6 },
  16: { x: 0.45, y: 0.6 },
  23: { x: 0.35, y: 0.7 },
  24: { x: 0.45, y: 0.7 },
  25: { x: 0.35, y: 0.85 },
  26: { x: 0.45, y: 0.85 },
  27: { x: 0.35, y: 1.0 },
  28: { x: 0.45, y: 1.0 },
};

function bodyLandmarks(overrides: Record<number, JointOverride> = {}) {
  return Array.from({ length: 33 }, (_, index) => ({
    index,
    x: 0.4,
    y: 0.5,
    z: 0,
    visibility: 0.9,
    visible: true,
    ...(SKELETON[index] ?? {}),
    ...(overrides[index] ?? {}),
  }));
}

function makeFrame(
  t: number,
  options: {
    body?: (t: number) => Record<number, JointOverride>;
    bodyDetected?: boolean;
  } = {},
): PoseObservationFrame {
  const overrides = options.body?.(t) ?? {};
  return {
    version: 1,
    relativeTimeMs: t,
    mediaTimestampMs: t,
    coordinateSystem: COORDINATE_SYSTEM,
    body: {
      detected: options.bodyDetected ?? true,
      landmarks: bodyLandmarks(overrides),
    },
    face: {
      detected: true,
      landmarks: [
        { index: 0, x: 0.5, y: 0.5, z: 0, visibility: null, visible: true },
      ],
    },
    hands: {
      detected: true,
      landmarks: [],
      handedness: [],
    },
  };
}

function framesOverWindow(
  stepMs = 50,
  windowMs = 30_000,
): PoseObservationFrame[] {
  const frames: PoseObservationFrame[] = [];
  for (let t = 0; t <= windowMs; t += stepMs) {
    frames.push(makeFrame(t));
  }
  return frames;
}

describe('PoseObservationSummary period and sampling', () => {
  it('describes a 30 second window with capture rate, submitted sampling frequency and validity ratio', () => {
    const frames = framesOverWindow(50, 30_000);
    const summary = buildPoseObservationSummary(frames);

    expect(summary.version).toBe(1);
    expect(summary.period.startRelativeTimeMs).toBe(0);
    expect(summary.period.endRelativeTimeMs).toBe(30_000);
    expect(summary.period.durationMs).toBe(30_000);
    expect(summary.period.frameCount).toBe(601);
    expect(summary.period.rawCaptureFrameRate).toBeCloseTo(601 / 30, 5);
    expect(summary.period.submittedSampleCount).toBe(
      Math.floor(30_000 / DEFAULT_SAMPLE_INTERVAL_MS) + 1,
    );
    expect(summary.period.submittedSamplingFrequency).toBeCloseTo(
      summary.period.submittedSampleCount / 30,
      5,
    );
    expect(summary.period.validRecognitionRatio).toBe(1);
    expect(summary.samplingIntervalMs).toBe(DEFAULT_SAMPLE_INTERVAL_MS);
    expect(summary.coordinateSystem).toEqual(COORDINATE_SYSTEM);
  });

  it('counts unprocessed time as invalid recognition ratio', () => {
    const frames = framesOverWindow(50, 30_000);
    for (const frame of frames) {
      frame.body.detected = false;
      frame.face.detected = false;
      frame.hands.detected = false;
    }
    frames[100].body.detected = true;

    const summary = buildPoseObservationSummary(frames);
    expect(summary.period.validRecognitionRatio).toBeCloseTo(
      1 / frames.length,
      5,
    );
  });

  it('keeps the downsampled keypoint time series without a fixed action label or intent', () => {
    const summary = buildPoseObservationSummary(framesOverWindow());
    const sample = summary.samples.find((s) => s.relativeTimeMs === 10_000);
    expect(sample).toBeDefined();
    expect(sample?.body.landmarks[11]).toMatchObject({
      x: 0.35,
      y: 0.3,
      z: 0,
      visible: true,
    });

    const serialized = JSON.stringify(summary);
    expect(serialized).not.toMatch(
      /wave|thumbs_up|smile|mouth_open|hug|heart|intent|action/,
    );
  });
});

describe('PoseObservationBuffer window boundaries', () => {
  it('emits a summary only when the accumulated span reaches the window duration', () => {
    const buffer = new PoseObservationBuffer();
    let emitted = false;
    for (let t = 0; t < 3_000; t += 50) {
      const summary = buffer.push(makeFrame(t));
      if (summary !== null) emitted = true;
    }
    expect(emitted).toBe(false);
    expect(buffer.size).toBe(60);

    const summary = buffer.push(makeFrame(3_000));
    expect(summary).not.toBeNull();
    expect(summary?.period.frameCount).toBe(61);
    expect(summary?.period.durationMs).toBe(3_000);
    expect(buffer.size).toBe(0);
  });

  it('uses a custom window duration and resets between windows', () => {
    const buffer = new PoseObservationBuffer({ windowDurationMs: 10_000 });
    let first: PoseObservationSummary | null = null;
    for (let t = 0; t <= 10_000; t += 50) {
      const summary = buffer.push(makeFrame(t));
      if (summary) first = summary;
    }
    expect(first?.period.durationMs).toBe(10_000);
    expect(buffer.size).toBe(0);

    const second = buffer.push(makeFrame(11_000));
    expect(second).toBeNull();
    expect(buffer.size).toBe(1);
  });
});

describe('PoseObservationSummary movement descriptors', () => {
  it('computes joint trajectories with speeds, stationary ratio and durations', () => {
    const frames = framesOverWindow(50, 30_000).map((frame) =>
      makeFrame(frame.relativeTimeMs, {
        body: (t) => {
          const x = 0.4 + 0.1 * Math.sin((2 * Math.PI * t) / 2000);
          return { 15: { x } };
        },
      }),
    );
    const summary = buildPoseObservationSummary(frames);

    const wrist = summary.trajectories[15];
    expect(wrist.sampleCount).toBe(summary.samples.length);
    expect(wrist.visibleRatio).toBe(1);
    expect(wrist.displacement).toBeGreaterThan(0);
    expect(wrist.totalPathLength).toBeGreaterThan(0);
    expect(wrist.meanSpeed).toBeGreaterThan(0);
    expect(wrist.maxSpeed).toBeGreaterThan(0);
    expect(wrist.startRelativeTimeMs).toBe(0);
    expect(wrist.endRelativeTimeMs).toBe(30_000);

    const shoulder = summary.trajectories[11];
    expect(shoulder.totalPathLength).toBe(0);
    expect(shoulder.stationaryRatio).toBe(1);

    const wristAngle = summary.angles.find((angle) => angle.joint === 13);
    expect(wristAngle?.sampleCount).toBeGreaterThan(0);
    expect(wristAngle?.changeRangeDeg).toBeGreaterThan(0);
  });

  it('reports relative positions between joints over time', () => {
    const summary = buildPoseObservationSummary(framesOverWindow());
    const shoulderPair = summary.relativePositions.find(
      (pair) => pair.from === 11 && pair.to === 12,
    );
    expect(shoulderPair?.sampleCount).toBe(summary.samples.length);
    expect(shoulderPair?.minDistance).toBeCloseTo(0.1, 5);
    expect(shoulderPair?.maxDistance).toBeCloseTo(0.1, 5);
    expect(shoulderPair?.range).toBe(0);
  });

  it('detects held posture segments with start, end and duration', () => {
    const summary = buildPoseObservationSummary(framesOverWindow());
    const shoulderHolds = summary.holds.filter(
      (hold) => hold.jointIndex === 11,
    );
    expect(shoulderHolds.length).toBeGreaterThan(0);
    expect(shoulderHolds[0].durationMs).toBeGreaterThanOrEqual(1_000);
    expect(
      shoulderHolds[0].endRelativeTimeMs - shoulderHolds[0].startRelativeTimeMs,
    ).toBe(shoulderHolds[0].durationMs);
  });

  it('detects repetition timing for an oscillating joint', () => {
    const frames = framesOverWindow(50, 30_000).map((frame) =>
      makeFrame(frame.relativeTimeMs, {
        body: (t) => {
          const x = 0.4 + 0.1 * Math.sin((2 * Math.PI * t) / 2000);
          return { 15: { x } };
        },
      }),
    );
    const summary = buildPoseObservationSummary(frames);

    const wristRepetition = summary.repetitions[15];
    expect(wristRepetition.cycleCount).toBeGreaterThanOrEqual(2);
    expect(wristRepetition.meanCycleDurationMs).toBeGreaterThan(800);
    expect(wristRepetition.meanCycleDurationMs).toBeLessThan(1_200);

    const staticJoint = summary.repetitions[11];
    expect(staticJoint.cycleCount).toBe(0);
  });
});

describe('PoseObservationSummary data quality preservation', () => {
  it('keeps low confidence, occlusion and short missing gaps with interpolation ratios', () => {
    const frames = framesOverWindow(50, 30_000);
    for (const frame of frames) {
      frame.body.landmarks[7] = {
        ...frame.body.landmarks[7],
        visibility: 0.05,
        visible: false,
      };
      if (frame.relativeTimeMs >= 10_000 && frame.relativeTimeMs <= 10_200) {
        frame.body.landmarks[15] = {
          ...frame.body.landmarks[15],
          visibility: 0.05,
          visible: false,
        };
      }
    }

    const summary = buildPoseObservationSummary(frames);

    const missingSample = summary.samples.find(
      (s) => s.relativeTimeMs === 10_000,
    );
    expect(missingSample?.body.landmarks[15].visible).toBe(false);

    expect(summary.missing.framesWithoutBody).toBe(0);
    expect(summary.missing.missingBodyJointSampleCount).toBeGreaterThan(0);
    expect(summary.missing.missingBodyJointSampleRatio).toBeGreaterThan(0);
    expect(summary.missing.interpolatedBodyJointSampleCount).toBeGreaterThan(0);
    expect(summary.missing.interpolatedBodyJointSampleRatio).toBeGreaterThan(0);

    const interpolatedSample = summary.samples.find(
      (s) => s.relativeTimeMs === 10_000,
    );
    expect(interpolatedSample?.body.landmarks[15].interpolated).toBe(true);

    expect(summary.people.framesWithBodyDetected).toBe(frames.length);
    expect(summary.people.occlusionRatio).toBeGreaterThan(0);

    expect(summary.quality.perJointMeanConfidence[7]).toBeLessThan(
      summary.quality.perJointMeanConfidence[11],
    );
    expect(summary.quality.overallMeanConfidence).toBeLessThan(0.9);
    expect(summary.quality.overallQualityScore).toBeLessThan(1);
    expect(summary.quality.overallQualityScore).toBeGreaterThan(0);
  });

  it('does not interpolate across a long missing gap', () => {
    const frames = framesOverWindow(50, 30_000);
    for (const frame of frames) {
      if (frame.relativeTimeMs >= 10_000 && frame.relativeTimeMs <= 11_000) {
        frame.body.landmarks[15] = {
          ...frame.body.landmarks[15],
          visibility: 0.05,
          visible: false,
        };
      }
    }

    const summary = buildPoseObservationSummary(frames);
    const gapSamples = summary.samples.filter(
      (s) => s.relativeTimeMs >= 10_000 && s.relativeTimeMs <= 11_000,
    );
    expect(gapSamples.length).toBeGreaterThan(1);
    expect(
      gapSamples.every((s) => s.body.landmarks[15].visible === false),
    ).toBe(true);
    expect(gapSamples.some((s) => s.body.landmarks[15].interpolated)).toBe(
      false,
    );
  });

  it('reports people visibility and per-frame detection counts', () => {
    const frames = framesOverWindow(50, 30_000);
    frames[0].body.detected = false;
    frames[0].face.detected = false;

    const summary = buildPoseObservationSummary(frames);
    expect(summary.people.visiblePersonCount).toBe(1);
    expect(summary.people.meanVisiblePersonCount).toBeCloseTo(
      (frames.length - 1) / frames.length,
      5,
    );
    expect(summary.missing.framesWithoutBody).toBe(1);
    expect(summary.missing.framesWithoutFace).toBe(1);
  });
});
