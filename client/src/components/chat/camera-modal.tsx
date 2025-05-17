import { useState, useRef, useEffect } from "react";
import { useChat } from "@/context/chat-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  Camera, 
  VideoIcon, 
  X, 
  Square, 
  Pause, 
  Circle, 
  TabletSmartphone,
  RotateCcw
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useOrientation } from "@/hooks/use-orientation";

export default function CameraModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [isVideoMode, setIsVideoMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  // 常に背面カメラを使用する（切替機能なし）
  const [useBackCamera] = useState(true);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);
  
  const { captureImage, sendMessage } = useChat();
  const { toast } = useToast();
  const orientation = useOrientation();

  useEffect(() => {
    // Listen for open-camera event
    const handleOpenCamera = () => setIsOpen(true);
    window.addEventListener('open-camera', handleOpenCamera);
    
    return () => {
      window.removeEventListener('open-camera', handleOpenCamera);
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      // モーダルが開いたらカメラを起動
      // 少し遅延させることでステートの適用を確実にする
      setTimeout(() => {
        startCamera();
      }, 300);
    } else {
      // モーダルが閉じたらカメラを停止
      stopCamera();
    }
  }, [isOpen]);

  const startCamera = async () => {
    try {
      // ストリームが既に存在する場合は停止
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      
      console.log('カメラ開始: facingMode =', useBackCamera ? "environment" : "user");
      
      // カメラ制約を明示的に設定
      const constraints = { 
        video: { 
          facingMode: useBackCamera ? "environment" : "user",
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: isVideoMode 
      };
      
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      setStream(mediaStream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      toast({
        title: "カメラエラー",
        description: "カメラにアクセスできませんでした: " + (error instanceof Error ? error.message : String(error)),
        variant: "destructive",
      });
    }
  };
  
  // カメラ切り替え機能は削除（常に背面カメラのみを使用）

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    
    if (isRecording) {
      stopRecording();
    }
    
    setCapturedImage(null);
  };

  const handleCapture = () => {
    if (!videoRef.current) return;
    
    if (isVideoMode) {
      // Toggle video recording
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    } else {
      // Capture image
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      
      const ctx = canvas.getContext('2d');
      if (ctx && videoRef.current) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const imageData = canvas.toDataURL('image/jpeg');
        setCapturedImage(imageData);
      }
    }
  };

  const startRecording = () => {
    recordedChunksRef.current = [];
    
    if (stream) {
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/mp4' });
        const videoUrl = URL.createObjectURL(blob);
        setCapturedImage(videoUrl);
        setIsRecording(false);
      };
      
      mediaRecorder.start();
      setIsRecording(true);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
  };

  const handleSend = async () => {
    if (capturedImage) {
      const mediaType = isVideoMode ? 'video' : 'image';
      const mediaUrl = { type: mediaType, url: capturedImage };
      await sendMessage("", [mediaUrl]);
      setIsOpen(false);
      setCapturedImage(null);
    }
  };

  const toggleCameraMode = () => {
    if (isRecording) {
      stopRecording();
    }
    
    setIsVideoMode(!isVideoMode);
    setCapturedImage(null);
    
    // Restart camera with new settings
    stopCamera();
    setTimeout(() => startCamera(), 300);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className={`${orientation === 'landscape' ? 'max-w-3xl' : 'max-w-md'} p-0 overflow-hidden bg-blue-50 border border-blue-200 camera-modal`} aria-describedby="camera-modal-desc">
        <DialogTitle className="sr-only">カメラ</DialogTitle>
        <div id="camera-modal-desc" className="sr-only">写真や動画を撮影するためのカメラモーダル</div>
        <DialogHeader className="p-4 border-b border-blue-200 flex flex-row justify-between items-center bg-blue-100">
          <DialogTitle className="text-indigo-600 text-lg font-bold">カメラ起動</DialogTitle>
          <div className="flex items-center space-x-4">
            <div className="flex items-center bg-white px-2 py-1 rounded-full">
              <TabletSmartphone className="h-6 w-6 mr-2 text-indigo-600" />
              <Switch 
                id="camera-mode" 
                checked={isVideoMode}
                onCheckedChange={toggleCameraMode}
              />
              <VideoIcon className="h-6 w-6 ml-2 text-indigo-600" />
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              className="p-2 rounded-full hover:bg-blue-200 text-blue-700"
              onClick={() => setIsOpen(false)}
            >
              <X />
            </Button>
          </div>
        </DialogHeader>
        
        <div className="relative bg-black">
          {!capturedImage ? (
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              className={`w-full ${orientation === 'landscape' ? 'h-64' : 'h-80'} bg-neutral-800 object-cover`}
            />
          ) : (
            isVideoMode ? (
              <video 
                src={capturedImage} 
                controls 
                className={`w-full ${orientation === 'landscape' ? 'h-64' : 'h-80'} bg-neutral-800 object-contain`}
                onClick={() => window.dispatchEvent(new CustomEvent('preview-image', { detail: { url: capturedImage } }))}
              />
            ) : (
              <img 
                src={capturedImage} 
                alt="Captured" 
                className={`w-full ${orientation === 'landscape' ? 'h-64' : 'h-80'} bg-neutral-800 object-contain`}
                onClick={() => window.dispatchEvent(new CustomEvent('preview-image', { detail: { url: capturedImage } }))}
              />
            )
          )}
          
          {/* カメラ切り替えボタンは削除 - 常に背面カメラを使用 */}
          
          {/* Camera Controls - Different for Photo and Video modes */}
          {!capturedImage && (
            <div className="absolute bottom-4 left-0 right-0 flex justify-center space-x-4">
              {isVideoMode ? (
                // ビデオモードのコントロール
                <>
                  {isRecording ? (
                    <>
                      <Button 
                        className="bg-white rounded-full w-12 h-12 flex items-center justify-center shadow-lg"
                        variant="outline"
                        size="icon"
                        onClick={stopRecording}
                      >
                        <Pause className="h-6 w-6 text-blue-600" />
                      </Button>
                      <Button 
                        className="bg-red-500 rounded-full w-14 h-14 flex items-center justify-center shadow-lg"
                        variant="outline"
                        size="icon"
                        onClick={stopRecording}
                      >
                        <Square className="h-6 w-6 text-white" />
                      </Button>
                    </>
                  ) : (
                    <Button 
                      className="bg-blue-600 rounded-full w-16 h-16 flex items-center justify-center shadow-lg border-2 border-white"
                      variant="outline"
                      size="icon"
                      onClick={startRecording}
                    >
                      <Circle className="h-8 w-8 text-white" />
                    </Button>
                  )}
                </>
              ) : (
                // 写真モードのコントロール
                <Button 
                  className="bg-blue-600 rounded-full w-16 h-16 flex items-center justify-center shadow-lg border-2 border-white"
                  variant="outline"
                  size="icon"
                  onClick={handleCapture}
                >
                  <Circle className="h-12 w-12 text-white" />
                </Button>
              )}
            </div>
          )}
        </div>
        
        <div className="p-4 bg-blue-50">
          {capturedImage ? (
            <Button 
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium text-lg"
              onClick={handleSend}
            >
              送信する
            </Button>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-blue-700 font-medium">
                {isVideoMode ? 
                  (isRecording ? "録画中... 停止するには□をタップ" : "◎ をタップして録画開始") : 
                  "○ をタップして写真撮影"}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
