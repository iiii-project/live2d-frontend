import { useEffect, useRef } from 'react';
import { useLive2DConfig } from '@/context/live2d-config-context';
import { applyScale } from '@/hooks/canvas/use-live2d-resize';
import { LOCAL_VISION_EVENT } from './use-local-vision-recognition';
import type { LocalVisionEvent, DetectedLandmarks } from './use-local-vision-recognition';

// Per-hit-area cooldown so lingering a fingertip over "Head" doesn't spam
// the same reaction every frame (mirrors the per-event cooldown pattern
// already used for gesture/expression events).
const TOUCH_COOLDOWN_MS = 2_500;
// Move/resize are continuous states (held for as long as the gesture is
// held), so they get their own, slightly longer cooldown before the LLM is
// notified again about the same ongoing action.
const MOVE_RESIZE_COOLDOWN_MS = 3_000;
// MediaPipe hand landmark indices.
const WRIST = 0;
const INDEX_FINGERTIP = 8;

function hitAreaToEvent(hitAreaName: string): LocalVisionEvent {
  const lower = hitAreaName.toLowerCase();
  if (lower.includes('head')) return 'touch_head';
  if (lower.includes('body')) return 'touch_body';
  return 'touch_character';
}

function dispatchInteractionEvent(event: LocalVisionEvent) {
  window.dispatchEvent(new CustomEvent(LOCAL_VISION_EVENT, {
    detail: { event, timestamp: Date.now(), confidence: 1 },
  }));
}

// Absolute scale bounds for gesture-driven resizing. Kept narrower than
// use-live2d-resize.ts's wheel range (0.1-5.0) since a jittery gesture
// reading shouldn't be able to shrink the model to invisible or blow it up
// past the viewport in one bad frame.
const MIN_GESTURE_SCALE = 0.2;
const MAX_GESTURE_SCALE = 2.0;
// Normalized (0-1, camera-frame-relative) wrist-to-wrist distance range
// this maps from. Tune these if spreading your arms fully doesn't reach
// MAX_GESTURE_SCALE, or a shoulder-width gap already maxes it out.
const MIN_SPREAD_DISTANCE = 0.15;
const MAX_SPREAD_DISTANCE = 0.9;

/**
 * Lets the user's hands directly control the Live2D character:
 *  - One hand making a fist ("Closed_Fist") drags the model to follow it.
 *  - Both hands open ("Open_Palm") and spread apart/together scales it.
 *  - A fingertip touching a named hit area (e.g. "Head") triggers the same
 *    tap reaction a mouse click would (see LAppAdapter.hitTest/startTapMotion).
 *
 * Requires the camera to be shown as the Live2D background (interaction
 * mode) so the Live2D canvas and the camera's on-screen rect coincide —
 * otherwise a hand position from a small camera preview has no meaningful
 * relationship to where the character is drawn.
 */
