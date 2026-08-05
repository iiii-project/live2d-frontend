import {
  createContext,
  useContext,
  useRef,
  useState,
  useMemo,
  useCallback,
  ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { toaster } from '@/components/ui/toaster';

/**
 * Camera configuration interface
 * @interface CameraConfig
 */
interface CameraConfig {
  width: number;
  height: number;
}

/**
 * Camera context state interface
 * @interface CameraContextState
 */
interface CameraContextState {
  isStreaming: boolean;
  stream: MediaStream | null;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  cameraConfig: CameraConfig;
  setCameraConfig: (config: CameraConfig) => void;
  videoRef: React.RefObject<HTMLVideoElement>;
}

/**
 * Default values and constants
 */
// 320x240 was too low-res for reliable face-landmark detection on some
// webcam drivers (particularly on Windows) — hand tracking survived on
// coarse finger shapes, but the 468 dense face points would drift onto
// background noise. 640x480 is still light enough for MediaPipe's WASM
// inference while giving the face model enough detail to lock on.
const DEFAULT_CAMERA_CONFIG: CameraConfig = {
  width: 640,
  height: 480,
};

/**
 * Create the camera context
 */
const CameraContext = createContext<CameraContextState | null>(null);

/**
 * Camera Provider Component
 * @param {Object} props - Provider props
 * @param {React.ReactNode} props.children - Child components
 */
export function CameraProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  // State management
  const [isStreaming, setIsStreaming] = useState(false);
  const [cameraConfig, setCameraConfig] = useState<CameraConfig>(
    DEFAULT_CAMERA_CONFIG,
  );
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Start camera stream
  const startCamera = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error(t('error.cameraApiNotSupported'));
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasCamera = devices.some((device) => device.kind === 'videoinput');
      if (!hasCamera) {
        throw new Error(t('error.noCameraFound'));
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: cameraConfig.width },
          height: { ideal: cameraConfig.height },
        },
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsStreaming(true);
    } catch (err) {
      console.error('Failed to start camera:', err);
      toaster.create({
        title: `${t('error.failedStartCamera')}: ${err}`,
        type: 'error',
        duration: 2000,
      });
      throw err;
    }
  }, [cameraConfig, t]);

  // Stop camera stream
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setIsStreaming(false);
      // stopStreamingToBackend();
    }
  }, []);

  // Memoized context value
  const contextValue = useMemo(
    () => ({
      isStreaming,
      stream: streamRef.current,
      startCamera,
      stopCamera,
      cameraConfig,
      setCameraConfig,
      videoRef,
    }),
    [isStreaming, startCamera, stopCamera, cameraConfig],
  );

  return (
    <CameraContext.Provider value={contextValue}>
      {children}
    </CameraContext.Provider>
  );
}

/**
 * Custom hook to use the camera context
 * @throws {Error} If used outside of CameraProvider
 */
export function useCamera() {
  const context = useContext(CameraContext);

  if (!context) {
    throw new Error('useCamera must be used within a CameraProvider');
  }

  return context;
}
