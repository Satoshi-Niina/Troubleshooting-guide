import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// 画像パスを修正するヘルパー関数 - より単純化したバージョン
function fixImagePath(path: string | undefined): string {
  if (!path) return '';
  
  // プロトコルを含むURLの場合はそのまま返す (外部リンク)
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  
  // すでに knowledge-base パスを持っていれば変更しない
  if (path.includes('/knowledge-base/images/')) {
    return path;
  }
  
  // 画像ファイルの拡張子を持つパスはファイル名だけ抽出して知識ベースのパスに変換
  if (path.endsWith('.svg') || path.endsWith('.png') || path.endsWith('.jpg') || path.endsWith('.jpeg')) {
    const fileName = path.split('/').pop();
    if (fileName) {
      console.log('プレビューモーダル: パス変換:', path, ' -> ', `/knowledge-base/images/${fileName}`);
      return `/knowledge-base/images/${fileName}`;
    }
  }

  return path;
}

interface ImageMetaData {
  metadata?: {
    タイトル?: string;
    作成者?: string;
    作成日?: string;
    修正日?: string;
    説明?: string;
  };
  slides?: Array<{
    スライド番号?: number;
    タイトル?: string | null;
    本文?: string[];
    ノート?: string | null;
    画像テキスト?: Array<{
      画像パス?: string;
      テキスト?: string;
    }>;
  }>;
}

