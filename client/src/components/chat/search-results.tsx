import { FileText, MessageCircle } from "lucide-react";
import { useOrientation } from "@/hooks/use-orientation";
import { useIsMobile } from "@/hooks/use-mobile";
import { useEffect } from "react";
import { cancelSearch, reloadImageSearchData } from "@/lib/image-search";

// 画像パスを修正するヘルパー関数 - PNG形式に統一
function fixImagePath(path: string | undefined): string {
  if (!path) return '';
  
  // knowledge-base/images/ パスを持っていれば変更しない
  if (path.includes('/knowledge-base/images/')) {
    // SVG拡張子の場合はPNGに変換
    if (path.endsWith('.svg')) {
      return path.replace('.svg', '.png');
    }
    return path;
  }
  
  // /uploads/images/ から始まる場合は /knowledge-base/images/ に変換
  if (path.includes('/uploads/images/')) {
    let newPath = path.replace('/uploads/images/', '/knowledge-base/images/');
    // SVG拡張子の場合はPNGに変換
    if (newPath.endsWith('.svg')) {
      return newPath.replace('.svg', '.png');
    }
    return newPath;
  }
  
  // /images/ から始まる場合は /knowledge-base/images/ に変換
  if (path.startsWith('/images/')) {
    let newPath = path.replace('/images/', '/knowledge-base/images/');
    // SVG拡張子の場合はPNGに変換
    if (newPath.endsWith('.svg')) {
      return newPath.replace('.svg', '.png');
    }
    return newPath;
  }
  
  // /uploads/ から始まるがサブフォルダが不明確な場合
  if (path.startsWith('/uploads/') && !path.includes('/uploads/data/') && !path.includes('/uploads/json/')) {
    const parts = path.split('/');
    const fileName = parts.pop(); // 最後の部分（ファイル名）を取得
    if (fileName) {
      // SVG拡張子の場合はPNGに変換
      if (fileName.endsWith('.svg')) {
        return `/knowledge-base/images/${fileName.replace('.svg', '.png')}`;
      }
      return `/knowledge-base/images/${fileName}`;
    }
  }
  
  // 単なるファイル名の場合（パスがない）
  if (!path.includes('/')) {
    // SVG拡張子の場合はPNGに変換
    if (path.endsWith('.svg')) {
      return `/knowledge-base/images/${path.replace('.svg', '.png')}`;
    }
    // 画像ファイルの場合はknowledge-baseフォルダに配置
    if (path.endsWith('.png') || path.endsWith('.jpg') || path.endsWith('.jpeg')) {
      return `/knowledge-base/images/${path}`;
    }
  }
  
  return path;
}

interface SearchResult {
  id: number | string;
  title: string;
  type: string; // 'image' | 'text' | 'ai-response' | string
  url?: string;
  pngFallbackUrl?: string; // 代替画像のURL（非推奨、互換性のために残す）
  content?: string;
  relevance?: number;
  timestamp?: Date;
  metadata_json?: string;
  all_slides?: string[];
  details?: string;
}

interface SearchResultsProps {
  results: SearchResult[];
  onClear: () => void;
}

