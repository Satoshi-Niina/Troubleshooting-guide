import React, { useState, useCallback, useRef, memo, useEffect } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  ConnectionMode,
  Panel,
  NodeTypes,
  ReactFlowProvider,
  Handle,
  Position,
  NodeProps,
  MarkerType
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Plus, Save, X, Check, Trash, Copy, Download, ArrowDown } from 'lucide-react';

// カスタムノードコンポーネント定義
const StartNode = memo(({ data }: NodeProps) => {
  return (
    <div className="px-4 py-2 shadow-md rounded-full bg-green-500 text-white min-w-[100px] text-center">
      <div className="font-bold">{data.label || '開始'}</div>
      
      {/* 出力ハンドルのみ */}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: '#555' }}
        isConnectable={true}
      />
    </div>
  );
});

const StepNode = memo(({ data }: NodeProps) => {
  return (
    <div className="px-4 py-2 shadow-md rounded-md bg-blue-100 border border-blue-500 min-w-[150px]">
      <div className="font-bold text-blue-800">{data.label || 'ステップ'}</div>
      {data.message && (
        <div className="mt-2 text-sm text-gray-700">{data.message}</div>
      )}
      
      {/* 入力と出力のハンドル */}
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: '#555' }}
        isConnectable={true}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: '#555' }}
        isConnectable={true}
      />
    </div>
  );
});

const DecisionNode = memo(({ data }: NodeProps) => {
  return (
    <div className="relative">
      {/* ダイヤモンド形状の背景要素（回転なし） */}
      <div className="absolute" style={{ 
        top: '-80px',  // 上に80px移動
        left: '-80px', // 左に80px移動
        width: '160px',
        height: '160px',
        transform: 'rotate(45deg)',
        backgroundColor: '#FFF9C4',
        border: '1px solid #FBC02D',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        zIndex: 1
      }}></div>
      
      {/* コンテンツコンテナ */}
      <div className="relative z-10" style={{
        width: '140px',
        height: '140px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        pointerEvents: 'none'  // ハンドルのクリックを可能にするため
      }}>
        <div style={{
          width: '120px',
          padding: '0 5px',
          textAlign: 'center'
        }}>
          <div className="font-bold text-yellow-800">{data.label || '判断'}</div>
          {data.message && (
            <div className="mt-2 text-xs text-gray-700" style={{ maxHeight: '60px', overflow: 'hidden' }}>
              {data.message}
            </div>
          )}
        </div>
      </div>
      
      {/* 頂点に配置したハンドル（回転なし） */}
      {/* 上頂点（入力用） */}
      <div className="absolute w-4 h-4" style={{ top: '-84px', left: '68px' }}>
        <Handle
          type="target"
          position={Position.Top}
          style={{ 
            top: '0px',
            left: '8px',
            width: '12px',
            height: '12px',
            background: '#555',
            zIndex: 20
          }}
          isConnectable={true}
        />
      </div>
      
      {/* 右頂点（出力1） */}
      <div className="absolute w-4 h-4" style={{ top: '68px', left: '140px' }}>
        <Handle
          type="source"
          position={Position.Right}
          id="yes"
          style={{ 
            top: '8px',
            left: '16px',
            width: '12px',
            height: '12px',
            background: '#4CAF50',
            zIndex: 20
          }}
          isConnectable={true}
        />
      </div>
      
      {/* 下頂点（出力2） */}
      <div className="absolute w-4 h-4" style={{ top: '140px', left: '68px' }}>
        <Handle
          type="source"
          position={Position.Bottom}
          id="no"
          style={{ 
            top: '16px',
            left: '8px',
            width: '12px',
            height: '12px',
            background: '#F44336',
            zIndex: 20
          }}
          isConnectable={true}
        />
      </div>
      
      {/* 左頂点（出力3） */}
      <div className="absolute w-4 h-4" style={{ top: '68px', left: '-4px' }}>
        <Handle
          type="source"
          position={Position.Left}
          id="other"
          style={{ 
            top: '8px',
            left: '0px',
            width: '12px',
            height: '12px',
            background: '#FF9800',
            zIndex: 20
          }}
          isConnectable={true}
        />
      </div>
    </div>
  );
});