export default function ImagePreviewModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [metadataUrl, setMetadataUrl] = useState<string | null>(null);
  const [allSlides, setAllSlides] = useState<string[]>([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [metadataJson, setMetadataJson] = useState<ImageMetaData | null>(null);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  
  // メタデータを読み込む
  const loadMetadata = async (url: string) => {
    try {
      setIsLoadingMetadata(true);
      const response = await fetch(url);
      if (!response.ok) throw new Error('Metadata fetch failed');
      const data = await response.json();
      setMetadataJson(data);
    } catch (error) {
      console.error("Failed to load metadata:", error);
      setMetadataJson(null);
    } finally {
      setIsLoadingMetadata(false);
    }
  };

  // スライドを変更する
  const changeSlide = (direction: 'next' | 'prev') => {
    if (!allSlides.length) return;
    
    let newIndex;
    if (direction === 'next') {
      newIndex = (currentSlideIndex + 1) % allSlides.length;
    } else {
      newIndex = (currentSlideIndex - 1 + allSlides.length) % allSlides.length;
    }
    
    setCurrentSlideIndex(newIndex);
    
    // SVGの場合はPNG代替を自動的に使用
    const newSlideUrl = allSlides[newIndex];
    setImageUrl(newSlideUrl);
    
    // PNG代替を自動設定
    if (newSlideUrl && newSlideUrl.toLowerCase().endsWith('.svg')) {
      const pngFallback = newSlideUrl.replace(/\.svg$/i, '.png');
      setPngFallbackUrl(pngFallback);
    } else {
      setPngFallbackUrl(null);
    }
  };

  // PNG代替URL用の状態変数
  const [pngFallbackUrl, setPngFallbackUrl] = useState<string | null>(null);
  // タイトルとコンテンツの状態変数を追加
  const [title, setTitle] = useState<string>("画像プレビュー");
  const [content, setContent] = useState<string | null>(null);

  useEffect(() => {
    // Listen for preview-image event
    const handlePreviewImage = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        // URLを設定
        if (customEvent.detail.url) {
          setImageUrl(customEvent.detail.url);
        }
        
        // PNG代替URLがある場合は設定
        if (customEvent.detail.pngFallbackUrl) {
          setPngFallbackUrl(customEvent.detail.pngFallbackUrl);
          console.log('PNG代替URL設定:', customEvent.detail.pngFallbackUrl);
        } else {
          setPngFallbackUrl(null);
        }
        
        // タイトルを設定
        if (customEvent.detail.title) {
          setTitle(customEvent.detail.title);
        } else {
          setTitle("画像プレビュー");
        }
        
        // コンテンツ（説明文）を設定
        if (customEvent.detail.content) {
          setContent(customEvent.detail.content);
        } else {
          setContent(null);
        }
        
        // メタデータJSONへのパスを設定
        if (customEvent.detail.metadata_json) {
          setMetadataUrl(customEvent.detail.metadata_json);
          loadMetadata(customEvent.detail.metadata_json);
        } else {
          setMetadataUrl(null);
          setMetadataJson(null);
        }
        
        // 全スライドの配列を設定
        if (customEvent.detail.all_slides && Array.isArray(customEvent.detail.all_slides)) {
          setAllSlides(customEvent.detail.all_slides);
          // 現在の画像がスライド配列のどこにあるか見つける
          const index = customEvent.detail.all_slides.findIndex(
            (url: string) => url === customEvent.detail.url
          );
          setCurrentSlideIndex(index >= 0 ? index : 0);
        } else {
          setAllSlides([]);
          setCurrentSlideIndex(0);
        }
        
        // モーダルを必ず表示する
        setIsOpen(true);
        
        // 情報パネルは常に非表示状態から開始し、表示設定は維持
        // これによりパネルの表示/非表示を切り替えても点滅しなくなる
        if (!showInfo && customEvent.detail.content) {
          setShowInfo(true);
        }
      }
    };
    
    window.addEventListener('preview-image', handlePreviewImage);
    
    return () => {
      window.removeEventListener('preview-image', handlePreviewImage);
    };
  }, []);

  // 現在のスライドに関連するスライド情報を取得
  const getCurrentSlideInfo = () => {
    if (!metadataJson || !metadataJson.slides) return null;
    
    // 現在のスライドインデックスに一致するスライド情報を探す
    const currentSlideNumber = currentSlideIndex + 1; // 0-indexから1-indexに変換
    return metadataJson.slides.find(
      slide => slide.スライド番号 === currentSlideNumber
    );
  };

  const currentSlideInfo = getCurrentSlideInfo();

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent 
        className="max-w-5xl bg-black bg-opacity-90 border border-blue-400 flex flex-col items-center justify-center p-0 rounded-xl"
        aria-labelledby="dialog-title"
        aria-describedby="dialog-description"
      >
        <div className="sr-only">
          <h2 id="dialog-title">{metadataJson?.metadata?.タイトル || title}</h2>
          <p id="dialog-description">拡大画像ビューワー</p>
        </div>
        <div className="w-full flex justify-between items-center p-2 bg-blue-700 text-white">
          <h3 className="text-sm font-medium ml-2">
            {metadataJson?.metadata?.タイトル || title} 
            {allSlides.length > 1 && ` - スライド ${currentSlideIndex + 1}/${allSlides.length}`}
          </h3>
          <div className="flex items-center">
            <Button 
              className="text-white hover:bg-blue-600 rounded-full" 
              variant="ghost" 
              size="icon"
              onClick={() => setShowInfo(!showInfo)}
            >
              <Info className="h-5 w-5" />
            </Button>
            <Button 
              className="text-white hover:bg-blue-600 rounded-full" 
              variant="ghost" 
              size="icon" 
              onClick={() => setIsOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>
        
        <div className="relative w-full max-h-[70vh] flex items-center justify-center p-2">
          {/* 前へボタン */}
          {allSlides.length > 1 && (
            <Button 
              className="absolute left-2 z-10 bg-blue-600 hover:bg-blue-700 text-white rounded-full opacity-75 hover:opacity-100" 
              size="icon"
              onClick={() => changeSlide('prev')}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
          )}
          
          {/* メイン画像 - SVGを優先表示 */}
          <img 
            src={fixImagePath(imageUrl || pngFallbackUrl || '')} 
            alt={currentSlideInfo?.タイトル || "拡大画像"} 
            className="max-w-full max-h-[70vh] object-contain rounded-lg border border-blue-500"
            loading="eager"
            decoding="async"
          />
          
          {/* 次へボタン */}
          {allSlides.length > 1 && (
            <Button 
              className="absolute right-2 z-10 bg-blue-600 hover:bg-blue-700 text-white rounded-full opacity-75 hover:opacity-100" 
              size="icon"
              onClick={() => changeSlide('next')}
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          )}
        </div>
        
        {/* 情報パネル - 表示/非表示切り替え可能 */}
        {showInfo && (
          <div className="w-full border-t border-blue-500 bg-gray-900 p-4 text-white">
            <Tabs defaultValue="slide" className="w-full">
              <TabsList className="mb-2">
                <TabsTrigger value="slide">スライド情報</TabsTrigger>
                <TabsTrigger value="document">ドキュメント情報</TabsTrigger>
              </TabsList>
              
              <TabsContent value="slide">
                {content ? (
                  <div className="text-sm mb-3">
                    <h4 className="font-medium mb-2 text-blue-200">{title}</h4>
                    <div className="bg-gray-800 p-3 rounded border border-blue-800 mb-3">
                      <p className="text-gray-200 whitespace-pre-wrap">{content}</p>
                    </div>
                  </div>
                ) : currentSlideInfo ? (
                  <div className="text-sm">
                    <h4 className="font-medium mb-1">
                      {currentSlideInfo.タイトル || `スライド ${currentSlideInfo.スライド番号}`}
                    </h4>
                    
                    {currentSlideInfo.本文 && currentSlideInfo.本文.length > 0 && (
                      <div className="mb-2">
                        <p className="text-xs text-blue-300">本文:</p>
                        <ul className="list-disc list-inside pl-2">
                          {currentSlideInfo.本文.map((text, idx) => (
                            <li key={idx} className="text-gray-200">{text}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {currentSlideInfo.ノート && (
                      <div className="mb-2">
                        <p className="text-xs text-blue-300">ノート:</p>
                        <p className="text-gray-200 whitespace-pre-wrap">{currentSlideInfo.ノート}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-400">スライド情報はありません</p>
                )}
              </TabsContent>
              
              <TabsContent value="document">
                {metadataJson?.metadata ? (
                  <div className="text-sm grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-xs text-blue-300">タイトル:</p>
                      <p className="text-gray-200">{metadataJson.metadata.タイトル || "なし"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-blue-300">作成者:</p>
                      <p className="text-gray-200">{metadataJson.metadata.作成者 || "なし"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-blue-300">作成日:</p>
                      <p className="text-gray-200">{metadataJson.metadata.作成日 || "なし"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-blue-300">修正日:</p>
                      <p className="text-gray-200">{metadataJson.metadata.修正日 || "なし"}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-blue-300">説明:</p>
                      <p className="text-gray-200">{metadataJson.metadata.説明 || "なし"}</p>
                    </div>
                  </div>
                ) : isLoadingMetadata ? (
                  <p className="text-gray-400">メタデータを読み込み中...</p>
                ) : (
                  <p className="text-gray-400">ドキュメント情報はありません</p>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
        
        {/* スライドのサムネイルリスト */}
        {allSlides.length > 1 && (
          <div className="w-full px-2 py-3 border-t border-blue-500 overflow-x-auto flex bg-gray-800">
            {allSlides.map((slide, index) => (
              <div 
                key={index}
                className={`flex-shrink-0 mx-1 cursor-pointer transition-all ${
                  index === currentSlideIndex 
                    ? 'border-2 border-blue-500 scale-105' 
                    : 'border border-gray-600 hover:border-blue-400'
                }`}
                onClick={() => {
                  setCurrentSlideIndex(index);
                  setImageUrl(slide);
                }}
              >
                <img 
                  src={fixImagePath(slide)} 
                  alt={`スライド ${index + 1}`}
                  className="h-16 w-24 object-cover"
                  loading="eager"
                  decoding="async"
                />
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
