import { useEffect, useRef, useState } from 'react';
import {
  FaceLandmarker,
  FilesetResolver,
  GestureRecognizer,
} from '@mediapipe/tasks-vision';
import * as LAppDefine from '../../../WebSDK/src/lappdefine';

export const LOCAL_VISION_EVENT = 'local-vision-event';

export type LocalVisionEvent = 'wave' | 'thumbs_up' | 'smile' | 'mouth_open' | 'hug' | 'heart';

const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.0/wasm';
const GESTURE_MODEL = 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task';
const EVENT_COOLDOWN_MS = 2_500;

function expressionConfidence(categories: Array<{ categoryName: string; score: number }> | undefined, names: string[]) {
  return Math.min(...names.map((name) => categories?.find((category) => category.categoryName === name)?.score ?? 0));
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
  const lastEventAtRef = useRef(0);
  const previousWristRef = useRef<{ x: number; at: number } | null>(null);

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
      if (now - lastEventAtRef.current < EVENT_COOLDOWN_MS) return;

      lastEventAtRef.current = now;
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
      const gestureNames = gestureResult?.gestures.map((categories) => categories[0]?.categoryName ?? '') ?? [];
      const gestureName = gestureNames[0];
      const gestureConfidence = gestureResult?.gestures[0]?.[0]?.score ?? 0;

      if (isHeart(hands)) {
        emit('heart', 1 - Math.max(distance(hands[0][4], hands[1][4]), distance(hands[0][8], hands[1][8])));
      } else if (isHug(hands, gestureNames)) {
        emit('hug', Math.min(...gestureResult!.gestures.slice(0, 2).map((categories) => categories[0]?.score ?? 0)));
      } else if (gestureName === 'Thumb_Up') {
        emit('thumbs_up', gestureConfidence);
      } else {
        const wrist = gestureResult?.landmarks[0]?.[0];
        const previousWrist = previousWristRef.current;
        if (gestureName === 'Open_Palm' && wrist && previousWrist && now - previousWrist.at < 700 && Math.abs(wrist.x - previousWrist.x) > 0.06) {
          emit('wave', gestureConfidence);
        }
        if (wrist) previousWristRef.current = { x: wrist.x, at: now };
      }

      const blendshapes = faceResult?.faceBlendshapes[0]?.categories;
      const smileConfidence = expressionConfidence(blendshapes, ['mouthSmileLeft', 'mouthSmileRight']);
      const mouthOpenConfidence = expressionConfidence(blendshapes, ['jawOpen']);
      if (smileConfidence >= 0.5) {
        emit('smile', smileConfidence);
      } else if (mouthOpenConfidence >= 0.5) {
        emit('mouth_open', mouthOpenConfidence);
      }
    };

    const loop = () => {
      detect();
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
      setIsRecognizing(false);
    };
  }, [isStreaming, videoRef]);

  return { isRecognizing, lastEvent };
}
