import { useEffect, useRef, useState } from 'react';
import {
  FaceLandmarker,
  FilesetResolver,
  GestureRecognizer,
} from '@mediapipe/tasks-vision';
import * as LAppDefine from '../../../WebSDK/src/lappdefine';

export const LOCAL_VISION_EVENT = 'local-vision-event';

export type LocalVisionEvent =
  | 'wave'
  | 'thumbs_up'
  | 'thumbs_down'
  | 'victory'
  | 'love_you'
  | 'pointing_up'
  | 'fist'
  | 'hug'
  | 'heart'
  | 'smile'
  | 'mouth_open'
  | 'surprised'
  | 'sad'
  | 'angry'
  | 'wink'
  | 'kiss'
  | 'tongue_out'
  | 'eyebrow_raise';

export interface DetectedLandmarks {
  hands: Array<Array<{ x: number; y: number }>>;
  face: Array<{ x: number; y: number }> | null;
}

const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.0/wasm';
const GESTURE_MODEL = 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task';
const EVENT_COOLDOWN_MS = 2_500;
const GESTURE_CONFIDENCE_THRESHOLD = 0.6;

// MediaPipe's built-in gesture classes we forward directly as events.
// 'Open_Palm' is intentionally excluded here: it's reserved for the
// motion-based wave heuristic and the two-hand hug heuristic below.
const BUILTIN_GESTURE_EVENTS: Partial<Record<string, LocalVisionEvent>> = {
  Thumb_Up: 'thumbs_up',
  Thumb_Down: 'thumbs_down',
  Victory: 'victory',
  ILoveYou: 'love_you',
  Pointing_Up: 'pointing_up',
  Closed_Fist: 'fist',
};

type BlendshapeCategory = { categoryName: string; score: number };

function blendshapeScore(categories: BlendshapeCategory[] | undefined, name: string) {
  return categories?.find((category) => category.categoryName === name)?.score ?? 0;
}

function distance(first: { x: number; y: number }, second: { x: number; y: number }) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function isHeart(hands: Array<Array<{ x: number; y: number }>>) {
  if (hands.length < 2) return false;

  const [firstHand, secondHand] = hands;
  const wristDistance = distance(firstHand[0], secondHand[0]);
  return wristDistance > 0.1 && wristDistance < 0.7
    && distance(firstHand[4], secondHand[4]) < 0.2
    && distance(firstHand[8], secondHand[8]) < 0.2;
}

function isHug(hands: Array<Array<{ x: number; y: number }>>, gestureNames: string[]) {
  if (hands.length < 2 || !gestureNames.includes('Open_Palm')) return false;

  const [firstWrist, secondWrist] = [hands[0][0], hands[1][0]];
  return Math.abs(firstWrist.x - secondWrist.x) > 0.18 && Math.abs(firstWrist.y - secondWrist.y) < 0.35;
}

/**
 * Combines MediaPipe's 52 ARKit-style face blendshapes into a handful of
 * everyday expressions. Checked in priority order (most specific first) so
 * only one expression is reported per frame.
 */
function detectExpression(blendshapes: BlendshapeCategory[] | undefined): { event: LocalVisionEvent; confidence: number } | null {
  if (!blendshapes) return null;
  const score = (name: string) => blendshapeScore(blendshapes, name);

  const jawOpen = score('jawOpen');
  const browInnerUp = score('browInnerUp');
  const eyeWide = Math.min(score('eyeWideLeft'), score('eyeWideRight'));
  const browDown = Math.min(score('browDownLeft'), score('browDownRight'));
  const browOuterUp = Math.min(score('browOuterUpLeft'), score('browOuterUpRight'));
  const mouthFrown = Math.min(score('mouthFrownLeft'), score('mouthFrownRight'));
  const smile = Math.min(score('mouthSmileLeft'), score('mouthSmileRight'));
  const eyeBlinkLeft = score('eyeBlinkLeft');
  const eyeBlinkRight = score('eyeBlinkRight');
  const mouthPucker = score('mouthPucker');
  const tongueOut = score('tongueOut');

  if (jawOpen >= 0.4 && Math.max(browInnerUp, eyeWide) >= 0.4) {
    return { event: 'surprised', confidence: Math.min(jawOpen, Math.max(browInnerUp, eyeWide)) };
  }
  if (browDown >= 0.5 && smile < 0.2) {
    return { event: 'angry', confidence: browDown };
  }
  if (mouthFrown >= 0.4 && smile < 0.2) {
    return { event: 'sad', confidence: mouthFrown };
  }
  if (Math.abs(eyeBlinkLeft - eyeBlinkRight) > 0.5 && Math.max(eyeBlinkLeft, eyeBlinkRight) > 0.6) {
    return { event: 'wink', confidence: Math.max(eyeBlinkLeft, eyeBlinkRight) };
  }
  if (mouthPucker >= 0.5) {
    return { event: 'kiss', confidence: mouthPucker };
  }
  if (tongueOut >= 0.4) {
    return { event: 'tongue_out', confidence: tongueOut };
  }
  if (browOuterUp >= 0.5 && jawOpen < 0.2) {
    return { event: 'eyebrow_raise', confidence: browOuterUp };
  }
  if (smile >= 0.5) {
    return { event: 'smile', confidence: smile };
  }
  if (jawOpen >= 0.5) {
    return { event: 'mouth_open', confidence: jawOpen };
  }
  return null;
}

