import React, { useState, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, UploadCloud, FileText, CheckCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface EmergencyGuideUploaderProps {
  onUploadSuccess?: (guideId: string) => void;
}

const EmergencyGuideUploader: React.FC<EmergencyGuideUploaderProps> = ({ onUploadSuccess }) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  // ドラッグ&ドロップエリアのイベントハンドラー
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      // 拡張子チェック
      const extension = file.name.toLowerCase().split('.').pop() || '';
      const allowedExtensions = ['pptx', 'ppt', 'xlsx', 'xls', 'pdf'];
      
      if (!allowedExtensions.includes(extension)) {
        toast({
          title: "未対応のファイル形式",
          description: "PowerPoint(.pptx, .ppt)、Excel(.xlsx, .xls)、またはPDF(.pdf)ファイルのみアップロード可能です",
          variant: "destructive",
        });
        return;
      }
      setSelectedFile(file);
    }
  };

  // クリックしてファイルを選択
  const handleFileSelectClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // ファイル選択ハンドラー
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const file = event.target.files[0];
      // 拡張子チェック
      const extension = file.name.toLowerCase().split('.').pop() || '';
      const allowedExtensions = ['pptx', 'ppt', 'xlsx', 'xls', 'pdf'];
      
      if (!allowedExtensions.includes(extension)) {
        toast({
          title: "未対応のファイル形式",
          description: "PowerPoint(.pptx, .ppt)、Excel(.xlsx, .xls)、またはPDF(.pdf)ファイルのみアップロード可能です",
          variant: "destructive",
        });
        return;
      }
      setSelectedFile(file);
    }
  };

  // アップロード処理
  const handleUpload = async () => {
    if (!selectedFile) {
      toast({
        title: "ファイルが選択されていません",
        description: "アップロードするファイルを選択してください",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      
      // 模擬的な進捗表示用のインターバル
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 500);
      
      const response = await fetch('/api/emergency-guide/process', {
        method: 'POST',
        body: formData,
      });
      
      clearInterval(progressInterval);
      
      if (!response.ok) {
        throw new Error('ファイルのアップロードに失敗しました');
      }
      
      const data = await response.json();
      
      if (data.success) {
        setUploadProgress(100);
        setUploadSuccess(true);
        
        toast({
          title: "アップロード成功",
          description: "ファイルが正常に処理されました",
        });
        
        if (onUploadSuccess) {
          onUploadSuccess(data.guideId);
        }
        
        // 数秒後にリセット
        setTimeout(() => {
          setSelectedFile(null);
          setUploadSuccess(false);
          setUploadProgress(0);
        }, 3000);
      } else {
        throw new Error(data.error || 'ファイル処理中にエラーが発生しました');
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "ファイルのアップロードに失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>応急復旧フロー編集</CardTitle>
        <CardDescription>PowerPoint、Excel、またはPDFファイルから応急復旧データを生成します</CardDescription>
      </CardHeader>
      <CardContent>
        {/* ファイル入力 (非表示) */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".pptx,.ppt,.xlsx,.xls,.pdf"
          className="hidden"
        />
        
        {/* ドラッグ&ドロップエリア */}
        <div
          className={`border-2 border-dashed rounded-lg p-8 mb-4 text-center cursor-pointer transition-colors ${
            selectedFile
              ? 'border-indigo-600 bg-indigo-50'
              : 'border-gray-300 hover:border-indigo-400 hover:bg-indigo-50'
          }`}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={handleFileSelectClick}
        >
          {selectedFile ? (
            <div className="flex flex-col items-center">
              <FileText className="h-10 w-10 text-indigo-600 mb-2" />
              <p className="text-indigo-700 font-medium">{selectedFile.name}</p>
              <p className="text-sm text-gray-500 mt-1">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <UploadCloud className="h-10 w-10 text-gray-400 mb-2" />
              <p className="text-gray-700">
                ファイルをドラッグ＆ドロップ
              </p>
              <p className="text-sm text-gray-500 mt-1">
                または<span className="text-indigo-600">クリックして選択</span>
              </p>
            </div>
          )}
        </div>
        
        {/* アップロード進捗 */}
        {(isUploading || uploadSuccess) && (
          <div className="mb-4">
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm font-medium text-gray-700">
                {uploadSuccess ? "完了" : "処理中..."}
              </span>
              <span className="text-sm font-medium text-gray-700">
                {uploadProgress}%
              </span>
            </div>
            <Progress value={uploadProgress} className="h-2" />
          </div>
        )}
        
        {/* アップロードボタン */}
        <Button
          className="w-full"
          onClick={handleUpload}
          disabled={!selectedFile || isUploading || uploadSuccess}
        >
          {isUploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              処理中...
            </>
          ) : uploadSuccess ? (
            <>
              <CheckCircle className="mr-2 h-4 w-4" />
              完了しました
            </>
          ) : (
            "アップロードして処理"
          )}
        </Button>
      </CardContent>
    </Card>
  );
};

export default EmergencyGuideUploader;