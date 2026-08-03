import {
  FaceLandmarker,
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
} from '@mediapipe/tasks-vision';

const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.0/wasm';
const POSE_MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task';
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task';
const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task';

const DEFAULT_VISIBILITY_THRESHOLD = 0.5;
const HAVE_CURRENT_DATA = 4;

export const COORDINATE_SYSTEM = {
  name: 'mediapipe-tasks-vision-normalized',
  space: 'normalized',
  origin: 'top-left',
  xRange: [0, 1] as [number, number],
  yRange: [0, 1] as [number, number],
  z: {
    meaning: 'relative depth estimated by the model',
    smallerIsCloserToCamera: true,
    scaleRelativeTo: 'x',
  },
  mirrored: false,
  previewMirrored: true,
} as const;

export type LandmarkKind = 'pose' | 'face' | 'hand';

export interface LandmarkPoint {
  index: number;
  x: number;
  y: number;
  z: number;
  visibility: number | null;
  visible: boolean;
}

export interface HandednessInfo {
  handedness: string;
  score: number;
}

export interface TrackedLandmarkSet {
  detected: boolean;
  landmarks: LandmarkPoint[];
}

export interface PoseObservationFrame {
  version: 1;
  relativeTimeMs: number;
  mediaTimestampMs: number;
  coordinateSystem: typeof COORDINATE_SYSTEM;
  body: TrackedLandmarkSet;
  face: TrackedLandmarkSet;
  hands: {
    detected: boolean;
    landmarks: LandmarkPoint[][];
    handedness: HandednessInfo[];
  };
}

export interface PoseLandmarkRecorderOptions {
  wasmRoot?: string;
  poseModel?: string;
  faceModel?: string;
  handModel?: string;
  numPoses?: number;
  numFaces?: number;
  numHands?: number;
  visibilityThreshold?: number;
  enabled?: {
    pose?: boolean;
    face?: boolean;
    hand?: boolean;
  };
}

export type PoseObservationSubscriber = (frame: PoseObservationFrame) => void;

function toLandmarkPoint(landmark: { x: number; y: number; z: number; visibility?: number }, index: number, kind: LandmarkKind, threshold: number): LandmarkPoint {
  if (kind === 'pose' && Number.isFinite(landmark.visibility)) {
    const visibility = landmark.visibility ?? 0;
    return {
      index,
      x: landmark.x,
      y: landmark.y,
      z: landmark.z,
      visibility,
      visible: visibility >= threshold,
    };
  }
  return {
    index,
    x: landmark.x,
    y: landmark.y,
    z: landmark.z,
    visibility: null,
    visible: true,
  };
}

export class PoseLandmarkRecorder {
  private readonly wasmRoot: string;
  private readonly poseModel: string;
  private readonly faceModel: string;
  private readonly handModel: string;
  private readonly numPoses: number;
  private readonly numFaces: number;
  private readonly numHands: number;
  private readonly visibilityThreshold: number;
  private readonly enabled: { pose: boolean; face: boolean; hand: boolean };

  private poseLandmarker?: PoseLandmarker;
  private faceLandmarker?: FaceLandmarker;
  private handLandmarker?: HandLandmarker;
  private readonly subscribers = new Set<PoseObservationSubscriber>();

  private running = false;
  private frameId = 0;
  private video?: HTMLVideoElement;
  private sessionStartedAt = 0;
  private lastMediaTimestamp = 0;
  private emittedFrames = 0;

  constructor(options: PoseLandmarkRecorderOptions = {}) {
    this.wasmRoot = options.wasmRoot ?? WASM_ROOT;
    this.poseModel = options.poseModel ?? POSE_MODEL;
    this.faceModel = options.faceModel ?? FACE_MODEL;
    this.handModel = options.handModel ?? HAND_MODEL;
    this.numPoses = options.numPoses ?? 1;
    this.numFaces = options.numFaces ?? 1;
    this.numHands = options.numHands ?? 2;
    this.visibilityThreshold = options.visibilityThreshold ?? DEFAULT_VISIBILITY_THRESHOLD;
    this.enabled = {
      pose: options.enabled?.pose ?? true,
      face: options.enabled?.face ?? true,
      hand: options.enabled?.hand ?? true,
    };
  }