const EndNode = memo(({ data }: NodeProps) => {
  return (
    <div className="px-4 py-2 shadow-md rounded-full bg-red-500 text-white min-w-[100px] text-center">
      <div className="font-bold">{data.label || '終了'}</div>
      
      {/* 入力ハンドルのみ */}
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: '#555' }}
        isConnectable={true}
      />
    </div>
  );
});

// ノードタイプの定義
const nodeTypes: NodeTypes = {
  start: StartNode,
  step: StepNode,
  decision: DecisionNode,
  end: EndNode
};

// 初期ノード（スタートノード）
const initialNodes: Node[] = [
  {
    id: 'start',
    type: 'start',
    position: { x: 250, y: 50 },
    data: { label: '開始' }
  }
];

// 初期エッジ（なし）
const initialEdges: Edge[] = [];

interface EmergencyFlowEditorProps {
  onSave: (data: any) => void;
  onCancel: () => void;
  initialData?: any;
}

const EmergencyFlowEditor: React.FC<EmergencyFlowEditorProps> = ({ onSave, onCancel, initialData }) => {
  const { toast } = useToast();
  
  // デバッグ: 初期データをコンソールに表示
  console.log("EmergencyFlowEditor - 受け取った初期データ:", initialData);
  
  console.log("EmergencyFlowEditor - 受け取ったinitialData構造:", {
    type: typeof initialData,
    isNull: initialData === null,
    isUndefined: initialData === undefined,
    hasNodes: initialData?.nodes !== undefined,
    hasEdges: initialData?.edges !== undefined,
    nodeCount: Array.isArray(initialData?.nodes) ? initialData.nodes.length : 0,
    edgeCount: Array.isArray(initialData?.edges) ? initialData.edges.length : 0,
  });
  
  // 初期値としてデフォルトを使用
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  
  // フロータイトルと説明の初期値
  // 新規作成の場合はデフォルト値、読み込みの場合は既存データを使用
  const defaultTitle = initialData?.title === '' ? '新規応急処置フロー' : (initialData?.title || '新規応急処置フロー');
  const defaultDescription = initialData?.description || '';
  const defaultFileName = initialData?.fileName || '';
  
  const [flowTitle, setFlowTitle] = useState<string>(defaultTitle);
  const [flowDescription, setFlowDescription] = useState<string>(defaultDescription);
  const [fileName, setFileName] = useState<string>(defaultFileName);
  
  // initialDataの変更を監視して状態を更新
  useEffect(() => {
    console.log("★★★ initialData変更を検出:", initialData);
    
    if (initialData) {
      // メタデータの更新
      if (initialData.title) {
        setFlowTitle(initialData.title);
      }
      if (initialData.description) {
        setFlowDescription(initialData.description);
      }
      if (initialData.fileName) {
        setFileName(initialData.fileName);
      }
      if (initialData.id) {
        setFlowId(initialData.id);
      }
      
      // フローデータの更新
      if (Array.isArray(initialData.nodes) && initialData.nodes.length > 0) {
        console.log("★★★ ノードデータを更新:", initialData.nodes);
        setNodes(initialData.nodes);
      }
      
      if (Array.isArray(initialData.edges) && initialData.edges.length > 0) {
        console.log("★★★ エッジデータを更新:", initialData.edges);
        setEdges(initialData.edges);
      }
    }
  }, [initialData, setNodes, setEdges]);
  
  // ノードドラッグ参照
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  
  // フローID
  const [flowId, setFlowId] = useState<string>(() => {
    if (initialData?.id) {
      return initialData.id;
    }
    return `flow_${Date.now()}`;
  });

  // 接続処理
  const onConnect = useCallback((connection: Connection) => {
    // 接続を追加（ラベルは不要になりました）
    setEdges((eds) => addEdge({ 
      ...connection, 
      animated: true, 
      type: 'smoothstep',
      // ラベル関連の設定は不要
    }, eds));
  }, [setEdges]);

  // ノード選択処理
  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);
  
  // 背景クリック時の処理
  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  // 新しいノードの追加
  const addNode = useCallback((type: string) => {
    if (!reactFlowInstance) return;
    
    const newNode: Node = {
      id: `${type}_${Date.now()}`,
      type,
      position: {
        x: Math.random() * 300 + 50,
        y: Math.random() * 300 + 50,
      },
      data: { 
        label: type === 'start' ? '開始' : 
               type === 'end' ? '終了' : 
               type === 'decision' ? '判断' : 'ステップ'
      },
    };
    
    setNodes((nds) => nds.concat(newNode));
    setSelectedNode(newNode);
  }, [reactFlowInstance, setNodes]);
  
  // ノードプロパティの更新
  const updateNodeData = useCallback((key: string, value: any) => {
    if (!selectedNode) return;
    
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === selectedNode.id) {
          return {
            ...node,
            data: {
              ...node.data,
              [key]: value,
            },
          };
        }
        return node;
      })
    );
    
    // 選択中のノード情報も更新
    setSelectedNode({
      ...selectedNode,
      data: {
        ...selectedNode.data,
        [key]: value,
      },
    });
  }, [selectedNode, setNodes]);
  
  // 選択中のノードを削除する関数
  const deleteSelectedNode = useCallback(() => {
    if (!selectedNode) return;
    
    // スタートノードは削除できないようにする
    if (selectedNode.id === 'start') {
      toast({
        title: "削除できません",
        description: "開始ノードは削除できません",
        variant: "destructive",
      });
      return;
    }
    
    setNodes((nds) => nds.filter((node) => node.id !== selectedNode.id));
    
    // 関連するエッジも削除
    setEdges((eds) => 
      eds.filter(
        (edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id
      )
    );
    
    setSelectedNode(null);
  }, [selectedNode, setNodes, setEdges, toast]);
  
  // フローデータの保存処理
  const handleSave = useCallback(() => {
    // バリデーション
    if (!flowTitle.trim()) {
      toast({
        title: "入力エラー",
        description: "フロータイトルを入力してください",
        variant: "destructive",
      });
      return;
    }
    
    // スタートノードがあるか確認
    const startNode = nodes.find(node => node.id === 'start');
    if (!startNode) {
      toast({
        title: "エラー",
        description: "開始ノードが必要です",
        variant: "destructive",
      });
      return;
    }
    
    // 終了ノードがあるか確認
    const endNode = nodes.find(node => node.type === 'end');
    if (!endNode) {
      toast({
        title: "エラー",
        description: "終了ノードが必要です",
        variant: "destructive",
      });
      return;
    }
    
    // フローデータをトラブルシューティング形式に変換
    const flowData = {
      id: flowId,
      title: flowTitle,
      description: flowDescription,
      nodes: nodes,
      edges: edges,
      // フローのエッジにラベルがあれば保持
      edgeLabels: edges.reduce((labels, edge) => {
        if (edge.label) {
          return { ...labels, [edge.id]: edge.label };
        }
        return labels;
      }, {}),
      // 作成日時情報も追加
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
    };
    
    // 親コンポーネントに渡す
    onSave(flowData);
    
    toast({
      title: "保存しました",
      description: "フローデータを保存しました",
    });
  }, [flowTitle, flowDescription, nodes, edges, flowId, onSave, toast]);
  
  return (
    <div className="flex flex-col h-full">
      <Card className="flex-1">
        <CardHeader className="pb-3">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => {
              // 現在のフローデータをJSON文字列に変換
              const flowData = {
                id: flowId,
                title: flowTitle,
                description: flowDescription,
                nodes: nodes,
                edges: edges,
                edgeLabels: edges.reduce((labels, edge) => {
                  if (edge.label) {
                    return { ...labels, [edge.id]: edge.label };
                  }
                  return labels;
                }, {}),
              };
              
              // Blobを作成してダウンロード
              const jsonStr = JSON.stringify(flowData, null, 2);
              const blob = new Blob([jsonStr], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              
              // ダウンロードリンクを作成して自動クリック
              const a = document.createElement('a');
              a.href = url;
              a.download = `${flowTitle.replace(/\s+/g, '_')}_${Date.now()}.json`;
              document.body.appendChild(a);
              a.click();
              
              // クリーンアップ
              URL.revokeObjectURL(url);
              document.body.removeChild(a);
              
              toast({
                title: "JSONファイルをダウンロードしました",
                description: "フローデータをJSONファイルとして保存しました",
              });
            }}>
              <Download className="mr-1 h-4 w-4" />JSONダウンロード
            </Button>
            <Button variant="outline" size="sm" onClick={onCancel}><X className="mr-1 h-4 w-4" />キャンセル</Button>
            <Button size="sm" onClick={handleSave}><Save className="mr-1 h-4 w-4" />保存</Button>
          </div>
          <CardDescription>
            ドラッグ＆ドロップでフローチャートを作成できます。ノードをクリックして詳細を編集してください。
            {fileName && <div className="mt-2 text-sm font-medium text-blue-600">読込中のファイル: {fileName}</div>}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col lg:flex-row h-[70vh]">
          {/* フローエディタ部分 */}
          <div className="flex-1 border rounded-md h-full" style={{ height: '80vh', minHeight: '500px' }} ref={reactFlowWrapper}>
            <ReactFlowProvider>
              <div style={{ width: '100%', height: '100%' }}>
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  onNodeClick={onNodeClick}
                  onPaneClick={onPaneClick}
                  connectionMode={ConnectionMode.Loose}
                  nodeTypes={nodeTypes}
                  fitView
                  onInit={setReactFlowInstance}
                >
                  <Background />
                  <Controls />
                  <MiniMap />
                  <Panel position="top-right">
                    <div className="bg-white p-2 rounded-md shadow-md flex flex-col gap-2">
                      <Button size="sm" onClick={() => addNode('step')}>ステップ追加</Button>
                      <Button size="sm" onClick={() => addNode('decision')}>判断追加</Button>
                      <Button size="sm" onClick={() => addNode('end')}>終了追加</Button>
                    </div>
                  </Panel>
                </ReactFlow>
              </div>
            </ReactFlowProvider>
          </div>
          
          {/* 右側のプロパティパネル */}
          <Card className="w-full lg:w-96 mt-4 lg:mt-0 lg:ml-4 overflow-auto">
            <CardHeader>
              <CardTitle>{selectedNode ? "ノード編集" : "フロー情報"}</CardTitle>
            </CardHeader>
            <CardContent>
              {selectedNode ? (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="node-label">ラベル</Label>
                    <Input
                      id="node-label"
                      value={selectedNode.data.label || ''}
                      onChange={(e) => updateNodeData('label', e.target.value)}
                      placeholder="ノードラベル"
                    />
                  </div>
                  
                  {selectedNode.type !== 'start' && selectedNode.type !== 'end' && (
                    <div>
                      <Label htmlFor="node-message">内容</Label>
                      <Textarea
                        id="node-message"
                        value={selectedNode.data.message || ''}
                        onChange={(e) => updateNodeData('message', e.target.value)}
                        placeholder="ステップの内容"
                        rows={4}
                      />
                    </div>
                  )}
                  
                  {/* プレビュー表示 - リアルタイム更新 */}
                  {selectedNode.type !== 'start' && selectedNode.type !== 'end' && selectedNode.data.message && (
                    <div className="mt-4 border rounded-lg p-3 bg-slate-50">
                      <div className="text-xs text-blue-600 mb-2">プレビュー（リアルタイム更新）</div>
                      <div className="whitespace-pre-line text-gray-700">
                        {selectedNode.data.message}
                      </div>
                    </div>
                  )}
                  
                  {selectedNode.id !== 'start' && (
                    <Button 
                      variant="destructive" 
                      size="sm"
                      onClick={deleteSelectedNode}
                    >
                      <Trash className="mr-1 h-4 w-4" />ノードを削除
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="flow-title">フロータイトル</Label>
                    <Input
                      id="flow-title"
                      value={flowTitle}
                      onChange={(e) => setFlowTitle(e.target.value)}
                      placeholder="フローのタイトルを入力"
                    />
                  </div>
                  <div>
                    <Label htmlFor="flow-description">説明</Label>
                    <Textarea
                      id="flow-description"
                      value={flowDescription}
                      onChange={(e) => setFlowDescription(e.target.value)}
                      placeholder="フローの説明を入力"
                      rows={4}
                    />
                  </div>
                  
                  <div className="my-4">
                    <h3 className="text-sm font-medium mb-2">フロー情報</h3>
                    <div className="bg-gray-100 p-2 rounded text-sm">
                      <p><span className="font-medium">ID:</span> {flowId}</p>
                    </div>
                  </div>
                  
                  {/* フロー情報プレビュー - 常に表示 */}
                  <div className="mt-4 border rounded-lg p-3 bg-slate-50">
                    <div className="text-xs text-blue-600 mb-2">プレビュー（リアルタイム更新）</div>
                    <h3 className="font-bold mb-1">{flowTitle || '(タイトル未設定)'}</h3>
                    <p className="whitespace-pre-line text-gray-700 text-sm">
                      {flowDescription || '(説明はありません)'}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
};

export default EmergencyFlowEditor;