import { useEffect } from 'react';
import { Box, Text } from '@chakra-ui/react';
import { FiCamera } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui/tooltip';
import { sidebarStyles } from './sidebar-styles';
import { useCameraPanel } from '@/hooks/sidebar/use-camera-panel';
import { useLocalPoseLandmarker } from '@/hooks/vision/use-local-pose-landmarker';
// ============================================================
// [暫時停用-手勢辨識] 為了單獨測試本機姿態 landmark 擷取，
// 暫時註解既有手勢辨識（wave/thumbs_up/smile/mouth_open/hug/heart）
// 與其後端事件送出。測試完成後還原下面註解即可重新啟用。
// ============================================================
// import { useLocalVisionRecognition } from '@/hooks/vision/use-local-vision-recognition';
// import { useVisionEventSubmission } from '@/hooks/vision/use-vision-event-submission';

// Reusable components
function LiveIndicator() {
  const { t } = useTranslation();

  return (
    <Box color="red.500" display="flex" alignItems="center" gap={2}>
      <Box w="8px" h="8px" borderRadius="full" bg="red.500" animation="pulse 2s infinite" />
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
  videoRef: React.RefObject<HTMLVideoElement>
  isStreaming: boolean
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
  // [暫時停用-手勢辨識] 見上方 import 註解說明，測試完還原即可。
  // const { isRecognizing, lastEvent } = useLocalVisionRecognition(videoRef, isStreaming);
  const { isTracking } = useLocalPoseLandmarker(videoRef, isStreaming);
  // const { visionEventSubmissionStatus } = useVisionEventSubmission();

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <Box {...sidebarStyles.cameraPanel.container}>
      <Box {...sidebarStyles.cameraPanel.header}>
        {isStreaming && <LiveIndicator />}
        {/* [暫時停用-手勢辨識] 見上方 import 註解說明，測試完還原即可。 */}
        {/* {isRecognizing && <Text fontSize="xs" color="green.300">{t('sidebar.visionReady')}</Text>} */}
        {isTracking && <Text fontSize="xs" color="teal.300">{t('sidebar.poseTracking')}</Text>}
        {/* {visionEventSubmissionStatus !== 'idle' && (
          <Text fontSize="xs" color={visionEventSubmissionStatus === 'failed' ? 'red.300' : 'yellow.300'}>
            {t(`sidebar.visionSubmission.${visionEventSubmissionStatus}`)}
          </Text>
        )} */}
      </Box>

      <Tooltip
        showArrow
        content={isStreaming ? t('footer.cameraStopping') : t('footer.cameraControl')}
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
              {/* [暫時停用-手勢辨識] 見上方 import 註解說明，測試完還原即可。 */}
              {/* {lastEvent && (
                <Text position="absolute" bottom={2} left={2} px={2} py={1} borderRadius="sm" bg="blackAlpha.700" color="white" fontSize="xs">
                  {t(`sidebar.visionEvents.${lastEvent}`)}
                </Text>
              )} */}
              {!isStreaming && <CameraPlaceholder />}
            </>
          )}
        </Box>
      </Tooltip>
    </Box>
  );
}

export default CameraPanel;
