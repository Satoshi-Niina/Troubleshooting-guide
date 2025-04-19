import React, { useState, useCallback, useRef, memo } from 'react';
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
  NodeProps
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Plus, Save, X, Check, Trash, Copy, Download } from 'lucide-react';

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
    <div className="shadow-md bg-yellow-100 border border-yellow-500" style={{ 
      width: '160px',
      height: '160px',
      // 正方形を45度回転させて明確なひし形を表現
      transform: 'rotate(45deg)',
      transformOrigin: 'center',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: '4px',
      position: 'relative'
    }}>
      <div style={{ 
        transform: 'rotate(-45deg)',
        width: '140px',
        padding: '0 10px',
        position: 'absolute',
        textAlign: 'center'
      }}>
        <div className="font-bold text-yellow-800">{data.label || '判断'}</div>
        {data.message && (
          <div className="mt-2 text-xs text-gray-700" style={{ maxHeight: '60px', overflow: 'hidden' }}>
            {data.message}
          </div>
        )}
      </div>
      
      {/* 4頂点すべてにハンドルを配置
          transform: translateX/Yを使用して正確に各頂点に配置 */}
      <Handle
        type="target"
        position={Position.Top}
        style={{ 
          background: '#555', 
          transform: 'rotate(-45deg) translateY(-10px)',
          zIndex: 10 
        }}
        isConnectable={true}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ 
          background: '#555', 
          transform: 'rotate(-45deg) translateX(10px)',
          zIndex: 10
        }}
        id="yes"
        isConnectable={true}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ 
          background: '#555', 
          transform: 'rotate(-45deg) translateY(10px)',
          zIndex: 10
        }}
        id="no"
        isConnectable={true}
      />
      <Handle
        type="source"
        position={Position.Left}
        style={{ 
          background: '#555', 
          transform: 'rotate(-45deg) translateX(-10px)',
          zIndex: 10
        }}
        id="other"
        isConnectable={true}
      />
      
      {/* ハンドルのラベル */}
      <div style={{ 
        position: 'absolute', 
        top: '-10px', 
        right: '-35px', 
        transform: 'rotate(-45deg)',
        fontSize: '10px',
        color: '#666'
      }}>
        はい
      </div>
      <div style={{ 
        position: 'absolute', 
        bottom: '-10px', 
        right: '-35px', 
        transform: 'rotate(-45deg)',
        fontSize: '10px',
        color: '#666'
      }}>
        いいえ
      </div>
      <div style={{ 
        position: 'absolute', 
        bottom: '-10px', 
        left: '-35px', 
        transform: 'rotate(-45deg)',
        fontSize: '10px',
        color: '#666'
      }}>
        その他
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
  // 初期データがあればそれを使用し、なければデフォルトのinitialNodesを使用
  const nodesToUse = Array.isArray(initialData?.nodes) && initialData.nodes.length > 0 
    ? initialData.nodes 
    : initialNodes;
  
  // 初期データがあればそれを使用し、なければデフォルトのinitialEdgesを使用
  const edgesToUse = Array.isArray(initialData?.edges) && initialData.edges.length > 0
    ? initialData.edges
    : initialEdges;
  
  const [nodes, setNodes, onNodesChange] = useNodesState(nodesToUse);
  const [edges, setEdges, onEdgesChange] = useEdgesState(edgesToUse);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  
  // フロータイトルと説明
  const [flowTitle, setFlowTitle] = useState<string>(initialData?.title || '新規応急処置フロー');
  const [flowDescription, setFlowDescription] = useState<string>(initialData?.description || '');
  const [fileName, setFileName] = useState<string>(initialData?.fileName || '');
  
  // ノードドラッグ参照
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  
  // フローID
  const [flowId, setFlowId] = useState<string>(initialData?.id || `flow_${Date.now()}`);

  // 接続処理
  const onConnect = useCallback((connection: Connection) => {
    // 判断ノードからの接続の場合はラベルを追加
    const sourceNode = nodes.find(node => node.id === connection.source);
    let label = '';
    
    if (sourceNode?.type === 'decision') {
      // sourceHandleがyesかnoかotherかで判定
      if (connection.sourceHandle === 'yes') {
        label = 'はい';
      } else if (connection.sourceHandle === 'no') {
        label = 'いいえ';
      } else if (connection.sourceHandle === 'other') {
        label = 'その他';
      }
    }
    
    setEdges((eds) => addEdge({ 
      ...connection, 
      animated: true, 
      type: 'smoothstep',
      label,
      labelStyle: { fontSize: 12, fill: '#333' },
      labelBgStyle: { fill: 'rgba(255, 255, 255, 0.8)' }
    }, eds));
  }, [setEdges, nodes]);

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
  
  // 選択中のノードを削除
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
          <div className="flex-1 border rounded-md" ref={reactFlowWrapper}>
            <ReactFlowProvider>
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