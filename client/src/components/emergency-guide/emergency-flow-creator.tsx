import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Upload, Save, X, Edit, Edit3, File, FileText, Plus, Download, FolderOpen, Trash2, RefreshCw, AlertTriangle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import EmergencyFlowEditor from './emergency-flow-editor';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableHeader, TableHead, TableRow, TableCell } from '@/components/ui/table';

interface EmergencyFlow {
  title: string;
  steps: {
    description: string;
    imageUrl?: string;
  }[];
}

const EmergencyFlowCreator: React.FC = () => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // ファイル編集タブ内のサブタブ
  const [characterDesignTab, setCharacterDesignTab] = useState<string>('flowEditor');
  
  // アップロード関連の状態
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  
  // アップロード完了時のファイル名を保持
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  
  // フロー編集の状態
  const [flowData, setFlowData] = useState<any>(null);
  
  // キャラクター削除関連の状態
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [flowToDelete, setFlowToDelete] = useState<string | null>(null);
  
  // 保存済みフローのリスト
  const [flowList, setFlowList] = useState<any[]>([]);
  const [isLoadingFlowList, setIsLoadingFlowList] = useState(false);

  // スライド追加の状態
  const [showSlideAddButtons, setShowSlideAddButtons] = useState(false);
  
  // メモ化されたフローリストの取得
  const fetchFlowList = useCallback(async () => {
    try {
      setIsLoadingFlowList(true);
      console.log('応急処置データ一覧の取得を開始します');
      
      const timestamp = new Date().getTime();
      const response = await fetch(`/api/tech-support/flows?t=${timestamp}`);
      
      if (!response.ok) {
        throw new Error('応急処置データ一覧の取得に失敗しました');
      }
      
      const data = await response.json();
      
      if (!data.flows || !Array.isArray(data.flows)) {
        console.warn('応急処置データ一覧が配列形式ではありません。空の配列を使用します。');
        setFlowList([]);
        return;
      }

      // データを整形して保存
      const formattedData = data.flows.map(flow => ({
        ...flow,
        type: flow.type || '応急処置',
        createdAt: flow.createdAt || new Date().toISOString()
      }));

      console.log('取得したフローデータ:', formattedData);
      setFlowList(formattedData);
    } catch (error) {
      console.error('フロー一覧取得エラー:', error);
      toast({
        title: "エラー",
        description: "フロー一覧の取得に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsLoadingFlowList(false);
    }
  }, [toast]);
  
  // コンポーネントマウント時にフローリストを取得
  useEffect(() => {
    fetchFlowList();
  }, [fetchFlowList]);
  
  // ファイル選択のハンドラー
  const handleFileClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      setSelectedFile(file);
      
      // JSONファイルの場合は直接読み込む
      if (file.name.toLowerCase().endsWith('.json')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const jsonData = JSON.parse(e.target?.result as string);
            // ファイル名情報を追加
            jsonData.fileName = file.name;
            setUploadedFileName(file.name);
            
            // 共通の処理関数を使用してデータを処理
            const enhancedData = processFlowData(jsonData);
            
            console.log("ファイル選択から読み込んだフローデータ:", enhancedData);
            setFlowData(enhancedData);
            
            // 読み込み成功したらキャラクターデザインタブの「新規作成」に切り替え
            setCharacterDesignTab('new');
            toast({
              title: "JSONファイル読み込み完了",
              description: "フローデータをエディタで編集できます",
            });
          } catch (error) {
            console.error("JSONパースエラー:", error);
            toast({
              title: "エラー",
              description: "JSONファイルの解析に失敗しました",
              variant: "destructive",
            });
          }
        };
        reader.readAsText(file);
      }
    }
  };
  
  // ドラッグ&ドロップイベントハンドラー
  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };
  
  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const files = event.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      setSelectedFile(file);
      
      // JSONファイルの場合は直接読み込む
      if (file.name.toLowerCase().endsWith('.json')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const jsonData = JSON.parse(e.target?.result as string);
            // ファイル名情報を追加
            jsonData.fileName = file.name;
            setUploadedFileName(file.name);
            
            // 共通の処理関数を使用してデータを処理
            const enhancedData = processFlowData(jsonData);
            
            console.log("ドラッグ&ドロップで読み込んだフローデータ:", enhancedData);
            setFlowData(enhancedData);
            
            // 読み込み成功したらキャラクターデザインタブの「新規作成」に切り替え
            setCharacterDesignTab('new');
            toast({
              title: "JSONファイル読み込み完了",
              description: "フローデータをエディタで編集できます",
            });
          } catch (error) {
            console.error("JSONパースエラー:", error);
            toast({
              title: "エラー",
              description: "JSONファイルの解析に失敗しました",
              variant: "destructive",
            });
          }
        };
        reader.readAsText(file);
      }
    }
  };
  
  // ファイルアップロード
  const handleUpload = async () => {
    if (!selectedFile) {
      toast({
        title: "エラー",
        description: "ファイルを選択してください",
        variant: "destructive",
      });
      return;
    }
    
    try {
      setIsUploading(true);
      setUploadProgress(0);
      
      // 進行状況の更新処理
      const updateProgress = () => {
        setUploadProgress(prev => {
          const increment = Math.random() * 10;
          const newProgress = Math.min(prev + increment, 95);
          return newProgress;
        });
      };
      
      // 一定間隔で進行状況を更新
      const progressInterval = setInterval(updateProgress, 300);
      
      // JSONファイルを直接読み込み、編集画面に切り替える
      if (selectedFile.name.toLowerCase().endsWith('.json')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const jsonData = JSON.parse(e.target?.result as string);
            // ファイル名情報を追加
            jsonData.fileName = selectedFile.name;
            setUploadedFileName(selectedFile.name);
            
            // 共通の処理関数を使用してデータを処理
            const enhancedData = processFlowData(jsonData);
            
            console.log("アップロードで読み込んだフローデータ:", enhancedData);
            setFlowData(enhancedData);
            
            // 読み込み成功したら、キャラクター編集用にフローエディタタブに切り替え
            setCharacterDesignTab('flowEditor');
            setUploadSuccess(true);
            toast({
              title: "JSONファイル読込み成功",
              description: "フローデータをエディタで編集できます",
            });
            
            // 進行状況の更新を停止
            clearInterval(progressInterval);
            setUploadProgress(100);
            
            // 3秒後にリセット（ファイル選択状態のみ）
            setTimeout(() => {
              setSelectedFile(null);
              setUploadSuccess(false);
              setUploadProgress(0);
            }, 3000);
          } catch (error) {
            clearInterval(progressInterval);
            setUploadProgress(0);
            toast({
              title: "エラー",
              description: "JSONファイルの解析に失敗しました",
              variant: "destructive",
            });
          }
        };
        reader.readAsText(selectedFile);
        return;
      }
      
      // フォームデータの作成
      const formData = new FormData();
      formData.append('file', selectedFile);
      // ファイル名を保存
      setUploadedFileName(selectedFile.name);
      
      // すべてのオプションを有効化
      formData.append('options', JSON.stringify({
        keepOriginalFile: true,
        extractKnowledgeBase: true,
        extractImageSearch: true,
        createTroubleshooting: true
      }));
      
      // ファイルの送信
      const response = await fetch('/api/data-processor/process', {
        method: 'POST',
        body: formData,
      });
      
      // 進行状況の更新を停止
      clearInterval(progressInterval);
      
      const data = await response.json();
      setUploadProgress(100);
      
      if (data.success) {
        setUploadSuccess(true);
        toast({
          title: "成功",
          description: data.message || "ファイルが処理されました",
        });
        
        // 3秒後にリセット
        setTimeout(() => {
          setSelectedFile(null);
          setUploadSuccess(false);
          setUploadProgress(0);
        }, 3000);
      } else {
        throw new Error(data.error || 'ファイル処理中にエラーが発生しました');
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "ファイルのアップロードに失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };
  
  // メモ化されたフローデータの処理
  const processFlowData = useCallback((jsonData: any) => {
    if (!jsonData) {
      return {
        title: '無効なデータ',
        description: 'データが正しく読み込めませんでした',
        nodes: [{
          id: 'start',
          type: 'start',
          position: { x: 250, y: 50 },
          data: { label: '開始' }
        }],
        edges: []
      };
    }

    let enhancedData: any = {};

    // slidesフィールドがある場合は、スライドデータからノードを生成
    if (jsonData.slides && jsonData.slides.length > 0) {
      // スライドデータからノードとエッジを生成
      const { generatedNodes, generatedEdges } = generateNodesFromTroubleshooting(jsonData);
      
      enhancedData = {
        ...jsonData,
        title: jsonData.metadata?.タイトル || jsonData.title || '無題のフロー',
        description: jsonData.metadata?.説明 || jsonData.description || '',
        nodes: generatedNodes,
        edges: generatedEdges,
        slides: jsonData.slides.map((slide: any, index: number) => ({
          id: `slide_${index + 1}`,
          title: slide.タイトル || `スライド ${index + 1}`,
          content: Array.isArray(slide.本文) ? slide.本文.join('\n') : (slide.本文 || ''),
          metadata: {
            type: slide.タイプ || 'step',
            order: index + 1,
            ...slide.metadata
          }
        }))
      };
      
      console.log("スライドデータからノードを生成:", enhancedData);
    }
    // stepsフィールドがある場合は、トラブルシューティングデータからノードを生成
    else if (jsonData.steps && jsonData.steps.length > 0) {
      // トラブルシューティングデータからノードとエッジを生成
      const { generatedNodes, generatedEdges } = generateNodesFromTroubleshooting(jsonData);
      
      enhancedData = {
        ...jsonData,
        title: jsonData.title || '無題のフロー',
        description: jsonData.description || '',
        nodes: generatedNodes,
        edges: generatedEdges,
        steps: jsonData.steps.map((step: any, index: number) => ({
          id: step.id || `step_${index + 1}`,
          title: step.title || `ステップ ${index + 1}`,
          content: step.content || '',
          metadata: {
            type: step.type || 'step',
            order: index + 1,
            ...step.metadata
          }
        }))
      };
      
      console.log("トラブルシューティングデータからノードを生成:", enhancedData);
    } else if (jsonData.nodes && jsonData.nodes.length > 0) {
      // 既存のノードとエッジがある場合はそれを使用
      let nodes = jsonData.nodes || [];
      let edges = jsonData.edges || [];
      
      // ノードのtypeフィールドが存在するか確認し、存在しない場合は設定する
      nodes = nodes.map((node: any) => {
        // nodeにtypeフィールドがない場合は追加
        if (!node.type && node.id) {
          // idからノードタイプを推測（キャラクターの種類を判別）
          if (node.id === 'start') {
            return { ...node, type: 'start' };
          } else if (node.id.includes('end')) {
            return { ...node, type: 'end' };
          } else if (node.id.includes('decision')) {
            return { ...node, type: 'decision' };
          } else {
            return { ...node, type: 'step' };
          }
        }
        return node;
      });
      
      enhancedData = {
        ...jsonData,
        nodes: nodes,
        edges: edges,
        steps: nodes
          .filter((node: any) => node.type === 'step' || node.type === 'decision')
          .map((node: any, index: number) => ({
            id: node.id,
            title: node.data.label || `ステップ ${index + 1}`,
            content: node.data.message || '',
            metadata: {
              type: node.type,
              order: index + 1,
              ...node.data.metadata
            }
          }))
      };
      
      console.log("既存のノードを処理:", enhancedData);
    } else {
      // 何もデータがない場合は、デフォルトのノードとエッジを設定
      enhancedData = {
        ...jsonData,
        title: jsonData.title || '新規フロー',
        description: jsonData.description || '',
        nodes: [
          {
            id: 'start',
            type: 'start',
            position: { x: 250, y: 50 },
            data: { label: '開始' }
          }
        ],
        edges: [],
        steps: []
      };
      
      console.log("デフォルトノードを作成:", enhancedData);
    }
    
    return enhancedData;
  }, []);
  
  // メモ化されたフロー保存ハンドラー
  const handleSaveFlow = useCallback(async (data: any) => {
    try {
      console.log("保存するフローデータ:", data);
      // index情報とsteps配列をまとめる
      const saveData = {
        index: {
          title: data.title,
          description: data.description,
          fileName: data.fileName || '',
          // 必要に応じて他のindex情報も追加
        },
        steps: data.nodes
          .filter((node: any) => node.type === 'step' || node.type === 'decision')
          .map((node: any, index: number) => ({
            id: node.id,
            title: node.data.label || `ステップ ${index + 1}`,
            content: node.data.message || '',
            metadata: {
              type: node.type,
              order: index + 1,
              ...node.data.metadata
            }
          }))
      };

      const response = await fetch('/api/emergency-flow/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(saveData),
      });
      
      if (!response.ok) {
        throw new Error('フローの保存に失敗しました');
      }
      
      const result = await response.json();
      
      if (result.success) {
        toast({
          title: "保存成功",
          description: "応急処置フローが保存されました",
        });
        
        fetchFlowList();
        
        setFlowData({
          title: '',
          description: '',
          fileName: '',
          nodes: [
            {
              id: 'start',
              type: 'start',
              position: { x: 250, y: 50 },
              data: { label: '開始' }
            }
          ],
          edges: []
        });
        setUploadedFileName('');
        setCharacterDesignTab('file');
      } else {
        throw new Error(result.error || 'フローの保存に失敗しました');
      }
    } catch (error) {
      console.error('保存エラー:', error);
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "フローの保存に失敗しました",
        variant: "destructive",
      });
    }
  }, [toast, fetchFlowList]);
  
  // フロー作成キャンセルハンドラー
  const handleCancelFlow = () => {
    // データをリセット
    setFlowData({
      title: '',
      description: '',
      fileName: '',
      nodes: [
        {
          id: 'start',
          type: 'start',
          position: { x: 250, y: 50 },
          data: { label: '開始' }
        }
      ],
      edges: []
    });
    // アップロードファイル名もリセット
    setUploadedFileName('');
    
    // ファイル編集タブに戻る
    setCharacterDesignTab('file');
    
    toast({
      title: "編集キャンセル",
      description: "フローの編集をキャンセルしました",
    });
  };
  
  /**
   * トラブルシューティングデータからノードとエッジを生成する関数
   * @param troubleshootingData トラブルシューティングデータ
   * @returns 生成されたノードとエッジ
   */
  const generateNodesFromTroubleshooting = (troubleshootingData: any) => {
    const generatedNodes: any[] = [];
    const generatedEdges: any[] = [];
    let nodeXPosition = 250;
    let nodeYPosition = 50;
    const yIncrementStep = 150;
    const xOffset = 250;
    
    // スタートノードの追加（常に必要）
    generatedNodes.push({
      id: 'start',
      type: 'start',
      position: { x: nodeXPosition, y: nodeYPosition },
      data: { label: '開始' }
    });
    
    nodeYPosition += yIncrementStep;
    
    // ステップノードマップ（id -> ノードインデックス）
    const stepNodeMap: {[key: string]: number} = {};
    
    // スライドデータがある場合はスライドからノードを生成
    if (troubleshootingData.slides && troubleshootingData.slides.length > 0) {
      // スライドの総数を取得
      const slidesCount = troubleshootingData.slides.length;
      
      troubleshootingData.slides.forEach((slide: any, index: number) => {
        // 最後のスライドは終了ノードにする
        let nodeType = index === slidesCount - 1 ? 'end' : 'step';
        
        // 選択肢を持つスライドは判断ノードにする（仮実装）
        const slideTitle = slide.タイトル || '';
        if (slideTitle.includes('判断') || slideTitle.includes('選択') || slideTitle.includes('チェック')) {
          nodeType = 'decision';
        }
        
        // ノードのID（スライド番号を使用）
        const nodeId = `slide_${index + 1}`;
        
        // ノードの作成
        const node = {
          id: nodeId,
          type: nodeType,
          position: { x: nodeXPosition, y: nodeYPosition },
          data: { 
            label: slide.タイトル || `スライド ${index + 1}`, 
            message: Array.isArray(slide.本文) ? slide.本文.join('\n') : (slide.本文 || '')
          }
        };
        
        // ノードの追加
        generatedNodes.push(node);
        // ノードのインデックスを記録
        stepNodeMap[nodeId] = generatedNodes.length - 1;
        
        // 前のノードとの接続
        if (index === 0) {
          // 最初のスライドはスタートノードと接続
          generatedEdges.push({
            id: `edge-start-${nodeId}`,
            source: 'start',
            target: nodeId,
            animated: true,
            type: 'smoothstep'
          });
        } else {
          // それ以外は前のスライドとの接続
          const prevNodeId = `slide_${index}`;
          generatedEdges.push({
            id: `edge-${prevNodeId}-${nodeId}`,
            source: prevNodeId,
            target: nodeId,
            animated: true,
            type: 'smoothstep'
          });
        }
        
        // Y座標を更新
        nodeYPosition += yIncrementStep;
      });
      
      // 位置の調整（ノードが重ならないように）
      const adjustNodePositions = () => {
        // 同じレベルのノードのX座標を調整（左右に分散）
        const levelNodes: any[] = [];
        generatedNodes.forEach(node => {
          if (node.id !== 'start') {
            levelNodes.push(node);
          }
        });
        
        // 各レベルのノードを縦に整列
        levelNodes.forEach((node, index) => {
          const yPos = 50 + (index + 1) * yIncrementStep;
          node.position.y = yPos;
        });
      };
      
      // ノード位置の調整を実行
      adjustNodePositions();
    }
    // 通常のステップデータがある場合
    else if (troubleshootingData.steps && troubleshootingData.steps.length > 0) {
      troubleshootingData.steps.forEach((step: any, index: number) => {
        // ステップノードのタイプを判定
        let nodeType = 'step';
        // idにendが含まれるか、オプションがない場合は終了ノード
        if (step.id === 'end' || step.id.includes('end') || !step.options || step.options.length === 0) {
          nodeType = 'end';
        }
        // オプションが複数ある場合は判断ノード
        else if (step.options && step.options.length > 1) {
          nodeType = 'decision';
        }
        
        // ノードの作成
        const node = {
          id: step.id,
          type: nodeType,
          position: { x: nodeXPosition, y: nodeYPosition },
          data: { 
            label: step.title || `ステップ ${index + 1}`, 
            message: step.content || ''
          }
        };
        
        // ノードの追加
        generatedNodes.push(node);
        // ノードのインデックスを記録
        stepNodeMap[step.id] = generatedNodes.length - 1;
        
        // 前のノードとの接続（最初のステップのみスタートノードと接続）
        if (index === 0) {
          generatedEdges.push({
            id: `edge-start-${step.id}`,
            source: 'start',
            target: step.id,
            animated: true,
            type: 'smoothstep'
          });
        }
        
        // Y座標を更新
        nodeYPosition += yIncrementStep;
      });
      
      // 各ステップのオプションからエッジを作成
      troubleshootingData.steps.forEach((step: any) => {
        if (step.options && step.options.length > 0) {
          // 判断ノードの場合、各選択肢に対してエッジを作成
          if (step.options.length > 1) {
            step.options.forEach((option: any, optIndex: number) => {
              if (option.next && stepNodeMap[option.next] !== undefined) {
                let sourceHandle = null;
                let edgeLabel = option.text || '';
                
                // 選択肢のポジションに応じてハンドルIDを設定
                if (optIndex === 0) {
                  sourceHandle = 'yes'; // 最初の選択肢は右のハンドル
                } else if (optIndex === 1) {
                  sourceHandle = 'no'; // 2番目の選択肢は下のハンドル
                } else {
                  sourceHandle = 'other'; // 3番目以降の選択肢は左のハンドル
                }
                
                generatedEdges.push({
                  id: `edge-${step.id}-${option.next}-${optIndex}`,
                  source: step.id,
                  target: option.next,
                  sourceHandle: sourceHandle,
                  animated: true,
                  type: 'smoothstep'
                  // ラベルの設定は削除
                });
              }
            });
          } 
          // 通常のステップノードの場合、最初のオプションのみ接続
          else if (step.options[0] && step.options[0].next) {
            generatedEdges.push({
              id: `edge-${step.id}-${step.options[0].next}`,
              source: step.id,
              target: step.options[0].next,
              animated: true,
              type: 'smoothstep'
            });
          }
        }
      });
      
      // 位置の調整（ノードが重ならないように）
      const adjustNodePositions = () => {
        // ノードの階層レベルを計算
        const nodeLevels: {[key: string]: number} = {};
        const calculateNodeLevel = (nodeId: string, level: number = 0, visited: Set<string> = new Set()) => {
          if (visited.has(nodeId)) return;
          visited.add(nodeId);
          
          nodeLevels[nodeId] = Math.max(level, nodeLevels[nodeId] || 0);
          
          // このノードから出ているエッジを探す
          const outgoingEdges = generatedEdges.filter(edge => edge.source === nodeId);
          outgoingEdges.forEach(edge => {
            calculateNodeLevel(edge.target, level + 1, visited);
          });
        };
        
        // スタートノードから計算を開始
        calculateNodeLevel('start');
        
        // レベルに基づいてY座標を調整
        generatedNodes.forEach(node => {
          const level = nodeLevels[node.id] || 0;
          node.position.y = level * yIncrementStep + 50;
        });
        
        // 同じレベルのノードのX座標を調整（左右に分散）
        const levelNodes: {[key: number]: string[]} = {};
        Object.entries(nodeLevels).forEach(([nodeId, level]) => {
          if (!levelNodes[level]) levelNodes[level] = [];
          levelNodes[level].push(nodeId);
        });
        
        // 各レベルのノードを横に分散
        Object.entries(levelNodes).forEach(([levelStr, nodeIds]) => {
          const level = parseInt(levelStr);
          const nodesCount = nodeIds.length;
          
          if (nodesCount > 1) {
            const totalWidth = (nodesCount - 1) * xOffset;
            const startX = nodeXPosition - totalWidth / 2;
            
            nodeIds.forEach((nodeId, idx) => {
              const node = generatedNodes.find(n => n.id === nodeId);
              if (node) {
                node.position.x = startX + idx * xOffset;
              }
            });
          }
        });
      };
      
      // ノード位置の調整を実行
      adjustNodePositions();
    }
    
    console.log("生成されたノード:", generatedNodes);
    console.log("生成されたエッジ:", generatedEdges);
    
    return { generatedNodes, generatedEdges };
  };
  
  // 新規フロー作成ハンドラー
  const handleCreateNewFlow = () => {
    // 空のフローデータで初期化
    setFlowData({
      title: '新規応急処置フロー',
      description: '',
      fileName: '',
      nodes: [
        {
          id: 'start',
          type: 'start',
          position: { x: 250, y: 50 },
          data: { label: '開始' }
        }
      ],
      edges: []
    });
    // ファイル名も必ずリセット
    setUploadedFileName('');
    setCharacterDesignTab('new');
    
    toast({
      title: "新規作成",
      description: "新しいフローを作成できます",
    });
  };
  
  // キャラクター削除確認ダイアログを表示
  const handleDeleteCharacter = (id: string) => {
    setFlowToDelete(id);
    setShowConfirmDelete(true);
  };
  
  // キャラクター削除実行
  const executeDeleteCharacter = async () => {
    if (!flowToDelete) return;
    
    try {
      console.log(`応急処置データの削除を開始: ID=${flowToDelete}`);
      const response = await fetch(`/api/emergency-flow/delete/${flowToDelete}`, {
        method: 'DELETE',
      });
      
      const result = await response.json();
      
      if (result.success) {
        toast({
          title: "削除成功",
          description: "キャラクターが削除されました",
        });
        // 削除後にフローリストを再取得
        fetchFlowList();
      } else {
        throw new Error(result.error || '削除に失敗しました');
      }
    } catch (error) {
      console.error('削除エラー:', error);
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "削除に失敗しました",
        variant: "destructive",
      });
    } finally {
      setShowConfirmDelete(false);
      setFlowToDelete(null);
    }
  };
  
  // Add new slide handler
  const handleAddNewSlide = (parentNodeId?: string) => {
    if (!flowData) return;

    const newSlideNumber = flowData.nodes.length;
    const newNode = {
      id: `slide_${newSlideNumber}`,
      type: 'step',
      position: { x: 250, y: 50 + (newSlideNumber * 100) },
      data: { 
        label: `スライド ${newSlideNumber}`,
        message: ''
      }
    };

    let newEdge;
    if (parentNodeId) {
      // 親ノードから新しいスライドへのエッジを作成
      newEdge = {
        id: `edge-${parentNodeId}-slide_${newSlideNumber}`,
        source: parentNodeId,
        target: `slide_${newSlideNumber}`,
        animated: true,
        type: 'smoothstep'
      };
    } else {
      // 前のスライドから新しいスライドへのエッジを作成
      newEdge = {
        id: `edge-slide_${newSlideNumber-1}-slide_${newSlideNumber}`,
        source: `slide_${newSlideNumber-1}`,
        target: `slide_${newSlideNumber}`,
        animated: true,
        type: 'smoothstep'
      };
    }

    setFlowData({
      ...flowData,
      nodes: [...flowData.nodes, newNode],
      edges: [...flowData.edges, newEdge]
    });

    toast({
      title: "スライド追加",
      description: "新しいスライドが追加されました",
    });
  };
  
  return (
    <>
      <Card className="w-full h-screen max-h-[calc(100vh-120px)] overflow-auto">
        <CardHeader className="pb-2 sticky top-0 bg-white z-10">
          <div className="flex justify-between items-center">
            <CardDescription>応急処置データ管理</CardDescription>
            {characterDesignTab === 'new' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSlideAddButtons(!showSlideAddButtons)}
                className="ml-2"
              >
                <Plus className="h-4 w-4 mr-2" />
                スライド追加モード
              </Button>
            )}
          </div>
        </CardHeader>
        
        <CardContent className="overflow-y-auto pb-24">
          <Tabs defaultValue="new" value={characterDesignTab} onValueChange={(tab) => {
            setCharacterDesignTab(tab);
            if (tab === 'file') {
              fetchFlowList();
            }
          }}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="new">
                <Plus className="mr-2 h-4 w-4" />
                新規作成
              </TabsTrigger>
              <TabsTrigger value="file">
                <FolderOpen className="mr-2 h-4 w-4" />
                ファイル編集
              </TabsTrigger>
            </TabsList>
            
            {/* ファイル入力 (非表示) */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".json"
              className="hidden"
            />

            {/* 新規作成タブ - フローチャート作成用のReactFlowコンポーネント */}
            <TabsContent value="new" className="h-full">
              <EmergencyFlowEditor 
                onSave={handleSaveFlow}
                onCancel={handleCancelFlow}
                showSlideAddButtons={showSlideAddButtons}
                onAddSlide={handleAddNewSlide}
                initialData={flowData ? {
                  ...flowData,
                  id: flowData.id || undefined,
                  title: flowData.title || '新規応急処置フロー',
                  description: flowData.description || '',
                  fileName: uploadedFileName || flowData.fileName || '',
                  nodes: Array.isArray(flowData.nodes) ? flowData.nodes : [],
                  edges: Array.isArray(flowData.edges) ? flowData.edges : []
                } : {
                  id: `flow_${Date.now()}`,
                  title: '新規応急処置フロー',
                  description: '',
                  fileName: '',
                  nodes: [{
                    id: 'start',
                    type: 'start',
                    position: { x: 250, y: 50 },
                    data: { label: '開始' }
                  }],
                  edges: []
                }}
              />
            </TabsContent>
            
            {/* ファイル編集タブ */}
            <TabsContent value="file" className="h-full">
              <div className="space-y-4">
                {/* 保存済みキャラクター一覧 */}
                <div className="mt-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-medium">保存データ一覧</h3>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={fetchFlowList} disabled={isLoadingFlowList}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        更新
                      </Button>
                      <Button variant="default" size="sm" onClick={handleCreateNewFlow}>
                        <Plus className="mr-2 h-4 w-4" />
                        新規作成
                      </Button>
                    </div>
                  </div>
                  
                  {isLoadingFlowList ? (
                    <div className="py-4 text-center text-gray-500">読込中...</div>
                  ) : flowList.length === 0 ? (
                    <div className="py-4 text-center text-gray-500">保存済みのデータはありません</div>
                  ) : (
                    <ScrollArea className="h-[300px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>タイトル</TableHead>
                            <TableHead>作成日</TableHead>
                            <TableHead>スライド数</TableHead>
                            <TableHead>タイプ</TableHead>
                            <TableHead className="text-right">操作</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {flowList.map((flow: any) => (
                            <TableRow key={flow.id}>
                              <TableCell className="font-medium">{flow.title}</TableCell>
                              <TableCell>{new Date(flow.createdAt).toLocaleString()}</TableCell>
                              <TableCell>{flow.slideCount || 0}</TableCell>
                              <TableCell>
                                <Badge variant={flow.type === 'flow' ? 'default' : 'outline'}>
                                  {flow.type === 'flow' ? 'フロー' : 'ガイド'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex gap-2 justify-end">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      console.log("編集ボタンが押されました。対象フロー:", flow);
                                      setCharacterDesignTab('new');
                                      
                                      if (flow.id) {
                                        fetch(`/api/tech-support/metadata/flows/${flow.id.replace('ts_', '')}`)
                                          .then(response => {
                                            if (!response.ok) {
                                              throw new Error(`APIエラー: ${response.status}`);
                                            }
                                            return response.json();
                                          })
                                          .then(troubleshootingData => {
                                            console.log("トラブルシューティングデータを取得:", troubleshootingData);
                                            
                                            const flowNodes = [
                                              {
                                                id: 'start',
                                                type: 'start',
                                                position: { x: 250, y: 50 },
                                                data: { label: '開始' }
                                              }
                                            ];
                                            
                                            if (troubleshootingData.steps && troubleshootingData.steps.length > 0) {
                                              troubleshootingData.steps.forEach((step: any, index: number) => {
                                                flowNodes.push({
                                                  id: `step_${index + 1}`,
                                                  type: 'step',
                                                  position: { x: 250, y: 150 + (index * 100) },
                                                  data: { 
                                                    label: `ステップ ${index + 1}: ${step.title || '手順'}`
                                                  }
                                                });
                                              });
                                            } else {
                                              flowNodes.push({
                                                id: 'step_1',
                                                type: 'step',
                                                position: { x: 250, y: 150 },
                                                data: { 
                                                  label: `${flow.title || 'ステップ'} 1`
                                                }
                                              });
                                            }
                                            
                                            flowNodes.push({
                                              id: 'end',
                                              type: 'end',
                                              position: { x: 250, y: 250 + ((flowNodes.length-2) * 100) },
                                              data: { label: '終了' }
                                            });
                                            
                                            const flowEdges = [];
                                            for (let i = 0; i < flowNodes.length - 1; i++) {
                                              flowEdges.push({
                                                id: `edge-${flowNodes[i].id}-${flowNodes[i+1].id}`,
                                                source: flowNodes[i].id,
                                                target: flowNodes[i+1].id,
                                                animated: true,
                                                type: 'smoothstep'
                                              });
                                            }
                                            
                                            const flowData = {
                                              id: flow.id,
                                              title: troubleshootingData.title || flow.title || 'エラー対応フロー',
                                              description: troubleshootingData.description || flow.description || '',
                                              fileName: flow.fileName || 'troubleshooting.json',
                                              nodes: flowNodes,
                                              edges: flowEdges
                                            };
                                            
                                            setFlowData(flowData);
                                            setUploadedFileName(flow.fileName || 'troubleshooting.json');
                                            
                                            toast({
                                              title: "データ読込み完了",
                                              description: `${flow.title} のフローを読み込みました`,
                                            });
                                          })
                                          .catch(error => {
                                            console.error("トラブルシューティングデータの取得エラー:", error);
                                            
                                            const fallbackData = {
                                              id: flow.id || `flow_${Date.now()}`,
                                              title: flow.title || 'フローデータ',
                                              description: "APIからデータを取得できませんでした。",
                                              fileName: flow.fileName || 'error.json',
                                              nodes: [
                                                {
                                                  id: 'start',
                                                  type: 'start',
                                                  position: { x: 250, y: 50 },
                                                  data: { label: '開始' }
                                                },
                                                {
                                                  id: 'step_1',
                                                  type: 'step',
                                                  position: { x: 250, y: 150 },
                                                  data: { 
                                                    label: `エラー: ${flow.title}`, 
                                                    message: `データの取得に失敗しました。\nエラー: ${error.message}` 
                                                  }
                                                },
                                                {
                                                  id: 'end',
                                                  type: 'end',
                                                  position: { x: 250, y: 250 },
                                                  data: { label: '終了' }
                                                }
                                              ],
                                              edges: [
                                                {
                                                  id: 'edge-start-step_1',
                                                  source: 'start',
                                                  target: 'step_1',
                                                  animated: true,
                                                  type: 'smoothstep'
                                                },
                                                {
                                                  id: 'edge-step_1-end',
                                                  source: 'step_1',
                                                  target: 'end',
                                                  animated: true,
                                                  type: 'smoothstep'
                                                }
                                              ]
                                            };
                                            
                                            setFlowData(fallbackData);
                                            setUploadedFileName(flow.fileName || 'error.json');
                                            
                                            toast({
                                              title: "データ取得エラー",
                                              description: "APIからデータを取得できませんでした。空のフローを初期化します。",
                                              variant: "destructive"
                                            });
                                          });
                                      } else {
                                        const emptyFlow = {
                                          id: `flow_${Date.now()}`,
                                          title: flow.title || '新規フロー',
                                          description: flow.description || '',
                                          fileName: flow.fileName || 'new.json',
                                          nodes: [
                                            {
                                              id: 'start',
                                              type: 'start',
                                              position: { x: 250, y: 50 },
                                              data: { label: '開始' }
                                            },
                                            {
                                              id: 'step_1',
                                              type: 'step',
                                              position: { x: 250, y: 150 },
                                              data: { 
                                                label: `${flow.title || 'ステップ'} 1`
                                              }
                                            },
                                            {
                                              id: 'end',
                                              type: 'end',
                                              position: { x: 250, y: 250 },
                                              data: { label: '終了' }
                                            }
                                          ],
                                          edges: [
                                            {
                                              id: 'edge-start-step_1',
                                              source: 'start',
                                              target: 'step_1',
                                              animated: true,
                                              type: 'smoothstep'
                                            },
                                            {
                                              id: 'edge-step_1-end',
                                              source: 'step_1',
                                              target: 'end',
                                              animated: true,
                                              type: 'smoothstep'
                                            }
                                          ]
                                        };
                                        
                                        setFlowData(emptyFlow);
                                        setUploadedFileName(flow.fileName || 'new.json');
                                        
                                        toast({
                                          title: "新規データ作成",
                                          description: "新しいフローを初期化しました",
                                        });
                                      }
                                    }}
                                  >
                                    <Edit3 className="mr-2 h-3 w-3" />
                                    編集
                                  </Button>
                                  <Button 
                                    variant="destructive" 
                                    size="sm"
                                    onClick={() => handleDeleteCharacter(flow.id)}
                                  >
                                    <Trash2 className="mr-2 h-3 w-3" />
                                    削除
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      
      {/* キャラクター削除確認ダイアログ */}
      <AlertDialog open={showConfirmDelete} onOpenChange={setShowConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>キャラクターを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              このキャラクターを削除すると、すべての関連データが失われます。この操作は元に戻すことができません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowConfirmDelete(false)}>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={executeDeleteCharacter} className="bg-red-600 hover:bg-red-700">
              <Trash2 className="mr-2 h-4 w-4" />
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default React.memo(EmergencyFlowCreator);