  subscribe(subscriber: PoseObservationSubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }

  get isRunning(): boolean {
    return this.running;
  }

  get emittedFrameCount(): number {
    return this.emittedFrames;
  }

  async start(video: HTMLVideoElement): Promise<void> {
    if (this.running) return;
    this.video = video;

    try {
      const vision = await FilesetResolver.forVisionTasks(this.wasmRoot);
      const creators: Array<Promise<void>> = [];

      if (this.enabled.pose) {
        creators.push(PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: this.poseModel },
          runningMode: 'VIDEO',
          numPoses: this.numPoses,
        }).then((landmarker) => { this.poseLandmarker = landmarker; }));
      }
      if (this.enabled.face) {
        creators.push(FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: this.faceModel },
          runningMode: 'VIDEO',
          numFaces: this.numFaces,
          outputFaceBlendshapes: false,
        }).then((landmarker) => { this.faceLandmarker = landmarker; }));
      }
      if (this.enabled.hand) {
        creators.push(HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: this.handModel },
          runningMode: 'VIDEO',
          numHands: this.numHands,
        }).then((landmarker) => { this.handLandmarker = landmarker; }));
      }

      await Promise.all(creators);

      if (!this.video) {
        this.closeLandmarkers();
        return;
      }

      this.sessionStartedAt = performance.now();
      this.running = true;
      this.frameId = requestAnimationFrame(this.loop);
    } catch (error) {
      this.closeLandmarkers();
      throw error;
    }
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frameId);
    this.video = undefined;
    this.closeLandmarkers();
  }

  processFrame(now = performance.now()): PoseObservationFrame | null {
    if (!this.running || !this.video) return null;
    const video = this.video;
    if (video.readyState < HAVE_CURRENT_DATA) return null;

    const timestamp = now > this.lastMediaTimestamp ? now : this.lastMediaTimestamp + 1;
    this.lastMediaTimestamp = timestamp;

    const poseResult = this.poseLandmarker?.detectForVideo(video, timestamp);
    const faceResult = this.faceLandmarker?.detectForVideo(video, timestamp);
    const handResult = this.handLandmarker?.detectForVideo(video, timestamp);

    const frame: PoseObservationFrame = {
      version: 1,
      relativeTimeMs: timestamp - this.sessionStartedAt,
      mediaTimestampMs: timestamp,
      coordinateSystem: COORDINATE_SYSTEM,
      body: {
        detected: Boolean(poseResult?.landmarks.length),
        landmarks: poseResult?.landmarks[0]?.map((point, index) => (
          toLandmarkPoint(point, index, 'pose', this.visibilityThreshold)
        )) ?? [],
      },
      face: {
        detected: Boolean(faceResult?.faceLandmarks.length),
        landmarks: faceResult?.faceLandmarks[0]?.map((point, index) => (
          toLandmarkPoint(point, index, 'face', this.visibilityThreshold)
        )) ?? [],
      },
      hands: {
        detected: Boolean(handResult?.landmarks.length),
        landmarks: handResult?.landmarks.map((hand) => (
          hand.map((point, index) => toLandmarkPoint(point, index, 'hand', this.visibilityThreshold))
        )) ?? [],
        handedness: handResult?.handedness.map((categories) => {
          const top = categories[0];
          return {
            handedness: top?.categoryName ?? 'unknown',
            score: top?.score ?? 0,
          };
        }) ?? [],
      },
    };

    this.emittedFrames += 1;
    this.subscribers.forEach((subscriber) => subscriber(frame));
    return frame;
  }

  private loop = (): void => {
    if (!this.running) return;
    this.processFrame();
    if (this.running) {
      this.frameId = requestAnimationFrame(this.loop);
    }
  };

  private closeLandmarkers(): void {
    this.poseLandmarker?.close();
    this.faceLandmarker?.close();
    this.handLandmarker?.close();
    this.poseLandmarker = undefined;
    this.faceLandmarker = undefined;
    this.handLandmarker = undefined;
  }
}
