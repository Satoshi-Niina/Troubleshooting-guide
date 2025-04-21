import Fuse from 'fuse.js';
import { apiRequest } from './queryClient';

// 画像検索用の専用インターフェース定義
interface ImageSearchItem {
  id: string | number;
  file: string;
  pngFallback?: string;  // PNG形式のフォールバックパス
  svgPath?: string;      // SVG形式のパス
  title: string;
  category: string;
  keywords: string[];
  description: string;
  metadata?: any;
  all_slides?: string[];
  details?: string;
}

// 画像検索用データ
let imageSearchData: ImageSearchItem[] = [];

// 画像検索専用JSONデータを読み込む
async function loadImageSearchData() {
  try {
    // 最新のJSON ファイルを取得する
    const timestamp = new Date().getTime();
    
    // 最新のmetadataJSONを探す
    const dirResponse = await fetch(`/api/tech-support/list-json-files?t=${timestamp}`);
    let metadataFile = 'mc_1744105287766_metadata.json'; // デフォルトファイル
    
    if (dirResponse.ok) {
      const fileList = await dirResponse.json();
      if (Array.isArray(fileList) && fileList.length > 0) {
        // 最新のメタデータファイルを選択
        metadataFile = fileList[0];
        console.log(`最新のメタデータファイルを使用します: ${metadataFile}`);
      }
    }
    
    // knowledge-baseからJSONファイルを読み込む
    let metadata;
    try {
      const response = await fetch(`/knowledge-base/json/${metadataFile}?t=${timestamp}`);
      if (!response.ok) {
        throw new Error(`knowledge-baseからのメタデータJSONの読み込みに失敗: ${metadataFile}`);
      }
      metadata = await response.json();
    } catch (error) {
      console.error("メタデータJSONの読み込みに失敗しました:", error);
      throw error; // 上位のcatchで処理するためにエラーを再スロー
    }
    
    // 既存データをクリア
    imageSearchData = [];
    
    if (metadata && metadata.slides && Array.isArray(metadata.slides)) {
      console.log(`メタデータJSONを読み込みました: ${metadata.slides.length}件のスライド`);
      
      // スライドからImageSearchItem形式に変換（PNGまたはSVGファイルを優先）
      const slidesData = metadata.slides.map((slide: any) => {
        // 画像パスを取得
        let imagePath = slide['画像テキスト'] && slide['画像テキスト'][0] ? slide['画像テキスト'][0]['画像パス'] : "";
        
        // 画像パスの参照を knowledge-base/images に統一
        if (imagePath) {
          // ファイル名だけを抽出
          const fileName = imagePath.split('/').pop();
          if (fileName) {
            // 知識ベースの画像ディレクトリに統一
            imagePath = `/knowledge-base/images/${fileName}`;
          }
        }
        
        // JPEG画像の場合はPNGに置き換える
        if (imagePath.toLowerCase().endsWith('.jpeg') || imagePath.toLowerCase().endsWith('.jpg')) {
          // 既にPNGバージョンがあるか確認する処理を追加
          const basePath = imagePath.substring(0, imagePath.lastIndexOf('.'));
          const pngPath = `${basePath}.png`;
          const svgPath = `${basePath}.svg`;
          // ここではPNGをデフォルトとして使用
          imagePath = pngPath;
        }
        
        return {
          id: `slide_${slide['スライド番号']}`,
          file: imagePath,
          title: slide['タイトル'] || `スライド ${slide['スライド番号']}`,
          category: "保守用車マニュアル",
          keywords: [...(slide['本文'] || []), slide['タイトル'] || ""].filter(Boolean),
          description: "", // テキスト表示を削除
          details: "" // テキスト表示を削除
        };
      });
      
      // 有効な画像パスを持つスライドのみを追加
      slidesData.filter((item: any) => item.file && item.file.length > 0)
        .forEach((item: any) => imageSearchData.push(item));
      
      // 埋め込み画像もデータに追加 (PNGを優先)
      if (metadata.embeddedImages && Array.isArray(metadata.embeddedImages)) {
        console.log(`${metadata.embeddedImages.length}件の埋め込み画像を処理します`);
        
        const embeddedImages = metadata.embeddedImages
          .filter((img: any) => img['抽出パス'] && typeof img['抽出パス'] === 'string')
          .map((img: any, index: number) => {
            let imagePath = img['抽出パス'];
            
            // 画像パスの参照を knowledge-base ディレクトリに統一
            if (imagePath) {
              // ファイル名だけを抽出
              const fileName = imagePath.split('/').pop();
              if (fileName) {
                imagePath = `/knowledge-base/images/${fileName}`;
              }
            }
            
            // JPEG画像の場合はできればPNGに置き換え
            if (imagePath.toLowerCase().endsWith('.jpeg') || imagePath.toLowerCase().endsWith('.jpg')) {
              const basePath = imagePath.substring(0, imagePath.lastIndexOf('.'));
              const pngPath = `${basePath}.png`;
              // 実際にはPNGファイルがあるかどうかは確認できないが、
              // 最終的には表示時にフォールバックする
              imagePath = pngPath;
            }
            
            return {
              id: `img_${index+1}`,
              file: imagePath,
              title: `画像 ${index+1}`,
              category: "部品写真",
              keywords: ["保守用車", "部品", "写真"],
              description: "", // テキスト表示を削除
              details: "" // テキスト表示を削除
            };
          });
          
        // PNG/SVG画像のみを追加（優先度の高い画像形式）
        embeddedImages
          .filter((item: any) => 
            item.file.toLowerCase().endsWith('.png') || 
            item.file.toLowerCase().endsWith('.svg'))
          .forEach((item: any) => imageSearchData.push(item));
      }
      
      console.log(`検索用データを準備完了: ${imageSearchData.length}件`);
    } else {
      throw new Error('メタデータのフォーマットが無効です');
    }
  } catch (error) {
    console.error("画像検索データの読み込みに失敗しました:", error);
    
    // エラーを報告し、サーバーに画像検索データの再生成をリクエスト
    try {
      const initResponse = await fetch('/api/tech-support/init-image-search-data', {
        method: 'POST'
      });
      
      if (initResponse.ok) {
        const initData = await initResponse.json();
        console.log("画像検索データを初期化しました:", initData);
        
        // knowledge-baseから再度データを読み込み
        try {
          // 優先順位1: knowledge-base/dataディレクトリから読み込む
          const kbReloadResponse = await fetch(`/knowledge-base/data/image_search_data.json?t=${Date.now()}`);
          if (kbReloadResponse.ok) {
            const reloadedData = await kbReloadResponse.json();
            if (Array.isArray(reloadedData)) {
              console.log(`再読み込みした画像検索データ: ${reloadedData.length}件`);
              imageSearchData = reloadedData;
              return;
            }
          } else {
            throw new Error('knowledge-baseのデータ読み込みに失敗しました');
          }
        } catch (error) {
          console.warn(`knowledge-base/dataからの読み込みに失敗しました:`, error);
          
          try {
            // 優先順位2: uploads/dataディレクトリから読み込む（下位互換性用）
            const uploadsReloadResponse = await fetch(`/uploads/data/image_search_data.json?t=${Date.now()}`);
            if (uploadsReloadResponse.ok) {
              const reloadedData = await uploadsReloadResponse.json();
              if (Array.isArray(reloadedData)) {
                console.log(`uploads/dataから再読み込みした画像検索データ: ${reloadedData.length}件`);
                imageSearchData = reloadedData;
                return;
              }
            } else {
              throw new Error('uploads/dataのデータ読み込みに失敗しました');
            }
          } catch (uploadError) {
            console.error(`両方のソースからの画像検索データ読み込みに失敗しました:`, uploadError);
          }
        }
      }
    } catch (initError) {
      console.error("画像検索データの初期化に失敗:", initError);
    }
    
    // 直接knowledge-baseからJSONファイルを読み込む（エラーハンドリング用）
    console.log("knowledge-baseからJSONの読み込みを試みます");
    try {
      // knowledge-baseパスのみ使用（一元化）
      const knowledgeBasePath = '/knowledge-base/data/image_search_data.json';
      
      let directData = null;
      
      try {
        const directFetch = await fetch(`${knowledgeBasePath}?t=${Date.now()}`, { 
          cache: 'no-store',  // キャッシュを無視
          headers: { 'pragma': 'no-cache', 'cache-control': 'no-cache' }
        });
        
        if (directFetch.ok) {
          const fetchedData = await directFetch.json();
          if (Array.isArray(fetchedData) && fetchedData.length > 0) {
            console.log(`知識ベースから画像検索データを読み込みました: ${fetchedData.length}件`);
            directData = fetchedData;
          }
        }
      } catch (pathError) {
        console.warn(`知識ベースからの読み込みに失敗:`, pathError);
      }
      
      // いずれかのパスから読み込めたら使用
      if (directData) {
        imageSearchData = directData;
        return;
      } else {
        // 初期化APIを直接実行して再読み込みを試みる
        try {
          const reinitResp = await fetch('/api/tech-support/init-image-search-data', { 
            method: 'POST',
            cache: 'no-store'
          });
          
          if (reinitResp.ok) {
            const initData = await reinitResp.json();
            console.log('画像検索データを初期化しました:', initData);
            
            // 少し待機して再試行
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // 初期化後は知識ベースから試行
            const retryPaths = [
              '/knowledge-base/data/image_search_data.json'
            ];
            
            let retryData = null;
            for (const retryPath of retryPaths) {
              try {
                const retryFetch = await fetch(`${retryPath}?t=${Date.now()}`, {
                  cache: 'no-store'
                });
                
                if (retryFetch.ok) {
                  const data = await retryFetch.json();
                  if (Array.isArray(data) && data.length > 0) {
                    console.log(`初期化後、パス ${retryPath} からの再読み込みに成功: ${data.length}件`);
                    retryData = data;
                    break;
                  }
                }
              } catch (retryErr) {
                console.warn(`初期化後の再読み込み失敗 (${retryPath}):`, retryErr);
              }
            }
            
            if (retryData) {
              console.log(`初期化後、${retryData.length}件のデータを読み込みました`);
              imageSearchData = retryData;
              return;
            }
          }
        } catch (reinitErr) {
          console.error('再初期化に失敗:', reinitErr);
        }
        
        throw new Error("どのパスからもデータを読み込めませんでした");
      }
    } catch (directError) {
      console.error("直接JSONからの読み込みに失敗:", directError);
    }
    
    // それでも失敗した場合はフォールバックデータ
    console.log("フォールバック画像検索データを使用します");
    // データ構造は実際のJSONファイルと同じ構造を保持
    imageSearchData = [
      {
        id: "engine_001",
        file: "/knowledge-base/images/engine_001.svg",
        title: "エンジン基本構造図",
        category: "エンジン",
        keywords: ["エンジン", "モーター", "動力系", "駆動部"],
        description: "保守用車のディーゼルエンジン基本構造図。主要部品とその配置を示す。"
      },
      {
        id: "cooling_001",
        file: "/knowledge-base/images/cooling_001.svg",
        title: "冷却システム概略図",
        category: "冷却系統",
        keywords: ["冷却", "ラジエーター", "水漏れ", "オーバーヒート"],
        description: "保守用車の冷却システム概略図。冷却水の流れと主要コンポーネントを表示。"
      },
      {
        id: "frame_001",
        file: "/knowledge-base/images/frame_001.svg",
        title: "車体フレーム構造",
        category: "車体",
        keywords: ["フレーム", "シャーシ", "車体", "構造", "強度部材"],
        description: "保守用車の車体フレーム構造図。サイドメンバーとクロスメンバーの配置を表示。"
      },
      {
        id: "cabin_001",
        file: "/knowledge-base/images/cabin_001.svg",
        title: "運転キャビン配置図",
        category: "運転室",
        keywords: ["キャビン", "運転室", "操作パネル", "計器盤"],
        description: "保守用車の運転キャビン内部配置図。操作機器と計器類の位置を表示。"
      }
    ];
  }
}

