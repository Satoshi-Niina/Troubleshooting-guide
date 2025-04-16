import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import EmergencyGuideUploader from '@/components/emergency-guide/emergency-guide-uploader';
import EmergencyGuideEdit from '@/components/emergency-guide/emergency-guide-edit';
import { Helmet } from 'react-helmet';

const EmergencyGuidePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('edit');
  const [lastUploadedGuideId, setLastUploadedGuideId] = useState<string | null>(null);

  // アップロード成功時のハンドラー
  const handleUploadSuccess = (guideId: string) => {
    setLastUploadedGuideId(guideId);
    // アップロード成功後に編集タブに切り替え
    setActiveTab('edit');
  };

  return (
    <div className="container mx-auto p-6">
      <Helmet>
        <title>応急復旧フロー管理 | 保守用車支援システム</title>
      </Helmet>
      
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-blue-800 mb-2">応急復旧フロー管理</h1>
        <p className="text-gray-600">
          PowerPoint、Excel、PDFから生成されたデータファイルをアップロード、編集できます。
        </p>
      </div>

      <Tabs defaultValue={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-8">
          <TabsTrigger value="upload">新規作成（アップロード）</TabsTrigger>
          <TabsTrigger value="edit">フロー編集</TabsTrigger>
        </TabsList>
        
        <TabsContent value="upload" className="space-y-4">
          <EmergencyGuideUploader onUploadSuccess={handleUploadSuccess} />
        </TabsContent>
        
        <TabsContent value="edit" className="space-y-4">
          <EmergencyGuideEdit />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default EmergencyGuidePage;