import { useEffect, useRef } from 'react';
import { Box, Text } from '@chakra-ui/react';
import { FiCamera, FiZap } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui/tooltip';
import { sidebarStyles } from './sidebar-styles';
import { useCameraPanel } from '@/hooks/sidebar/use-camera-panel';
import { useBgUrl } from '@/context/bgurl-context';
import { useLocalVisionRecognition } from '@/hooks/vision/use-local-vision-recognition';
import type { DetectedLandmarks } from '@/hooks/vision/use-local-vision-recognition';
import { useVisionEventSubmission } from '@/hooks/vision/use-vision-event-submission';
import { useLocalPoseLandmarker } from '@/hooks/vision/use-local-pose-landmarker';
import { usePoseObservationSubmission } from '@/hooks/vision/use-pose-observation-submission';
import { useHandLive2DInteraction } from '@/hooks/vision/use-hand-live2d-interaction';

// 21-point MediaPipe hand landmark topology, used only to draw the debug skeleton.
const HAND_CONNECTIONS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];

// MediaPipe Pose landmark indices for the arms only (shoulder-elbow-wrist),
// used only to draw the debug skeleton.
const ARM_CONNECTIONS: Array<[number, number]> = [
  [11, 12], // shoulder to shoulder
  [11, 13], [13, 15], // left arm: shoulder-elbow-wrist
  [12, 14], [14, 16], // right arm: shoulder-elbow-wrist
];

// Reusable components
function LiveIndicator() {
  const { t } = useTranslation();

  return (
    <Box color="red.500" display="flex" alignItems="center" gap={2}>
      <Box
        w="8px"
        h="8px"
        borderRadius="full"
        bg="red.500"
        animation="pulse 2s infinite"
      />
      <Text fontSize="sm">{t('sidebar.live')}</Text>
    </Box>
  );
}

// Toggles the camera feed as the Live2D background so the VTuber renders in
// front of the user's own video, for body-driven interaction. Reuses the same
// camera session as gesture/pose detection (see camera-context.tsx), so
// turning this on also starts detection without opening a second stream.
function InteractionModeButton() {
  const { t } = useTranslation();
  const { useCameraBackground, setUseCameraBackground } = useBgUrl();

  return (
    <Tooltip
      showArrow
      content={
        useCameraBackground
          ? t('sidebar.interactionModeOff')
          : t('sidebar.interactionModeOn')
      }
    >
      <Box
        onClick={(event: React.MouseEvent) => {
          event.stopPropagation();
          setUseCameraBackground(!useCameraBackground);
        }}
        display="flex"
        alignItems="center"
        justifyContent="center"
        color={useCameraBackground ? 'yellow.300' : 'whiteAlpha.700'}
        cursor="pointer"
      >
        <FiZap size={16} />
      </Box>
    </Tooltip>
  );
}

function CameraPlaceholder() {
  const { t } = useTranslation();

  return (
    <Box
      position="absolute"
      display="flex"
      flexDirection="column"
      alignItems="center"
      gap={2}
    >
      <FiCamera size={24} />
      <Text color="whiteAlpha.600" fontSize="sm" textAlign="center">
        {t('footer.cameraControl')}
      </Text>
    </Box>
  );
}

function VideoStream({
  videoRef,
  isStreaming,
}: {
  videoRef: React.RefObject<HTMLVideoElement>;
  isStreaming: boolean;
}) {
  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      style={sidebarStyles.cameraPanel.video}
      {...(isStreaming ? {} : { display: 'none' })}
    />
  );
}