// アプリケーション起動時にデータをロード
loadImageSearchData();

// データを強制的に再読み込む関数を提供
export const reloadImageSearchData = () => {
  console.log('画像検索データを強制的に再読み込みします');
  loadImageSearchData();
};

// 画像検索データが更新されたときにリロードするイベントリスナー
window.addEventListener('image-search-data-updated', () => {
  console.log('画像検索データの更新を検知しました。再読み込みします。');
  loadImageSearchData();
});

// Fuse.js 画像検索用の設定
const fuseOptions = {
  includeScore: true,
  keys: [
    { name: 'title', weight: 0.4 },
    { name: 'category', weight: 0.3 },
    { name: 'description', weight: 0.3 },
    { name: 'keywords', weight: 0.7 }, // キーワードの重みをさらに強化
    { name: 'metadata', weight: 0.2 }, // メタデータも検索対象に
    { name: 'details', weight: 0.4 }
  ],
  threshold: 0.5, // 閾値を上げることで、より広く検索結果を取得
  ignoreLocation: true, // 単語の位置を無視して検索
  useExtendedSearch: true, // 拡張検索モード
  minMatchCharLength: 2, // 最低2文字一致から検索対象に
  distance: 300, // 単語間の距離制限を緩める（より広く検索）
};

// 画像検索用のFuseインスタンスを作成するヘルパー関数
function getFuseInstance() {
  return new Fuse(imageSearchData, fuseOptions);
}

