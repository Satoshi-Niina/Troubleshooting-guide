import React, { useState, useCallback, useRef } from 'react';
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
  ReactFlowProvider
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Plus, Save, X, Check, Trash, Copy } from 'lucide-react';

// カスタムノードタイプ
import StartNode from './nodes/start-node';
import StepNode from './nodes/step-node';
import DecisionNode from './nodes/decision-node';
import EndNode from './nodes/end-node';

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
}

const EmergencyFlowEditor: React.FC<EmergencyFlowEditorProps> = ({ onSave, onCancel }) => {
  const { toast } = useToast();
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  
  // フロータイトルと説明
  const [flowTitle, setFlowTitle] = useState<string>('新規応急処置フロー');
  const [flowDescription, setFlowDescription] = useState<string>('');
  
  // ノードドラッグ参照
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  // 接続処理
  const onConnect = useCallback((connection: Connection) => {
    setEdges((eds) => addEdge({ ...connection, animated: true, type: 'smoothstep' }, eds));
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
      id: `flow_${Date.now()}`,
      title: flowTitle,
      description: flowDescription,
      nodes: nodes,
      edges: edges,
    };
    
    // 親コンポーネントに渡す
    onSave(flowData);
    
    toast({
      title: "保存しました",
      description: "フローデータを保存しました",
    });
  }, [flowTitle, flowDescription, nodes, edges, onSave, toast]);
  
  return (
    <div className="flex flex-col h-full">
      <Card className="flex-1">
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <CardTitle>応急処置フロー作成</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onCancel}><X className="mr-1 h-4 w-4" />キャンセル</Button>
              <Button size="sm" onClick={handleSave}><Save className="mr-1 h-4 w-4" />保存</Button>
            </div>
          </div>
          <CardDescription>
            ドラッグ＆ドロップでフローチャートを作成できます。ノードをクリックして詳細を編集してください。
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