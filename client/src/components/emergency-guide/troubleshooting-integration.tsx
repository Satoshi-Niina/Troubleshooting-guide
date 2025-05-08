import React, { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import TroubleshootingEditor from './troubleshooting-editor';
import TroubleshootingViewer from './troubleshooting-viewer';

interface Step {
  id: string;
  title: string;
  content: string;
  imageUrl?: string;
}

interface TroubleshootingData {
  id: string;
  title: string;
  description: string;
  keywords: string[];
  createdAt: string;
  steps: Step[];
}

interface TroubleshootingIntegrationProps {
  id: string;
  onBack: () => void;
}

const TroubleshootingIntegration: React.FC<TroubleshootingIntegrationProps> = ({ id, onBack }) => {
  const { toast } = useToast();
  const [troubleshootingData, setTroubleshootingData] = useState<TroubleshootingData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // データのロード
  useEffect(() => {
    const fetchTroubleshootingData = async () => {
      try {
        setIsLoading(true);
        
        const response = await fetch(`/api/emergency-flow/detail/${id}`);
        
        if (!response.ok) {
          throw new Error(`データの取得に失敗しました (${response.status})`);
        }
        
        const result = await response.json();
        console.log("取得したトラブルシューティングデータ:", result);
        
        // APIレスポンスから適切なデータ構造を抽出
        let finalData: TroubleshootingData;
        
        if (result.data) {
          // トラブルシューティングデータがdataプロパティにある場合
          finalData = result.data;
        } else {
          // 直接データが返ってきた場合
          finalData = result;
        }
        
        // stepsがない場合はslidesから変換（バックエンドの互換性のため）
        if (!finalData.steps && finalData.slides) {
          finalData.steps = finalData.slides.map((slide: any) => ({
            id: slide.id || `slide-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            title: slide.title,
            content: slide.content,
            imageUrl: slide.imageUrl
          }));
        }
        
        // IDが設定されていない場合
        if (!finalData.id) {
          finalData.id = id;
        }
        
        setTroubleshootingData(finalData);
        setError(null);
      } catch (err) {
        console.error("トラブルシューティングデータ取得エラー:", err);
        setError(err instanceof Error ? err.message : "データの取得中にエラーが発生しました");
        toast({
          title: "データ取得エラー",
          description: err instanceof Error ? err.message : "データの取得中にエラーが発生しました",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };
    
    if (id) {
      fetchTroubleshootingData();
    }
  }, [id, toast]);

  // データの保存処理
  const handleSave = async (data: TroubleshootingData) => {
    try {
      const response = await fetch(`/api/emergency-flow/update-troubleshooting/${id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        throw new Error(`データの更新に失敗しました (${response.status})`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        setTroubleshootingData(data);
        setIsEditMode(false);
        toast({
          title: "保存成功",
          description: "トラブルシューティングデータを更新しました",
        });
      } else {
        throw new Error(result.error || "データの更新に失敗しました");
      }
    } catch (err) {
      console.error("トラブルシューティング更新エラー:", err);
      toast({
        title: "保存エラー",
        description: err instanceof Error ? err.message : "データの保存中にエラーが発生しました",
        variant: "destructive",
      });
      throw err; // 呼び出し元で処理できるように例外を再スロー
    }
  };

  // ローディング中の表示
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4">データを読み込んでいます...</p>
        </div>
      </div>
    );
  }

  // エラー表示
  if (error || !troubleshootingData) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <div className="text-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-red-500 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h3 className="text-lg font-medium mt-4">エラーが発生しました</h3>
          <p className="text-gray-600 mt-2">{error || "データを読み込めませんでした"}</p>
          <button
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            onClick={onBack}
          >
            戻る
          </button>
        </div>
      </div>
    );
  }

  // 編集モードの場合
  if (isEditMode) {
    return (
      <TroubleshootingEditor
        data={troubleshootingData}
        onSave={handleSave}
        onCancel={() => setIsEditMode(false)}
      />
    );
  }

  // 表示モードの場合
  return (
    <TroubleshootingViewer
      data={troubleshootingData}
      onSave={handleSave}
      onBack={onBack}
    />
  );
};

export default TroubleshootingIntegration;