export function useHandLive2DInteraction(
  videoRef: React.RefObject<HTMLVideoElement>,
  landmarksRef: React.RefObject<DetectedLandmarks>,
  gestureNamesRef: React.RefObject<string[]>,
  enabled: boolean,
) {
  const { modelInfo } = useLive2DConfig();
  const lastTriggerAtByAreaRef = useRef<Record<string, number>>({});
  const lastNotifyAtByTypeRef = useRef<Partial<Record<LocalVisionEvent, number>>>({});
  const tapMotionsRef = useRef(modelInfo?.tapMotions);
  tapMotionsRef.current = modelInfo?.tapMotions;

  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;
    let frameId = 0;

    const tick = () => {
      try {
        const video = videoRef.current;
        const adapter = (window as any).getLAppAdapter?.();
        const canvasRect = adapter?.getCanvasRect?.();
        const hands = landmarksRef.current?.hands ?? [];
        const gestureNames = gestureNamesRef.current ?? [];

        if (
          video && adapter && canvasRect
          && video.videoWidth && video.videoHeight
          && hands.length
        ) {
          const { width, height } = canvasRect;
          // Same "object-fit: cover" + mirror math as the debug overlay:
          // the camera background and the Live2D canvas fill the same rect.
          const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
          const scaledWidth = video.videoWidth * scale;
          const scaledHeight = video.videoHeight * scale;
          const offsetX = (width - scaledWidth) / 2;
          const offsetY = (height - scaledHeight) / 2;
          const toClient = (point: { x: number; y: number }) => ({
            x: canvasRect.left + width - (point.x * scaledWidth + offsetX),
            y: canvasRect.top + point.y * scaledHeight + offsetY,
          });

          const openHands = hands.filter((_, i) => gestureNames[i] === 'Open_Palm');
          const fistIndex = gestureNames.findIndex((name) => name === 'Closed_Fist');

          const notify = (event: LocalVisionEvent, cooldownMs: number) => {
            const now = performance.now();
            const lastAt = lastNotifyAtByTypeRef.current[event] ?? -Infinity;
            if (now - lastAt < cooldownMs) return;
            lastNotifyAtByTypeRef.current[event] = now;
            dispatchInteractionEvent(event);
          };

          if (openHands.length >= 2) {
            // --- Scale: distance between the two outermost open hands ---
            const [a, b] = [openHands[0][WRIST], openHands[openHands.length - 1][WRIST]];
            const spread = Math.hypot(a.x - b.x, a.y - b.y);
            const ratio = (spread - MIN_SPREAD_DISTANCE) / (MAX_SPREAD_DISTANCE - MIN_SPREAD_DISTANCE);
            const targetScale = MIN_GESTURE_SCALE + Math.min(1, Math.max(0, ratio))
              * (MAX_GESTURE_SCALE - MIN_GESTURE_SCALE);
            applyScale(targetScale);
            notify('resize_character', MOVE_RESIZE_COOLDOWN_MS);
          } else if (fistIndex !== -1) {
            // --- Move: drag the model to follow a closed fist ---
            const wrist = hands[fistIndex]?.[WRIST];
            if (wrist) {
              const client = toClient(wrist);
              const modelPos = adapter.screenToModel(client.x, client.y);
              if (modelPos) {
                adapter.setModelPosition(modelPos.x, modelPos.y);
                notify('move_character', MOVE_RESIZE_COOLDOWN_MS);
              }
            }
          }

          // --- Tap reactions: fingertip touching a named hit area ---
          // Skip hands currently busy moving/scaling the model so dragging
          // it across its own hit area doesn't also fire a tap reaction.
          for (let i = 0; i < hands.length; i += 1) {
            if (gestureNames[i] === 'Closed_Fist' || gestureNames[i] === 'Open_Palm') continue;
            const fingertip = hands[i][INDEX_FINGERTIP];
            if (!fingertip) continue;

            const client = toClient(fingertip);
            const hitAreaName = adapter.hitTest(client.x, client.y);
            if (!hitAreaName) continue;

            const now = performance.now();
            const lastAt = lastTriggerAtByAreaRef.current[hitAreaName] ?? -Infinity;
            if (now - lastAt < TOUCH_COOLDOWN_MS) continue;
            lastTriggerAtByAreaRef.current[hitAreaName] = now;

            // Let the LLM know it was touched even if this model has no
            // configured tap motion (visual reaction is best-effort; the
            // conversational reaction shouldn't depend on it).
            dispatchInteractionEvent(hitAreaToEvent(hitAreaName));

            const tapMotions = tapMotionsRef.current;
            if (tapMotions) adapter.startTapMotion(hitAreaName, tapMotions);
          }
        }
      } catch (error) {
        console.error('Hand/Live2D interaction frame failed:', error);
      }
      if (!cancelled) frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      lastTriggerAtByAreaRef.current = {};
      lastNotifyAtByTypeRef.current = {};
    };
  }, [enabled, videoRef, landmarksRef, gestureNamesRef]);
}
