import { Box, Image } from '@chakra-ui/react';
import { memo, useEffect, useRef } from 'react';
import { canvasStyles } from './canvas-styles';
import { useCamera } from '@/context/camera-context';
import { useBgUrl } from '@/context/bgurl-context';

const Background = memo(({ children }: { children?: React.ReactNode }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const {
    stream, isStreaming, startCamera, stopCamera,
  } = useCamera();
  const { useCameraBackground, backgroundUrl } = useBgUrl();

  useEffect(() => {
    if (useCameraBackground) {
      // startCamera() already surfaces a toast on failure (camera-context.tsx).
      startCamera().catch(() => {});
    } else {
      stopCamera();
    }
  }, [useCameraBackground, startCamera, stopCamera]);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <Box {...canvasStyles.background.container}>
      {useCameraBackground ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            ...canvasStyles.background.video,
            display: isStreaming ? 'block' : 'none',
            transform: 'scaleX(-1)',
          }}
        />
      ) : (
        <Image
          {...canvasStyles.background.image}
          src={backgroundUrl}
          alt="background"
        />
      )}
      {children}
    </Box>
  );
});

Background.displayName = 'Background';

export default Background;
