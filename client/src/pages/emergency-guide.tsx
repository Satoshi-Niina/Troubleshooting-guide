import React, { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import EmergencyGuideUploader from "@/components/emergency-guide/emergency-guide-uploader";
import EmergencyGuideEdit from "@/components/emergency-guide/emergency-guide-edit";
import EmergencyFlowCreator from "@/components/emergency-guide/emergency-flow-creator";
import { Helmet } from "react-helmet";

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

  return (
    <div className="w-full h-screen overflow-hidden p-4">
      <Helmet>
        <title>応急処置フロー生成 | 保守用車支援システム</title>
      </Helmet>

      <div className="mb-4">
        <h1 className="text-2xl font-bold text-blue-800 mb-2">
          応急処置フロー生成
        </h1>
        <p className="text-gray-600">
          PowerPoint、Excel、PDF、JSONファイルをアップロードして応急処置フローを生成・編集できます。
        </p>
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