function playRandomGestureMotion() {
  const adapter = (window as any).getLAppAdapter?.();
  if (!adapter) return;

  const groups = adapter.getMotionGroups?.().filter((group: string) => adapter.getMotionCount(group) > 0) ?? [];
  const selectableGroups = groups.filter((group: string) => group !== 'Idle');
  const group = (selectableGroups.length ? selectableGroups : groups)[Math.floor(Math.random() * (selectableGroups.length || groups.length))];
  if (group === undefined) return;

  adapter.startMotion(group, Math.floor(Math.random() * adapter.getMotionCount(group)), LAppDefine.PriorityNormal);
}

export function useLocalVisionRecognition(videoRef: React.RefObject<HTMLVideoElement>, isStreaming: boolean) {
  const [lastEvent, setLastEvent] = useState<LocalVisionEvent | null>(null);
  const [isRecognizing, setIsRecognizing] = useState(false);
  // Cooldown is tracked per event type (not globally) so, e.g., a facial
  // expression firing doesn't suppress an unrelated hand gesture, and a
  // gesture switch registers immediately instead of waiting out the
  // previous gesture's cooldown.
  const lastEventAtByTypeRef = useRef<Partial<Record<LocalVisionEvent, number>>>({});
  const previousWristRef = useRef<{ x: number; at: number } | null>(null);
  // Updated every detection frame (not gated by the event cooldown) so a
  // debug overlay can draw the live points without forcing a React render.
  const landmarksRef = useRef<DetectedLandmarks>({ hands: [], face: null });

  useEffect(() => {
    if (!isStreaming) {
      setIsRecognizing(false);
      return undefined;
    }

    let cancelled = false;
    let frameId = 0;
    let gestureRecognizer: GestureRecognizer | undefined;
    let faceLandmarker: FaceLandmarker | undefined;

    const emit = (event: LocalVisionEvent, confidence: number) => {
      const now = performance.now();
      const lastEventAt = lastEventAtByTypeRef.current[event] ?? -Infinity;
      if (now - lastEventAt < EVENT_COOLDOWN_MS) return;

      lastEventAtByTypeRef.current[event] = now;
      setLastEvent(event);
      playRandomGestureMotion();
      window.dispatchEvent(new CustomEvent(LOCAL_VISION_EVENT, {
        detail: { event, timestamp: Date.now(), confidence },
      }));
    };

    const detect = () => {
      const video = videoRef.current;
      if (cancelled || !video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

      const now = performance.now();
      const gestureResult = gestureRecognizer?.recognizeForVideo(video, now);
      const faceResult = faceLandmarker?.detectForVideo(video, now);
      const hands = gestureResult?.landmarks ?? [];
      landmarksRef.current = {
        hands,
        face: faceResult?.faceLandmarks?.[0] ?? null,
      };
      const gestures = gestureResult?.gestures ?? [];
      const gestureNames = gestures.map((categories) => categories[0]?.categoryName ?? '');
      const gestureName = gestureNames[0];
      const gestureConfidence = gestures[0]?.[0]?.score ?? 0;
      const builtinEvent = gestureName ? BUILTIN_GESTURE_EVENTS[gestureName] : undefined;

      if (isHeart(hands)) {
        emit('heart', 1 - Math.max(distance(hands[0][4], hands[1][4]), distance(hands[0][8], hands[1][8])));
      } else if (isHug(hands, gestureNames)) {
        emit('hug', Math.min(...gestures.slice(0, 2).map((categories) => categories[0]?.score ?? 0)));
      } else if (builtinEvent && gestureConfidence >= GESTURE_CONFIDENCE_THRESHOLD) {
        emit(builtinEvent, gestureConfidence);
      } else {
        const wrist = hands[0]?.[0];
        const previousWrist = previousWristRef.current;
        if (gestureName === 'Open_Palm' && wrist && previousWrist && now - previousWrist.at < 700 && Math.abs(wrist.x - previousWrist.x) > 0.06) {
          emit('wave', gestureConfidence);
        }
        if (wrist) previousWristRef.current = { x: wrist.x, at: now };
      }

      const expression = detectExpression(faceResult?.faceBlendshapes?.[0]?.categories);
      if (expression) emit(expression.event, expression.confidence);
    };

    const loop = () => {
      try {
        detect();
      } catch (error) {
        // A single bad frame must never permanently stop the detection loop
        // (an uncaught throw here would stop requestAnimationFrame forever).
        console.error('Local vision detection frame failed:', error);
      }
      if (!cancelled) frameId = requestAnimationFrame(loop);
    };

    const start = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
        [gestureRecognizer, faceLandmarker] = await Promise.all([
          GestureRecognizer.createFromOptions(vision, {
            baseOptions: { modelAssetPath: GESTURE_MODEL },
            runningMode: 'VIDEO',
            numHands: 2,
          }),
          FaceLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: FACE_MODEL },
            runningMode: 'VIDEO',
            outputFaceBlendshapes: true,
            numFaces: 1,
          }),
        ]);
        if (cancelled) return;

        setIsRecognizing(true);
        frameId = requestAnimationFrame(loop);
      } catch (error) {
        console.error('Failed to initialize local vision recognition:', error);
      }
    };

    void start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      gestureRecognizer?.close();
      faceLandmarker?.close();
      previousWristRef.current = null;
      lastEventAtByTypeRef.current = {};
      landmarksRef.current = { hands: [], face: null };
      setIsRecognizing(false);
    };
  }, [isStreaming, videoRef]);

  return { isRecognizing, lastEvent, landmarksRef };
}
