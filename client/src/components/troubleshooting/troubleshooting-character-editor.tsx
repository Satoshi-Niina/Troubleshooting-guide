import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import TroubleshootingFileList from './troubleshooting-file-list';
import TroubleshootingTextEditor from './troubleshooting-text-editor';

interface TroubleshootingCharacterEditorProps {
  onSave?: () => void;
  onCancel?: () => void;
}

const TroubleshootingCharacterEditor: React.FC<TroubleshootingCharacterEditorProps> = ({
  onSave,
  onCancel
}) => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<string>('file-list');
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);

  // 編集モードへの切り替え
  const handleEdit = (flowId: string) => {
    setSelectedFlowId(flowId);
    setActiveTab('edit');
  };

  // 新規作成モードへの切り替え
  const handleNew = () => {
    setSelectedFlowId(null);
    setActiveTab('edit');
  };

  // 編集のキャンセル
  const handleCancel = () => {
    setSelectedFlowId(null);
    setActiveTab('file-list');
    if (onCancel) onCancel();
  };

  // 保存完了時の処理
  const handleSaved = () => {
    setSelectedFlowId(null);
    setActiveTab('file-list');
    if (onSave) onSave();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">キャラクター編集</CardTitle>
          <CardDescription>
            フローのキャラクターデータを編集します
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="file-list">ファイル一覧</TabsTrigger>
              <TabsTrigger value="edit" disabled={!selectedFlowId}>編集</TabsTrigger>
            </TabsList>

            <TabsContent value="file-list">
              <TroubleshootingFileList
                onEdit={handleEdit}
                onNew={handleNew}
              />
            </TabsContent>

            <TabsContent value="edit">
              {selectedFlowId && (
                <TroubleshootingTextEditor
                  flowId={selectedFlowId}
                  onSave={handleSaved}
                  onCancel={handleCancel}
                />
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default TroubleshootingCharacterEditor; 