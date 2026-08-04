import { useEffect, useRef, useState } from 'react';
import {
  COORDINATE_SYSTEM,
  PoseLandmarkRecorder,
} from './pose-landmark-recorder';
import type { PoseObservationFrame } from './pose-landmark-recorder';
import { PoseObservationBuffer } from './pose-observation-summary';
import type { PoseObservationSummary } from './pose-observation-summary';
import {
  LOCAL_POSE_PROCESSING_COMPLETE,
  LOCAL_POSE_PROCESSING_STARTED,
  LOCAL_POSE_MOTION_WINDOW,
  type LocalPoseMotionWindow,
} from './pose-observation-events';

export const LOCAL_POSE_OBSERVATION = 'local-pose-observation';
export const LOCAL_POSE_OBSERVATION_SUMMARY = 'local-pose-observation-summary';

export function useLocalPoseLandmarker(
  videoRef: React.RefObject<HTMLVideoElement>,
  isStreaming: boolean,
) {
  const [isTracking, setIsTracking] = useState(false);
  const [lastObservation, setLastObservation] =
    useState<PoseObservationFrame | null>(null);
  const [observationCount, setObservationCount] = useState(0);
  const [lastSummary, setLastSummary] = useState<PoseObservationSummary | null>(
    null,
  );
  const [summaryCount, setSummaryCount] = useState(0);
  const recorderRef = useRef<PoseLandmarkRecorder | null>(null);
  const bufferRef = useRef(new PoseObservationBuffer());
  // Updated every detection frame (not just on completed observation
  // batches) so a debug overlay can draw live body/arm points without
  // waiting on React state or forcing a render per frame.
  const bodyLandmarksRef = useRef<Array<{ x: number; y: number }>>([]);

  useEffect(() => {
    if (!isStreaming) {
      recorderRef.current?.stop();
      recorderRef.current = null;
      bufferRef.current.reset();
      bodyLandmarksRef.current = [];
      setIsTracking(false);
      return undefined;
    }

    let cancelled = false;
    const recorder = new PoseLandmarkRecorder();
    recorderRef.current = recorder;
    bufferRef.current.reset();

    const unsubscribe = recorder.subscribe((frame) => {
      if (cancelled) return;
      bodyLandmarksRef.current = frame.body.detected ? frame.body.landmarks : [];
      setLastObservation(frame);
      setObservationCount((count) => count + 1);
      window.dispatchEvent(
        new CustomEvent<PoseObservationFrame>(LOCAL_POSE_OBSERVATION, {
          detail: frame,
        }),
      );
      const summary = bufferRef.current.push(frame);
      if (summary) {
        const completedFrames = bufferRef.current.takeCompletedFrames();
        setLastSummary(summary);
        setSummaryCount((count) => count + 1);
        window.dispatchEvent(
          new CustomEvent<PoseObservationSummary>(
            LOCAL_POSE_OBSERVATION_SUMMARY,
            { detail: summary },
          ),
        );
        console.info(
          '[Pose] Motion window ready:',
          completedFrames.length,
          'frames',
        );
        window.dispatchEvent(
          new CustomEvent<LocalPoseMotionWindow>(LOCAL_POSE_MOTION_WINDOW, {
            detail: {
              summary,
              frames: completedFrames,
            },
          }),
        );
      }
    });

    const pause = () => recorder.pause();
    const resume = () => recorder.resume();
    window.addEventListener(LOCAL_POSE_PROCESSING_STARTED, pause);
    window.addEventListener(LOCAL_POSE_PROCESSING_COMPLETE, resume);

    const start = async () => {
      try {
        const video = videoRef.current;
        if (!video) return;
        await recorder.start(video);
        if (!cancelled) setIsTracking(true);
      } catch (error) {
        console.error('Failed to initialize local pose landmarker:', error);
      }
    };
    void start();

    return () => {
      cancelled = true;
      unsubscribe();
      window.removeEventListener(LOCAL_POSE_PROCESSING_STARTED, pause);
      window.removeEventListener(LOCAL_POSE_PROCESSING_COMPLETE, resume);
      recorder.stop();
      if (recorderRef.current === recorder) recorderRef.current = null;
      bodyLandmarksRef.current = [];
      setIsTracking(false);
    };
  }, [isStreaming, videoRef]);

  return {
    isTracking,
    lastObservation,
    observationCount,
    lastSummary,
    summaryCount,
    coordinateSystem: COORDINATE_SYSTEM,
    bodyLandmarksRef,
  };
}
