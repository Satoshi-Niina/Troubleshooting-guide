import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Save, X, FileEdit } from 'lucide-react';

interface TroubleshootingTextEditorProps {
  flowId: string;
  onSave: () => void;
  onCancel: () => void;
}

const TroubleshootingTextEditor: React.FC<TroubleshootingTextEditorProps> = ({
  flowId,
  onSave,
  onCancel
}) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [flowData, setFlowData] = useState<any>(null);
  const [editedContent, setEditedContent] = useState('');

  useEffect(() => {
    // フローデータの読み込み
    const loadFlowData = async () => {
      try {
        // メインのフローファイルを読み込む
        const response = await fetch(`/api/tech-support/flows/${flowId}`);
        if (!response.ok) throw new Error('フローデータの読み込みに失敗しました');
        
        const data = await response.json();

        // データを統合
        const consolidatedData = {
          ...data,
          metadata: {
            createdAt: data.metadata?.createdAt || new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            filePath: data.metadata?.filePath || `flow_${flowId}.json`,
            fileName: data.metadata?.fileName || `flow_${flowId}.json`,
            nodeCount: data.nodes?.length || 0,
            edgeCount: data.edges?.length || 0
          }
        };

        setFlowData(consolidatedData);
        setEditedContent(JSON.stringify(consolidatedData, null, 2));
        setLoading(false);
      } catch (error) {
        console.error('フローデータ読み込みエラー:', error);
        toast({
          title: "エラー",
          description: "フローデータの読み込みに失敗しました",
          variant: "destructive",
        });
      }
    };

    if (flowId) {
      loadFlowData();
    } else {
      // 新規作成の場合は空のテンプレートを設定
      const template = {
        id: `flow_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
        title: "新規フロー",
        description: "",
        type: "応急処置",
        content: "",
        steps: [],
        metadata: {
          createdAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
          filePath: "",
          fileName: "",
          nodeCount: 0,
          edgeCount: 0
        }
      };
      setFlowData(template);
      setEditedContent(JSON.stringify(template, null, 2));
      setLoading(false);
    }
  }, [flowId]);

  const handleSave = async () => {
    try {
      setSaving(true);
      
      // JSONの妥当性チェック
      let parsedData;
      try {
        parsedData = JSON.parse(editedContent);
      } catch (error) {
        toast({
          title: "エラー",
          description: "JSONの形式が正しくありません",
          variant: "destructive",
        });
        return;
      }

      // 保存前にメタデータを更新
      parsedData.metadata = {
        ...parsedData.metadata,
        lastUpdated: new Date().toISOString()
      };

      // データの保存（単一ファイルとして保存）
      const response = await fetch(`/api/tech-support/flows/${flowId || parsedData.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...parsedData,
          saveAsSingleFile: true // バックエンドに単一ファイルとして保存することを指示
        }),
      });

      if (!response.ok) throw new Error('データの保存に失敗しました');

      toast({
        title: "保存完了",
        description: "フローデータを保存しました",
      });

      onSave();
    } catch (error) {
      console.error('保存エラー:', error);
      toast({
        title: "エラー",
        description: "データの保存に失敗しました",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-xl">フローデータ編集</CardTitle>
            <CardDescription>
              JSONフォーマットでフローデータを直接編集できます
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={saving}
            >
              <X className="h-4 w-4 mr-1" />
              キャンセル
            </Button>
            <Button
              variant="default"
              onClick={handleSave}
              disabled={saving}
            >
              <Save className="h-4 w-4 mr-1" />
              保存
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="font-medium mb-2 text-blue-700">
                <FileEdit className="h-4 w-4 inline-block mr-1" />
                テキスト編集モード
              </h3>
              <p className="text-sm text-blue-700">
                JSONフォーマットでフローデータを直接編集できます。
                編集後は必ず「保存」ボタンをクリックしてください。
              </p>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="flow-content">フローデータ (JSON)</Label>
              <Textarea
                id="flow-content"
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                className="font-mono text-sm"
                rows={20}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TroubleshootingTextEditor; 