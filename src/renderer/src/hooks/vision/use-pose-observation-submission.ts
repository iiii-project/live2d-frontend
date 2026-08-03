import { useEffect, useRef, useState } from 'react';
import { useGroup } from '@/context/group-context';
import { useWebSocket } from '@/context/websocket-context';
import {
  LOCAL_POSE_MOTION_WINDOW,
  LOCAL_POSE_PROCESSING_COMPLETE,
  LOCAL_POSE_PROCESSING_STARTED,
  type LocalPoseMotionWindow,
} from './pose-observation-events';
import {
  submitPoseObservationWithRetry,
  type PoseObservationPayload,
} from './pose-observation-client';
import { motionToText } from './motion-to-text-client';

type PoseObservationSubmissionStatus =
  | 'idle'
  | 'sending'
  | 'retrying'
  | 'failed';

export function usePoseObservationSubmission() {
  const { baseUrl } = useWebSocket();
  const { selfUid } = useGroup();
  const [status, setStatus] = useState<PoseObservationSubmissionStatus>('idle');
  const activeRequestsRef = useRef(0);

  useEffect(() => {
    const submit = async (event: CustomEvent<LocalPoseMotionWindow>) => {
      if (!selfUid) {
        console.warn('[Pose] Motion window ignored: client UID is not ready');
        return;
      }

      const payload: PoseObservationPayload = {
        ...event.detail.summary,
        client_uid: selfUid,
      };
      window.dispatchEvent(new Event(LOCAL_POSE_PROCESSING_STARTED));
      activeRequestsRef.current += 1;
      setStatus('sending');

      try {
        payload.motion_description = await motionToText(baseUrl, event.detail.frames);
        console.info('[Pose] Sending observation with M2T description');
        await submitPoseObservationWithRetry(baseUrl, payload, () =>
          setStatus('retrying'),
        );
      } catch (error) {
        console.error('Failed to submit pose observation:', error);
        window.dispatchEvent(new Event(LOCAL_POSE_PROCESSING_COMPLETE));
        setStatus('failed');
      } finally {
        activeRequestsRef.current -= 1;
        if (activeRequestsRef.current === 0) {
          setStatus((currentStatus) =>
            currentStatus === 'failed' ? currentStatus : 'idle',
          );
        }
      }
    };

    const listener: EventListener = (event) => {
      void submit(event as CustomEvent<LocalPoseMotionWindow>);
    };
    window.addEventListener(LOCAL_POSE_MOTION_WINDOW, listener);
    return () =>
      window.removeEventListener(LOCAL_POSE_MOTION_WINDOW, listener);
  }, [baseUrl, selfUid]);

  return { poseObservationSubmissionStatus: status };
}
