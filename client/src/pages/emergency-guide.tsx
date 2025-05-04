import React, { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import EmergencyGuideUploader from "@/components/emergency-guide/emergency-guide-uploader";
import EmergencyGuideEdit from "@/components/emergency-guide/emergency-guide-edit";
import EmergencyFlowCreator from "@/components/emergency-guide/emergency-flow-creator";
import KeywordSuggestions from "@/components/emergency-guide/keyword-suggestions";
import { Helmet } from "react-helmet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import EmergencyFlowEditor from "@/components/emergency-guide/emergency-flow-editor";
import { useToast } from "@/hooks/use-toast";

interface GeneratedOption {
  id: string;
  summary: string;
  content: string;
  images?: { url: string; description?: string }[];
  type?: '応急処置' | 'トラブルシューティング' | '予防保全' | 'その他';
  category?: string;
}

const EmergencyGuidePage: React.FC = () => {
  const { toast } = useToast();
  
  // URLからクエリパラメータを取得
  const getQueryParam = (name: string): string | null => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
  };

  // 初期タブをURLから設定
  const initialTab = getQueryParam('tab') || "basic";
  const [activeTab, setActiveTab] = useState(initialTab);
  const [targetGuideId, setTargetGuideId] = useState<string | null>(
    getQueryParam('guideId')
  );
  const [lastUploadedGuideId, setLastUploadedGuideId] = useState<string | null>(null);
  
  // フローデータの状態
  const [flowData, setFlowData] = useState<any>({
    title: '',
    description: '',
    nodes: [],
    edges: []
  });

  // 検索機能の状態
  const [searchQuery, setSearchQuery] = useState<string>("");
  
  // GPT生成結果の選択肢を管理
  const [generatedOptions, setGeneratedOptions] = useState<GeneratedOption[]>([]);
  
  // 生成中の状態を管理
  const [isGenerating, setIsGenerating] = useState(false);

  // 詳細表示の状態を管理
  const [expandedOptions, setExpandedOptions] = useState<string[]>([]);

  // 選択されたファイルのIDを管理
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);

  // ファイルの種類によるフィルタリング状態
  const [fileTypeFilter, setFileTypeFilter] = useState<string>('応急処置');

  // タブ切り替えイベントのリスナー
  useEffect(() => {
    const handleSwitchToFlowTab = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail && customEvent.detail.guideId) {
        setTargetGuideId(customEvent.detail.guideId);
        setActiveTab("character");
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
    setActiveTab("edit");
  };
  
  // 検索キーワードがクリックされたときのハンドラー
  const handleKeywordClick = (keyword: string) => {
    setSearchQuery(keyword);
    executeSearch(keyword);
  };
  
  // GPTによるフロー生成と選択肢の設定
  const executeSearch = async (query: string) => {
    if (!query.trim()) return;
    
    try {
      setIsGenerating(true);
      // GPT APIを呼び出してフローを生成
      const response = await fetch('/api/flow-generator/generate-flow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          query,
          options: {
            maxSteps: 5,
            includeImages: true,
            language: 'ja'
          }
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'フロー生成に失敗しました');
      }

      const data = await response.json();
      
      if (!data.success || !data.options || !Array.isArray(data.options)) {
        throw new Error('生成されたデータの形式が不正です');
      }
      
      setGeneratedOptions(data.options);
      
      toast({
        title: "フロー生成完了",
        description: "生成された選択肢から最適なフローを選択してください。",
      });
    } catch (error) {
      console.error('フロー生成エラー:', error);
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "フローの生成に失敗しました。",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // 選択肢が選ばれた時の処理
  const handleOptionSelect = (option: GeneratedOption) => {
    // 選択されたフローをデータとして設定
    setFlowData({
      ...flowData,
      title: `応急処理フロー: ${searchQuery}`,
      description: option.summary,
      content: option.content,
    });

    // テキスト編集タブに移動
    setActiveTab("edit");
    
    toast({
      title: "フロー選択完了",
      description: "テキスト編集タブでフローを編集できます。",
    });
  };

  const handleSaveFlow = (flowData: any) => {
    console.log('Saving flow data:', flowData);
    // 保存処理の実装
    toast({
      title: "保存完了",
      description: "フローが正常に保存されました。",
    });
  };

  const handleCancelFlow = () => {
    console.log('Canceling flow edit');
    setActiveTab("basic");
    toast({
      title: "編集キャンセル",
      description: "フローの編集をキャンセルしました。",
    });
  };

  // 詳細表示の切り替え
  const toggleOptionDetails = (optionId: string) => {
    setExpandedOptions(prev => 
      prev.includes(optionId)
        ? prev.filter(id => id !== optionId)
        : [...prev, optionId]
    );
  };

  // プレビューの最初の3行を取得
  const getPreviewContent = (content: string) => {
    return content.split('\n').slice(0, 3).join('\n');
  };

  // ファイルの選択を切り替え
  const toggleFileSelection = (fileId: string) => {
    setSelectedFileIds(prev => 
      prev.includes(fileId)
        ? prev.filter(id => id !== fileId)
        : [...prev, fileId]
    );
  };

  // 選択したファイルを保存
  const handleSaveSelectedFiles = async () => {
    if (selectedFileIds.length === 0) {
      toast({
        title: "選択エラー",
        description: "保存するファイルを選択してください。",
        variant: "destructive",
      });
      return;
    }

    try {
      // 選択されたフローデータを取得
      const selectedFlows = generatedOptions.filter(option => selectedFileIds.includes(option.id));
      console.log('選択されたフロー:', selectedFlows);
      
      // 各フローを保存
      for (const flow of selectedFlows) {
        const flowId = `flow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const flowData = {
          id: flowId,
          title: `応急処理フロー: ${searchQuery}`,
          description: flow.summary,
          content: flow.content,
          type: flow.type || '応急処置',
          images: flow.images || [],
          savePath: 'C:/Users/Satoshi Niina/OneDrive/Desktop/Troubleshooting-guide/knowledge-base/troubleshooting',
          nodes: [],
          edges: []
        };

        console.log('保存するフローデータ:', flowData);

        const response = await fetch('/api/emergency-flow/save-flow', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(flowData),
        });

        const responseData = await response.json();
        console.log('サーバーからの応答:', responseData);

        if (!response.ok) {
          throw new Error(responseData.error || '保存に失敗しました');
        }
      }

      toast({
        title: "保存完了",
        description: `${selectedFileIds.length}件のフローを保存しました。`,
      });
      
      // 選択をクリア
      setSelectedFileIds([]);
      // 生成された選択肢をクリア
      setGeneratedOptions([]);
    } catch (error) {
      console.error('保存エラー:', error);
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "フローの保存に失敗しました。",
        variant: "destructive",
      });
    }
  };

  // ファイルの種類に基づくフィルタリング
  const getFilteredOptions = (options: GeneratedOption[]) => {
    if (fileTypeFilter === 'all') return options;
    return options.filter(option => option.type === fileTypeFilter);
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
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-3 mb-8">
          <TabsTrigger value="basic">応急処理基本フロー作成</TabsTrigger>
          <TabsTrigger value="edit">テキスト編集</TabsTrigger>
          <TabsTrigger value="character">キャラクター編集</TabsTrigger>
        </TabsList>

        {/* 応急処理基本フロー作成タブ */}
        <TabsContent value="basic" className="space-y-4 overflow-y-auto max-h-[calc(100vh-200px)]">
          <Card className="p-6">
            <h2 className="text-xl font-bold mb-4">発生事象キーワード</h2>
            <div className="space-y-4">
              <div>
                <textarea
                  className="w-full h-24 p-3 border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="具体的な事象や状況、機器名などを入力してください！自動的に判断します。"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  maxLength={100}
                />
                <p className="text-sm text-gray-500 mt-2">
                  {searchQuery.length}/100文字
                </p>
              </div>
              <div className="flex gap-4">
                <Button 
                  className="flex-1"
                  onClick={() => {
                    // GPTを使用してフロー生成
                    executeSearch(searchQuery);
                    toast({
                      title: "フロー生成中",
                      description: "GPTを使用して応急処理フローを生成しています...",
                    });
                  }}
                  disabled={!searchQuery.trim()}
                >
                  GPTでフロー生成
                </Button>
                <Button 
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setSearchQuery('');
                    toast({
                      title: "キャンセル",
                      description: "入力をクリアしました",
                    });
                  }}
                >
                  キャンセル
                </Button>
              </div>
              <div className="mt-4 text-sm text-gray-600">
                <p>※ GPTを活用して入力された事象から自動的に応急処理フローを生成します。</p>
                <p className="mt-2">【生成から編集までの流れ】</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>1. キーワードを入力してGPTでフロー生成</li>
                  <li>2. 生成された選択肢から最適なフローを選択</li>
                  <li>3. 選択したフローを以下の方法で編集可能：</li>
                </ul>
                <ul className="list-disc pl-10 space-y-1 mt-1">
                  <li>「テキスト編集」タブ：フローの内容をテキストベースで編集</li>
                  <li>「キャラクター編集」タブ：フローチャートとして視覚的に編集</li>
                </ul>
              </div>
            </div>
          </Card>

          {/* GPT生成結果の選択UI */}
          {generatedOptions && generatedOptions.length > 0 && (
            <Card className="p-6 mt-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">
                  <span>生成された選択肢</span>
                  <span className="text-sm font-normal text-gray-500 ml-2">
                    ※ プレビューを確認して保存するフローを選択してください
                  </span>
                </h2>
                <div className="flex gap-4">
                  <select
                    className="border rounded-md px-3 py-1"
                    value={fileTypeFilter}
                    onChange={(e) => setFileTypeFilter(e.target.value)}
                  >
                    <option value="all">全てのタイプ</option>
                    <option value="応急処置">応急処置</option>
                    <option value="トラブルシューティング">トラブルシューティング</option>
                    <option value="予防保全">予防保全</option>
                    <option value="その他">その他</option>
                  </select>
                  <Button
                    onClick={handleSaveSelectedFiles}
                    disabled={selectedFileIds.length === 0}
                  >
                    選択したファイルを保存 ({selectedFileIds.length}件)
                  </Button>
                </div>
              </div>

              <div className="space-y-6">
                {getFilteredOptions(generatedOptions).map((option, index) => (
                  <div 
                    key={option.id} 
                    className={`border rounded-lg p-4 ${
                      selectedFileIds.includes(option.id) ? 'border-blue-500 bg-blue-50' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-start gap-4">
                        <input
                          type="checkbox"
                          checked={selectedFileIds.includes(option.id)}
                          onChange={() => toggleFileSelection(option.id)}
                          className="mt-1.5 w-6 h-6 cursor-pointer"
                          style={{
                            transform: 'scale(1.2)',
                            transformOrigin: 'left center',
                            border: '2px solid #666'
                          }}
                        />
                        <div>
                          <h3 className="font-medium text-lg">
                            選択肢 {index + 1}
                            {option.type && (
                              <span className="ml-2 text-sm px-2 py-1 bg-gray-100 rounded-full">
                                {option.type}
                              </span>
                            )}
                          </h3>
                          <p className="text-gray-600 mt-1">{option.summary}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => toggleOptionDetails(option.id)}
                          variant="ghost"
                          size="sm"
                          className="text-blue-600 hover:text-blue-800"
                        >
                          {expandedOptions.includes(option.id) ? '詳細を隠す' : '詳細を表示'}
                        </Button>
                      </div>
                    </div>
                    
                    {/* フロープレビュー */}
                    <div className="mt-4 bg-gray-50 rounded-md p-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">フロープレビュー</h4>
                      <div className="space-y-3">
                        {(expandedOptions.includes(option.id) 
                          ? option.content.split('\n')
                          : option.content.split('\n').slice(0, 3)
                        ).map((line, lineIndex) => (
                          line.trim() && (
                            <div 
                              key={lineIndex} 
                              className="flex items-start"
                            >
                              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center text-sm mr-3">
                                {lineIndex + 1}
                              </div>
                              <p className="text-gray-700">{line}</p>
                            </div>
                          )
                        ))}
                        {!expandedOptions.includes(option.id) && option.content.split('\n').length > 3 && (
                          <div className="text-center pt-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleOptionDetails(option.id)}
                              className="text-blue-600 hover:text-blue-800"
                            >
                              続きを表示 ({option.content.split('\n').length - 3} ステップ)
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 関連画像があれば表示 */}
                    {expandedOptions.includes(option.id) && option.images && option.images.length > 0 && (
                      <div className="mt-4">
                        <h4 className="text-sm font-medium text-gray-700 mb-2">関連画像</h4>
                        <div className="grid grid-cols-2 gap-4">
                          {option.images.map((image, imgIndex) => (
                            <div key={imgIndex} className="relative aspect-video">
                              <img
                                src={image.url}
                                alt={image.description || `関連画像 ${imgIndex + 1}`}
                                className="rounded-md object-cover w-full h-full"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* 生成中の表示 */}
          {isGenerating && (
            <Card className="p-6 mt-4">
              <div className="flex items-center justify-center space-x-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800"></div>
                <p className="text-gray-600">フローを生成中です...</p>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* テキスト編集タブ */}
        <TabsContent value="edit" className="space-y-4 h-[calc(100vh-300px)] overflow-auto">
          <Card className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">テキスト編集</h2>
              <select
                className="border rounded-md px-3 py-1"
                value={fileTypeFilter}
                onChange={(e) => setFileTypeFilter(e.target.value)}
              >
                <option value="all">全て表示</option>
                <option value="応急処置">応急処置フロー</option>
                <option value="トラブルシューティング">トラブルシューティング</option>
                <option value="予防保全">予防保全手順</option>
                <option value="その他">その他のフロー</option>
              </select>
            </div>
            <div className="mb-4">
              <p className="text-gray-600">
                保存されたフローの内容をテキストベースで編集できます。
              </p>
            </div>
            <EmergencyGuideEdit />
          </Card>
        </TabsContent>

        {/* キャラクター編集タブ */}
        <TabsContent value="character" className="space-y-4 h-[calc(100vh-300px)] overflow-auto">
          <Card className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">フローチャート編集</h2>
              <select
                className="border rounded-md px-3 py-1"
                value={fileTypeFilter}
                onChange={(e) => setFileTypeFilter(e.target.value)}
              >
                <option value="all">全て表示</option>
                <option value="応急処置">応急処置フローチャート</option>
                <option value="トラブルシューティング">診断フローチャート</option>
                <option value="予防保全">点検フローチャート</option>
                <option value="その他">その他のチャート</option>
              </select>
            </div>
            <div className="mb-6">
              <p className="text-gray-600 mb-4">
                フローチャートを視覚的に編集できます。既存のファイルからフローを生成することも可能です。
              </p>
              <EmergencyFlowCreator />
            </div>
          </Card>

          <div className="relative py-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-4 text-sm text-gray-500">または</span>
            </div>
          </div>

          <Card className="p-6">
            <h2 className="text-xl font-bold mb-4">既存ファイルからの生成</h2>
            <div className="mb-2">
              <p className="text-gray-600">
                PowerPoint、Excel、PDF、JSONファイルをアップロードしてフローチャートを生成・編集できます。
              </p>
            </div>
            <EmergencyGuideUploader onUploadSuccess={handleUploadSuccess} />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default EmergencyGuidePage;
