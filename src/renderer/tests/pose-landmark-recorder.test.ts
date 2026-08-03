import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COORDINATE_SYSTEM,
  PoseLandmarkRecorder,
} from '../src/hooks/vision/pose-landmark-recorder';
import type {
  PoseObservationFrame,
  PoseLandmarkRecorderOptions,
} from '../src/hooks/vision/pose-landmark-recorder';

const HAVE_CURRENT_DATA = 4;

vi.mock('@mediapipe/tasks-vision', () => {
  const mockPoseLandmarks = [
    { x: 0.1, y: 0.2, z: 0.0, visibility: 0.9 },
    { x: 0.3, y: 0.4, z: -0.1, visibility: 0.3 },
  ];
  const mockFaceLandmarks = [
    { x: 0.5, y: 0.5, z: 0.0 },
    { x: 0.6, y: 0.6, z: 0.0 },
  ];
  const mockHandLandmarks = [
    [
      { x: 0.7, y: 0.8, z: 0.0 },
      { x: 0.75, y: 0.85, z: 0.0 },
    ],
  ];
  const mockCreateDetectable = (result: unknown) => ({
    detectForVideo: vi.fn(() => result),
    close: vi.fn(),
  });
  const pose = mockCreateDetectable({ landmarks: [mockPoseLandmarks] });
  const face = mockCreateDetectable({ faceLandmarks: [mockFaceLandmarks] });
  const hand = mockCreateDetectable({
    landmarks: mockHandLandmarks,
    handedness: [[{ categoryName: 'Left', score: 0.95 }]],
  });

  return {
    FilesetResolver: {
      forVisionTasks: vi.fn(async () => ({})),
    },
    PoseLandmarker: {
      createFromOptions: vi.fn(async () => pose),
    },
    FaceLandmarker: {
      createFromOptions: vi.fn(async () => face),
    },
    HandLandmarker: {
      createFromOptions: vi.fn(async () => hand),
    },
  };
});

import {
  FaceLandmarker,
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
} from '@mediapipe/tasks-vision';

const FakePose = vi.mocked(PoseLandmarker);
const FakeFace = vi.mocked(FaceLandmarker);
const FakeHand = vi.mocked(HandLandmarker);

function fakeVideo(): HTMLVideoElement {
  return { readyState: HAVE_CURRENT_DATA } as HTMLVideoElement;
}

async function createRunningRecorder(options?: PoseLandmarkRecorderOptions) {
  const recorder = new PoseLandmarkRecorder(options);
  await recorder.start(fakeVideo());
  return recorder;
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  FakePose.createFromOptions.mockClear();
  FakeFace.createFromOptions.mockClear();
  FakeHand.createFromOptions.mockClear();
  vi.mocked(FilesetResolver.forVisionTasks).mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('PoseLandmarkRecorder', () => {
  it('initializes body, face and hand landmarkers with the camera stream', async () => {
    const recorder = await createRunningRecorder();

    expect(recorder.isRunning).toBe(true);
    expect(FilesetResolver.forVisionTasks).toHaveBeenCalledOnce();
    expect(FakePose.createFromOptions).toHaveBeenCalledOnce();
    expect(FakeFace.createFromOptions).toHaveBeenCalledOnce();
    expect(FakeHand.createFromOptions).toHaveBeenCalledOnce();
    recorder.stop();
  });

  it('respects disabled landmark kinds', async () => {
    const recorder = await createRunningRecorder({
      enabled: { pose: true, face: false, hand: false },
    });

    expect(FakePose.createFromOptions).toHaveBeenCalledOnce();
    expect(FakeFace.createFromOptions).not.toHaveBeenCalled();
    expect(FakeHand.createFromOptions).not.toHaveBeenCalled();

    const frame = recorder.processFrame(1_000);
    expect(frame?.body.detected).toBe(true);
    expect(frame?.face.detected).toBe(false);
    expect(frame?.hands.detected).toBe(false);
    recorder.stop();
  });

  it('releases all landmarkers and stops recognition when stopped', async () => {
    const recorder = await createRunningRecorder();

    const [poseInstance, faceInstance, handInstance] = await Promise.all([
      FakePose.createFromOptions.mock.results[0].value,
      FakeFace.createFromOptions.mock.results[0].value,
      FakeHand.createFromOptions.mock.results[0].value,
    ]);

    recorder.stop();

    expect(recorder.isRunning).toBe(false);
    expect(recorder.processFrame(2_000)).toBeNull();
    expect(poseInstance.close).toHaveBeenCalledOnce();
    expect(faceInstance.close).toHaveBeenCalledOnce();
    expect(handInstance.close).toHaveBeenCalledOnce();
  });

  it('emits frames containing coordinate system, time, confidence and visibility state', async () => {
    const recorder = await createRunningRecorder();
    const frames: PoseObservationFrame[] = [];
    recorder.subscribe((frame) => frames.push(frame));

    const frame = recorder.processFrame(1_000);
    recorder.stop();

    expect(frame).not.toBeNull();
    expect(frame?.version).toBe(1);
    expect(frame?.relativeTimeMs).toBeGreaterThanOrEqual(0);
    expect(frame?.mediaTimestampMs).toBe(1_000);
    expect(frame?.coordinateSystem).toEqual(COORDINATE_SYSTEM);
    expect(frame?.coordinateSystem.mirrored).toBe(false);
    expect(frame?.coordinateSystem.previewMirrored).toBe(true);
    expect(frame?.coordinateSystem.space).toBe('normalized');

    const [wrist, elbow] = frame?.body.landmarks ?? [];
    expect(frame?.body.detected).toBe(true);
    expect(wrist.x).toBe(0.1);
    expect(wrist.y).toBe(0.2);
    expect(wrist.visibility).toBe(0.9);
    expect(wrist.visible).toBe(true);
    expect(elbow.visibility).toBe(0.3);
    expect(elbow.visible).toBe(false);

    expect(frame?.face.detected).toBe(true);
    expect(frame?.face.landmarks[0].visibility).toBeNull();
    expect(frame?.face.landmarks[0].visible).toBe(true);

    expect(frame?.hands.detected).toBe(true);
    expect(frame?.hands.landmarks[0].length).toBe(2);
    expect(frame?.hands.landmarks[0][0].visibility).toBeNull();
    expect(frame?.hands.handedness[0]).toEqual({ handedness: 'Left', score: 0.95 });

    expect(frames).toHaveLength(1);
    expect(recorder.emittedFrameCount).toBe(1);
  });

  it('does not process frames before the video has current data', async () => {
    const recorder = new PoseLandmarkRecorder();
    await recorder.start({ readyState: 2 } as HTMLVideoElement);

    expect(recorder.processFrame(1_000)).toBeNull();
    recorder.stop();
  });

  it('sends no frames and no raw image over the network', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const recorder = await createRunningRecorder();
    const frame = recorder.processFrame(1_000);
    recorder.stop();

    expect(fetchMock).not.toHaveBeenCalled();

    const serialized = JSON.stringify(frame);
    expect(serialized).not.toContain('data:image');
    expect(serialized).not.toContain('data:');
    expect(frame).not.toHaveProperty('image');
    expect(frame).not.toHaveProperty('pixels');
    expect(frame).not.toHaveProperty('dataUrl');
  });
});