export default function SearchResults({ results, onClear }: SearchResultsProps) {
  const orientation = useOrientation();
  const { isMobile } = useIsMobile();
  
  // コンポーネントマウント時に画像検索データを再読み込み
  useEffect(() => {
    // 画像検索データの初期化を実行
    console.log('SearchResultsコンポーネントがマウントされました。画像検索データを初期化します。');
    fetch('/api/tech-support/init-image-search-data', { 
      method: 'POST',
      cache: 'no-store'
    })
    .then(response => {
      if (response.ok) {
        return response.json();
      }
      throw new Error('画像検索データの初期化に失敗しました');
    })
    .then(data => {
      console.log('画像検索データの初期化が完了しました:', data);
      // 初期化が成功したら、データを再読み込み
      reloadImageSearchData();
    })
    .catch(error => {
      console.error('画像検索データの初期化中にエラーが発生しました:', error);
    });
  }, []);

  // 検索結果を表示したら検索処理を停止（点滅問題解決）
  useEffect(() => {
    if (results && results.length > 0) {
      // 検索結果が表示されたら、実行中の検索をキャンセルして点滅を防止
      cancelSearch();
    }
  }, [results]);

  // デバイスに応じたレイアウトクラス
  // iPhoneの場合は特別なスタイルを適用
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  
  // 画面方向に応じたスタイルの設定
  const isLandscape = orientation === 'landscape';
  
  // モバイル&横向きの場合は全画面表示、それ以外は通常表示
  const containerClass = isMobile && isLandscape
    ? "fixed inset-0 z-50 bg-transparent p-4 overflow-auto chat-controls-container"
    : "p-4";

  return (
    <div className={containerClass}>
      {/* モバイル表示時のみタイトルを表示 */}
      {isMobile && (
        <div className="sticky top-0 bg-blue-600 text-white p-2 z-10 mb-3">
          <div className="flex justify-between items-center">
            <h2 className="font-medium text-lg">関係画像</h2>
            <button 
              onClick={onClear}
              className="text-white hover:text-blue-200"
            >
              ✕
            </button>
          </div>
        </div>
      )}
      
      {/* サムネイル縦一列表示 */}
      <div className="flex flex-col gap-4">
        {results.map((result) => (
          <div 
            key={result.id} 
            className="thumbnail-item rounded-lg overflow-hidden bg-transparent shadow-sm w-full hover:bg-blue-50 transition-colors"
            onClick={() => {
              // イメージプレビューモーダルを表示
              window.dispatchEvent(new CustomEvent('preview-image', { 
                detail: { 
                  url: fixImagePath(result.url),
                  pngFallbackUrl: fixImagePath(result.pngFallbackUrl),
                  title: result.title,
                  content: result.content,
                  metadata_json: result.metadata_json,
                  all_slides: result.all_slides?.map(slide => fixImagePath(slide))
                } 
              }));
            }}
          >
            {result.url ? (
              // 画像サムネイル (テキストなしのカードスタイル)
              <div className="flex justify-center items-center w-full bg-transparent border border-blue-200 rounded-lg">
                <div className="relative w-full h-24 flex-shrink-0 overflow-hidden">
                  {/* バックアップ画像がある場合は先にロードして隠しておく（互換性のために残す） */}
                  {result.pngFallbackUrl && result.pngFallbackUrl.trim() !== '' && (
                    <img 
                      src={fixImagePath(result.pngFallbackUrl)}
                      alt="バックアップ画像"
                      className="hidden" 
                      style={{ display: 'none' }}
                      loading="eager"
                      decoding="async"
                    />
                  )}
                  
                  {/* 画像読み込み中のプレースホルダー - サムネイルサイズに最適化 */}
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
                    <div className="w-10 h-10 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"></div>
                  </div>
                  
                  {/* メイン画像表示 - 用途に応じた適切な画像形式を使用 */}
                  <img 
                    src={fixImagePath(result.url || '')} 
                    alt={result.title || "応急処置サポート"} 
                    className="w-full h-full object-contain bg-white p-1 z-10 relative"
                    style={{ minHeight: '96px', minWidth: '96px' }} // 最小サイズを設定して白い画像問題を防止
                    loading="eager" // 急いで読み込んで点滅を防止
                    decoding="async" // 非同期デコードで表示を高速化
                    // 画像読み込みエラー時の包括的なフォールバック処理
                    onError={(e) => {
                      const imgElement = e.currentTarget;
                      const originalSrc = imgElement.src || '';
                      
                      console.log(`画像読み込みエラー (${result.id}): ${originalSrc}`);
                      
                      try {
                        // 1. 専用フォールバックURLが指定されている場合はそちらを優先
                        if (result.pngFallbackUrl && result.pngFallbackUrl.trim() !== '') {
                          console.log('指定されたフォールバックに切り替え:', result.pngFallbackUrl);
                          imgElement.src = fixImagePath(result.pngFallbackUrl);
                          return;
                        }
                        
                        // 2. 拡張子ベースのフォールバック（SVG→PNG、JPEG→PNG）
                        if (originalSrc.includes('.svg')) {
                          // SVGが読み込めない場合はPNGに変更
                          console.log('SVG読み込みエラー、PNG代替に切り替え:', originalSrc, '->', originalSrc.replace(/\.svg$/, '.png'));
                          const pngPath = originalSrc.replace(/\.svg$/, '.png');
                          imgElement.src = pngPath;
                          return;
                        }
                        
                        if (originalSrc.includes('.jpeg') || originalSrc.includes('.jpg')) {
                          // JPEGが読み込めない場合はPNGに変更
                          console.log('JPEG読み込みエラー、PNG代替に切り替え');
                          const pngPath = originalSrc.replace(/\.(jpeg|jpg)$/, '.png');
                          imgElement.src = pngPath;
                          return;
                        }
                        
                        // 3. ファイル名を抽出して実際に存在する画像を探す
                        // 例: engine_001.svg → mc_1745235933176_img_001.png に変更
                        const fileName = originalSrc.split('/').pop();
                        if (fileName) {
                          // ファイル名から番号部分を抽出
                          const numMatch = fileName.match(/_(\d+)\./);
                          if (numMatch && numMatch[1]) {
                            const imgNum = numMatch[1];
                            console.log(`ファイル番号 ${imgNum} を持つ実在画像を検索`);
                            
                            // 実在する画像ファイルパターンで置き換え
                            const realImagePattern = `/knowledge-base/images/mc_1745235933176_img_${imgNum}.png`;
                            console.log('実際の画像パターンに置き換え:', realImagePattern);
                            imgElement.src = realImagePattern;
                            return;
                          }
                        }
                        
                        // 4. パスの修正を試みる（knowledge-baseパスが含まれていない場合）
                        if (!originalSrc.includes('/knowledge-base/')) {
                          const fileName = originalSrc.split('/').pop();
                          if (fileName) {
                            console.log('パス形式エラー、knowledge-baseパスに修正');
                            imgElement.src = `/knowledge-base/images/${fileName}`;
                            return;
                          }
                        }
                        
                        // 5. 既知の実在する画像を代替として使用
                        // ファイルの存在が確認された画像のいずれかを表示
                        console.log('既知の実在画像に置き換え');
                        const existingImages = [
                          '/knowledge-base/images/mc_1745235933176_img_001.png',
                          '/knowledge-base/images/mc_1745235933176_img_003.png',
                          '/knowledge-base/images/mc_1745235933176_img_004.png'
                        ];
                        // カテゴリに応じた画像を選択
                        let selectedImage = existingImages[0]; // デフォルト
                        if (result.title && result.title.includes('エンジン')) {
                          selectedImage = existingImages[0];
                        } else if (result.title && (result.title.includes('冷却') || result.title.includes('水'))) {
                          selectedImage = existingImages[1];
                        } else if (result.title && (result.title.includes('ブレーキ') || result.title.includes('制動'))) {
                          selectedImage = existingImages[2];
                        }
                        console.log('実在画像に置き換え:', selectedImage);
                        imgElement.src = selectedImage;
                        return;
                        
                        // 6. 最終手段: エラー表示用のデフォルト画像を表示
                        console.log('フォールバック失敗、エラー表示に切り替え');
                        imgElement.style.display = 'none'; // 画像を非表示
                        
                        // エラー表示をコンテナに追加
                        const container = imgElement.parentElement;
                        if (container) {
                          const errorElement = document.createElement('div');
                          errorElement.className = 'flex items-center justify-center h-full w-full bg-gray-100 text-gray-500';
                          errorElement.textContent = '画像を読み込めません';
                          container.appendChild(errorElement);
                        }
                      } catch (errorHandlingErr) {
                        console.error('エラー処理中に例外が発生:', errorHandlingErr);
                      }
                    }}
                    onLoad={(e) => {
                      // 画像が正常に読み込まれたらクラスを調整
                      const imgElement = e.currentTarget;
                      imgElement.classList.add('loaded');
                      
                      // プレースホルダーを非表示
                      const container = imgElement.parentElement;
                      if (container) {
                        const placeholders = container.querySelectorAll('.animate-spin');
                        placeholders.forEach(ph => {
                          if (ph.parentElement) {
                            ph.parentElement.style.display = 'none';
                          }
                        });
                      }
                    }}
                  />
                  {/* 画像説明タイトルは非表示に変更（ユーザー要求により） */}
                </div>
              </div>
            ) : (
              // テキストコンテンツとドキュメント (横長スタイル)
              <div className="flex h-24 w-full bg-transparent border border-blue-200 rounded-lg">
                <div className="relative w-24 h-24 flex-shrink-0 flex items-center justify-center bg-blue-50">
                  {result.type === 'ai-response' ? (
                    <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center">
                      <span className="material-icons text-white">smart_toy</span>
                    </div>
                  ) : result.type === 'text' ? (
                    <MessageCircle className="h-12 w-12 text-blue-600" />
                  ) : (
                    <FileText className="h-12 w-12 text-blue-600" />
                  )}
                </div>
                <div className="flex-1 p-2 flex flex-col justify-center">
                  <h3 className="text-sm font-bold text-blue-700">{result.title || (result.type === 'ai-response' ? "AI応答" : "ドキュメント")}</h3>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
