import { useEffect, useRef } from 'react';
import { Box, Text } from '@chakra-ui/react';
import { FiCamera } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui/tooltip';
import { sidebarStyles } from './sidebar-styles';
import { useCameraPanel } from '@/hooks/sidebar/use-camera-panel';
import { useMediaCapture } from '@/hooks/utils/use-media-capture';
import { useWebSocket } from '@/context/websocket-context';
import { useGroup } from '@/context/group-context';
import { wsService } from '@/services/websocket-service';
import {
  VISION_OBSERVATION_VERSION,
  type VisionObservationMessage,
} from '@/hooks/vision/vision-observation-stream-contract';

const VISION_SAMPLING_INTERVAL_MS = 1_000;

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
  const { sendMessage } = useWebSocket();
  const { selfUid } = useGroup();
  const { captureCamera } = useMediaCapture();
  const observationInFlight = useRef(false);
  const sequence = useRef(0);

  useEffect(() => {
    if (!isStreaming) return undefined;

    const abortController = new AbortController();

    const observeCamera = async () => {
      if (!selfUid) return;
      if (observationInFlight.current) return;
      observationInFlight.current = true;

      try {
        const cameraFrame = await captureCamera(abortController.signal);
        if (cameraFrame) {
          const message: VisionObservationMessage = {
            type: 'vision-observation',
            version: VISION_OBSERVATION_VERSION,
            client_uid: selfUid,
            sequence: sequence.current++,
            captured_at_ms: Date.now(),
            sampling_interval_ms: VISION_SAMPLING_INTERVAL_MS,
            frame: {
              source: 'camera',
              data: cameraFrame,
              mime_type: 'image/jpeg',
            },
          };
          sendMessage(message);
        }
      } finally {
        observationInFlight.current = false;
      }
    };

    const stateSubscription = wsService.onStateChange((state) => {
      if (state === 'CLOSING' || state === 'CLOSED') abortController.abort();
    });
    void observeCamera();
    const intervalId = window.setInterval(
      () => void observeCamera(),
      VISION_SAMPLING_INTERVAL_MS,
    );

    return () => {
      window.clearInterval(intervalId);
      stateSubscription.unsubscribe();
      abortController.abort();
    };
  }, [captureCamera, isStreaming, selfUid, sendMessage]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <Box {...sidebarStyles.cameraPanel.container}>
      <Box {...sidebarStyles.cameraPanel.header}>
        {isStreaming && <LiveIndicator />}
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
              {!isStreaming && <CameraPlaceholder />}
            </>
          )}
        </Box>
      </Tooltip>
    </Box>
  );
}

export default CameraPanel;
