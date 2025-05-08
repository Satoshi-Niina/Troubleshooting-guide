import React, { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import EmergencyGuideUploader from "@/components/emergency-guide/emergency-guide-uploader";
import EmergencyGuideEdit from "@/components/emergency-guide/emergency-guide-edit";
import EmergencyFlowCreator from "@/components/emergency-guide/emergency-flow-creator";
import KeywordSuggestions from "@/components/emergency-guide/keyword-suggestions";
import { Helmet } from "react-helmet";
import { Button } from "@/components/ui/button";

const EmergencyGuidePage: React.FC = () => {
  // URLからクエリパラメータを取得
  const getQueryParam = (name: string): string | null => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
  };

  // 初期タブをURLから設定
  const initialTab = getQueryParam('tab') || "edit";
  const [activeTab, setActiveTab] = useState(initialTab);
  const [targetGuideId, setTargetGuideId] = useState<string | null>(
    getQueryParam('guideId')
  );
  const [lastUploadedGuideId, setLastUploadedGuideId] = useState<string | null>(
    null,
  );
  
  // 検索機能の状態
  const [searchQuery, setSearchQuery] = useState<string>("");

  // タブ切り替えイベントのリスナー
  useEffect(() => {
    const handleSwitchToFlowTab = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail && customEvent.detail.guideId) {
        setTargetGuideId(customEvent.detail.guideId);
        setActiveTab("flow");
      }
    };

    window.addEventListener('switch-to-flow-tab', handleSwitchToFlowTab as EventListener);
    return () => {
      window.removeEventListener('switch-to-flow-tab', handleSwitchToFlowTab as EventListener);
    };
  }, []);

  // アップロード成功時のハンドラー
  const handleUploadSuccess = (guideId: string) => {
    setLastUploadedGuideId(guideId);
    // アップロード成功後に編集タブに切り替え
    setActiveTab("edit");
  };
  
  // 検索キーワードがクリックされたときのハンドラー
  const handleKeywordClick = (keyword: string) => {
    setSearchQuery(keyword);
    // ここで実際に検索を実行する処理を呼び出す
    console.log(`検索キーワード「${keyword}」がクリックされました`);
    
    // 検索を実行
    executeSearch(keyword);
  };
  
  // 検索を実行する関数
  const executeSearch = (keyword: string) => {
    if (!keyword.trim()) return;
    
    console.log(`検索実行: 「${keyword}」`);
    
    // 編集タブに切り替え（検索結果表示のため）
    setActiveTab("edit");
    
    // キーワードをカスタムイベントで通知
    window.dispatchEvent(new CustomEvent('search-emergency-guide', { 
      detail: { keyword }
    }));
  };

  return (
    <div className="w-full h-screen overflow-hidden p-4">
      <Helmet>
        <title>応急処置フロー生成 | 保守用車支援システム</title>
      </Helmet>

      <div className="mb-4">
        <h1 className="text-2xl font-bold text-blue-800 mb-2">
          応急処置フロー生成
        </h1>
        
        {/* キーワード検索のみ表示 */}
        <div className="mt-4 space-y-2">
          <KeywordSuggestions onKeywordClick={handleKeywordClick} />
        </div>
      </div>

      <Tabs
        defaultValue={activeTab}
        onValueChange={setActiveTab}
        className="w-full h-[calc(100vh-120px)]"
      >
        <TabsList className="grid w-full grid-cols-3 mb-8">
          <TabsTrigger value="upload">新規作成（アップロード）</TabsTrigger>
          <TabsTrigger value="edit">テキスト編集</TabsTrigger>
          <TabsTrigger value="flow">キャラクター編集</TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-4 h-full overflow-auto">
          <EmergencyGuideUploader onUploadSuccess={handleUploadSuccess} />
        </TabsContent>
        
        <TabsContent value="edit" className="space-y-4 h-full overflow-auto">
          <EmergencyGuideEdit />
        </TabsContent>

        <TabsContent value="flow" className="space-y-4 h-full overflow-auto">
          <EmergencyFlowCreator />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default EmergencyGuidePage;
