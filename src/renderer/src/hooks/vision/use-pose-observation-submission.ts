import { useEffect, useRef, useState } from 'react';
import { useGroup } from '@/context/group-context';
import { useWebSocket } from '@/context/websocket-context';
import { LOCAL_POSE_OBSERVATION_SUMMARY } from './use-local-pose-landmarker';
import type { PoseObservationSummary } from './pose-observation-summary';
import {
  submitPoseObservationWithRetry,
  type PoseObservationPayload,
} from './pose-observation-client';

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
    const submit = async (event: CustomEvent<PoseObservationSummary>) => {
      if (!selfUid) return;

      const payload: PoseObservationPayload = {
        ...event.detail,
        client_uid: selfUid,
      };
      activeRequestsRef.current += 1;
      setStatus('sending');

      try {
        await submitPoseObservationWithRetry(baseUrl, payload, () =>
          setStatus('retrying'),
        );
      } catch (error) {
        console.error('Failed to submit pose observation:', error);
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
      void submit(event as CustomEvent<PoseObservationSummary>);
    };
    window.addEventListener(LOCAL_POSE_OBSERVATION_SUMMARY, listener);
    return () =>
      window.removeEventListener(LOCAL_POSE_OBSERVATION_SUMMARY, listener);
  }, [baseUrl, selfUid]);

  return { poseObservationSubmissionStatus: status };
}