// 最後の検索テキスト（連続検索における重複防止用）
let lastSearchText = '';
// 最後の検索結果（連続検索における点滅防止用）
let lastSearchResults: any[] = [];
// 検索中フラグ（同時に複数の検索が走らないようにするため）
let isSearching = false;

/**
 * 検索処理を強制的にキャンセルする関数
 * 検索結果が表示された後に呼び出して点滅を防止する
 */
export const cancelSearch = (): void => {
  isSearching = false;
  console.log('画像検索処理がキャンセルされました');
};

/**
 * テキストクエリに基づいて画像データを検索
 * @param text 検索クエリテキスト
 * @param autoStopAfterResults 結果が見つかったら検索を自動停止するかどうか
 * @returns 検索結果の配列
 */
export const searchByText = async (text: string, autoStopAfterResults: boolean = true): Promise<any[]> => {
  try {
    // ログ出力
    console.log('検索キーワード:', text);
    console.log('キーワードタイプ:', 
      text.includes('エンジン') ? 'エンジン関連あり' : '',
      text.includes('冷却') ? '冷却関連あり' : '',
      text.includes('車体') ? '車体関連あり' : '');
    
    // 検索テキストが空の場合は空配列を返す
    if (!text || text.trim() === '') {
      console.log('検索テキストが空のため検索をスキップします');
      lastSearchText = '';
      lastSearchResults = [];
      return [];
    }
    
    // 前回と同じ検索キーワードなら、キャッシュした結果を返す（点滅防止）
    if (text === lastSearchText && lastSearchResults.length > 0) {
      console.log('前回と同じ検索テキストのため、キャッシュされた結果を返します:', lastSearchResults.length);
      // 検索を停止（キャッシュヒット時）
      isSearching = false;
      return lastSearchResults;
    }
    
    // 既に検索中なら新しい検索は開始せず、前回の結果を返す（点滅防止）
    if (isSearching) {
      console.log('別の検索が進行中のため、前回の結果を返します');
      return lastSearchResults;
    }
    
    // 検索開始
    isSearching = true;
    console.log('画像検索開始:', text);
    lastSearchText = text;
    
    // 検索開始前にデータがロードされているか確認
    if (imageSearchData.length === 0) {
      console.log('画像検索データが未ロードのため、検索前に初期化を実行します');
      try {
        const reinitResp = await fetch('/api/tech-support/init-image-search-data', { 
          method: 'POST',
          cache: 'no-store'
        });
        
        if (reinitResp.ok) {
          await loadImageSearchData();
        }
      } catch (err) {
        console.error('初期ロードエラー:', err);
      }
    }
    
    try {
      // 最初にデータが存在することを確認
      if (imageSearchData.length === 0) {
        console.log('画像検索データが読み込まれていないため再ロード');
        await loadImageSearchData();
        
        // データが読み込めたかを再確認
        if (imageSearchData.length === 0) {
          // データがまだ空の場合、画像初期化APIを呼び出し
          try {
            const initResponse = await fetch('/api/tech-support/init-image-search-data', {
              method: 'POST'
            });
            
            if (initResponse.ok) {
              const initData = await initResponse.json();
              console.log("画像検索データを初期化しました:", initData);
              
              // データを直接再読み込み
              await loadImageSearchData();
            }
          } catch (initErr) {
            console.error("緊急初期化に失敗:", initErr);
          }
        }
      }
      
      // データが読み込まれているか最終確認
      if (imageSearchData.length === 0) {
        console.log('画像検索データがまだ読み込まれていません。知識ベースからの最終読み込みを試みます');
        // knowledge-baseから直接読み込み
        try {
          const response = await fetch('/knowledge-base/data/image_search_data.json');
          if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data) && data.length > 0) {
              imageSearchData = data;
              console.log(`知識ベースから ${data.length} 件のデータを読み込みました`);
            }
          }
        } catch (err) {
          console.error('知識ベースからの最終読み込みに失敗:', err);
        }
      }
      
      // Fuseインスタンスを取得して検索を実行
      const fuse = getFuseInstance();
      
      // デバッグ用：データの状態を確認
      console.log(`検索実行時のデータ件数: ${imageSearchData.length}件`);
      if (imageSearchData.length > 0) {
        // 検索対象データの一部をログ出力 (先頭3件のIDと画像パス)
        const sampleData = imageSearchData.slice(0, 3).map(item => ({
          id: item.id,
          file: item.file
        }));
        console.log(`検索用サンプルデータ:`, sampleData);
      }
      
      // キーワードを分割して検索
      const keywords = text.split(/\s+/).filter(k => k.length > 0);
      let searchResults: any[] = [];
      
      if (keywords.length > 1) {
        console.log(`複数キーワード検索: ${keywords.join(', ')}`);
        // 複数のキーワードがある場合、各キーワードで検索
        for (const keyword of keywords) {
          const results = fuse.search(keyword);
          searchResults.push(...results);
        }
        
        // 重複を除去（IDをキーとして使用）
        const uniqueResults = new Map<string | number, any>();
        searchResults.forEach(result => {
          const existingResult = uniqueResults.get(result.item.id);
          if (!existingResult || (existingResult.score && result.score && result.score < existingResult.score)) {
            uniqueResults.set(result.item.id, result);
          }
        });
        
        searchResults = Array.from(uniqueResults.values());
      } else {
        console.log(`単一キーワード検索: ${text}`);
        searchResults = fuse.search(text);
      }
      
      console.log(`検索結果: ${searchResults.length}件見つかりました`);
      
      // 検索結果がある場合、検索を自動停止するオプションが有効なら検索を停止
      if (autoStopAfterResults && searchResults.length > 0) {
        console.log('検索結果を表示するため検索処理を自動停止します');
        console.log('検索結果が見つかったため画像検索を停止します');
        // このタイミングではまだ検索フラグは維持し、フォーマット処理完了後に停止
      } else if (searchResults.length === 0) {
        // 検索結果がない場合、関連する画像がない可能性があるため
        // 最もマッチする可能性のある画像を強制的に表示する
        console.log('検索結果が0件のため、関連カテゴリの画像を表示します');
        
        // 特定のキーワードに基づいてカテゴリをマッピング
        let targetCategory = '';
        if (text.includes('エンジン') || text.includes('モーター') || text.includes('駆動')) {
          targetCategory = 'エンジン';
        } else if (text.includes('冷却') || text.includes('水') || text.includes('温度')) {
          targetCategory = '冷却系統';
        } else if (text.includes('フレーム') || text.includes('車体') || text.includes('シャーシ')) {
          targetCategory = '車体';
        } else if (text.includes('運転') || text.includes('キャビン') || text.includes('操作')) {
          targetCategory = '運転室';
        }
        
        // カテゴリに基づいて画像を検索
        if (targetCategory && imageSearchData.length > 0) {
          const categoryResults = imageSearchData.filter(item => 
            item.category === targetCategory || 
            (item.keywords && item.keywords.some(k => k.includes(targetCategory)))
          );
          
          if (categoryResults.length > 0) {
            console.log(`カテゴリ「${targetCategory}」に基づいて ${categoryResults.length} 件の関連画像を見つけました`);
            // カテゴリに基づく結果をFuse.js形式に変換
            searchResults = categoryResults.map(item => ({
              item,
              score: 0.5, // 中程度の関連度
              refIndex: 0
            }));
          }
        }
      }
      
      // 検索結果を必要な形式にマッピング
      const formattedResults = searchResults.map(result => {
        const item = result.item;
        
        // 画像URLとフォールバックを設定
        let imageUrl = '';
        let fallbackUrl = '';
        
        // SVGパスがあればそれを優先して使用
        if (item.svgPath) {
          imageUrl = item.svgPath;
          // SVG形式の場合はPNGをフォールバックとして設定
          fallbackUrl = item.pngFallback || (imageUrl.toLowerCase().endsWith('.svg') ? 
            imageUrl.replace('.svg', '.png') : '');
        } 
        // SVGパスがなければfileを使用
        else if (item.file) {
          if (item.file.toLowerCase().endsWith('.svg')) {
            // SVGファイルの場合
            imageUrl = item.file;
            fallbackUrl = item.pngFallback || item.file.replace('.svg', '.png');
          } else if (item.file.toLowerCase().endsWith('.png')) {
            // PNGファイルの場合
            imageUrl = item.file;
            // 対応するSVGファイルがあるか確認（命名規則に基づく）
            const svgVersion = item.file.replace('.png', '.svg');
            // SVGパスが明示的に設定されていれば使用、そうでなければPNG使用
            imageUrl = item.svgPath || item.file;
            fallbackUrl = item.file; // PNGはフォールバックにもなる
          } else {
            // その他の形式の場合
            imageUrl = item.file;
          }
        } else {
          imageUrl = '';
        }
        
        // パスが相対パスの場合、絶対パスに変換
        if (imageUrl && !imageUrl.startsWith('/') && !imageUrl.startsWith('http')) {
          imageUrl = '/' + imageUrl;
        }
        
        if (fallbackUrl && !fallbackUrl.startsWith('/') && !fallbackUrl.startsWith('http')) {
          fallbackUrl = '/' + fallbackUrl;
        }
        
        // 画像の種類を決定（SVGを優先）
        const imageType = imageUrl.toLowerCase().endsWith('.svg') ? 'svg-image' : 'image';
        
        // メタデータをJSON文字列に変換
        const metadataStr = item.metadata ? JSON.stringify(item.metadata) : undefined;
        
        // 処理されたスライドパス
        const processedSlides = (item.all_slides || []).map((slide: string) => {
          if (slide && !slide.startsWith('/') && !slide.startsWith('http')) {
            return '/' + slide;
          }
          return slide;
        });
        
        // 検索結果のフォーマット
        return {
          id: item.id,
          title: item.title,
          type: imageType,
          url: imageUrl,                   // SVGを優先
          pngFallbackUrl: fallbackUrl,     // フォールバックとしてPNGを使用
          content: '', // テキスト表示を無効化
          relevance: (1 - (result.score || 0)) * 100, // スコアをパーセンテージの関連度に変換
          metadata_json: metadataStr, // JSONとして処理できるようにメタデータを文字列化
          all_slides: processedSlides.length > 0 ? processedSlides : undefined,
          details: '' // テキスト表示を無効化
        };
      });
      
      // キャッシュに保存
      lastSearchResults = formattedResults;
      
      // 結果が見つかったので、点滅防止のために検索フラグをリセット
      if (autoStopAfterResults && formattedResults.length > 0) {
        console.log(`検索停止: ${formattedResults.length}件の結果を表示します`);
        // 検索完了後に表示される前に検索を停止（finally区間で実行）
        // isSearching = false; // ここではなくfinally内で行う
      }
      
      return formattedResults;
    } finally {
      // 検索完了フラグを設定
      isSearching = false;
    }
  } catch (error) {
    console.error('画像検索エラー:', error);
    isSearching = false; // エラー時にもフラグをリセット
    return lastSearchResults; // エラー時には前回の結果を返す
  }
};