// Draws the live hand/face/arm detection points on top of the video so the
// user can confirm what MediaPipe is actually picking up, without re-running
// detection itself (it just reads the refs the recognition hooks already fill).
function LandmarkOverlay({
  videoRef,
  landmarksRef,
  bodyLandmarksRef,
  isStreaming,
}: {
  videoRef: React.RefObject<HTMLVideoElement>;
  landmarksRef: React.RefObject<DetectedLandmarks>;
  bodyLandmarksRef: React.RefObject<Array<{ x: number; y: number }>>;
  isStreaming: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!isStreaming) return undefined;

    let cancelled = false;
    let frameId = 0;

    const draw = () => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      const container = canvas?.parentElement;
      if (canvas && video && container && video.videoWidth && video.videoHeight) {
        const width = container.clientWidth;
        const height = container.clientHeight;
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        const ctx = canvas.getContext('2d');
        if (ctx && width && height) {
          ctx.clearRect(0, 0, width, height);

          // Replicate the video's `object-fit: cover` scaling so points line up.
          const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
          const scaledWidth = video.videoWidth * scale;
          const scaledHeight = video.videoHeight * scale;
          const offsetX = (width - scaledWidth) / 2;
          const offsetY = (height - scaledHeight) / 2;
          // Landmarks are in the raw (unmirrored) camera frame, but the video
          // preview is mirrored via CSS for a natural selfie view. Mirror the
          // x coordinate here directly instead of transforming the canvas, so
          // there's no separate CSS transform that could drift out of sync.
          const toPixel = (point: { x: number; y: number }) => ({
            x: width - (point.x * scaledWidth + offsetX),
            y: point.y * scaledHeight + offsetY,
          });

          const { hands, face } = landmarksRef.current ?? { hands: [], face: null };

          ctx.lineWidth = 2;
          ctx.strokeStyle = 'rgba(0, 229, 255, 0.85)';
          ctx.fillStyle = '#00e5ff';
          for (const hand of hands) {
            for (const [a, b] of HAND_CONNECTIONS) {
              const from = hand[a];
              const to = hand[b];
              if (!from || !to) continue;
              const p1 = toPixel(from);
              const p2 = toPixel(to);
              ctx.beginPath();
              ctx.moveTo(p1.x, p1.y);
              ctx.lineTo(p2.x, p2.y);
              ctx.stroke();
            }
            for (const point of hand) {
              const p = toPixel(point);
              ctx.beginPath();
              ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
              ctx.fill();
            }
          }

          if (face) {
            ctx.fillStyle = 'rgba(255, 235, 59, 0.9)';
            // 468 points is too dense to render individually at a visible size;
            // draw every 3rd point larger instead so the face is clearly visible.
            for (let i = 0; i < face.length; i += 3) {
              const point = face[i];
              const p = toPixel(point);
              ctx.beginPath();
              ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
              ctx.fill();
            }
          }

          const body = bodyLandmarksRef.current ?? [];
          if (body.length) {
            ctx.lineWidth = 2;
            ctx.strokeStyle = 'rgba(76, 217, 100, 0.85)';
            ctx.fillStyle = '#4cd964';
            for (const [a, b] of ARM_CONNECTIONS) {
              const from = body[a];
              const to = body[b];
              if (!from || !to) continue;
              const p1 = toPixel(from);
              const p2 = toPixel(to);
              ctx.beginPath();
              ctx.moveTo(p1.x, p1.y);
              ctx.lineTo(p2.x, p2.y);
              ctx.stroke();
            }
            for (const index of [11, 12, 13, 14, 15, 16]) {
              const point = body[index];
              if (!point) continue;
              const p = toPixel(point);
              ctx.beginPath();
              ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }
      if (!cancelled) frameId = requestAnimationFrame(draw);
    };

    frameId = requestAnimationFrame(draw);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
    };
  }, [isStreaming, videoRef, landmarksRef, bodyLandmarksRef]);

  if (!isStreaming) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    />
  );
}

// Main component
function CameraPanel(): JSX.Element {
  const { t } = useTranslation();
  const {
    videoRef,
    error,
    isHovering,
    isStreaming,
    stream,
    toggleCamera,
    handleMouseEnter,
    handleMouseLeave,
  } = useCameraPanel();
  const { landmarksRef, gestureNamesRef } = useLocalVisionRecognition(videoRef, isStreaming);
  useVisionEventSubmission();
  const { bodyLandmarksRef } = useLocalPoseLandmarker(videoRef, isStreaming);
  usePoseObservationSubmission();
  const { useCameraBackground } = useBgUrl();
  useHandLive2DInteraction(videoRef, landmarksRef, gestureNamesRef, isStreaming && useCameraBackground);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <Box {...sidebarStyles.cameraPanel.container}>
      <Box {...sidebarStyles.cameraPanel.header}>
        {isStreaming ? <LiveIndicator /> : <Box />}
        <InteractionModeButton />
      </Box>

      <Tooltip
        showArrow
        content={
          isStreaming ? t('footer.cameraStopping') : t('footer.cameraControl')
        }
        open={isHovering && !error}
      >
        <Box
          {...sidebarStyles.cameraPanel.videoContainer}
          onClick={toggleCamera}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          cursor="pointer"
          position="relative"
          _hover={{
            bg: 'whiteAlpha.100',
          }}
        >
          {error ? (
            <Text color="red.300" fontSize="sm" textAlign="center">
              {error}
            </Text>
          ) : (
            <>
              <VideoStream videoRef={videoRef} isStreaming={isStreaming} />
              <LandmarkOverlay
                videoRef={videoRef}
                landmarksRef={landmarksRef}
                bodyLandmarksRef={bodyLandmarksRef}
                isStreaming={isStreaming}
              />
              {!isStreaming && <CameraPlaceholder />}
            </>
          )}
        </Box>
      </Tooltip>
    </Box>
  );
}

export default CameraPanel;
