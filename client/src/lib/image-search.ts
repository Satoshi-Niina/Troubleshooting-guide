import Fuse from 'fuse.js';
import { apiRequest } from './queryClient';

// 画像検索用の専用インターフェース定義
interface ImageSearchItem {
  id: string | number;
  file: string;  // PNG形式のパス（SVGは使用しない）
  title: string;
  category: string;
  keywords: string[];
  description: string;
  metadata?: any;
  all_slides?: string[];
  details?: string;
  searchText?: string;   // 検索用の追加テキストフィールド
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
      
      // メタデータの検証とデータ品質チェック用カウンター
      let validSlideCount = 0;
      let invalidPathCount = 0;
      let missingTitleCount = 0;
      
      // スライドからImageSearchItem形式に変換（PNGファイルを優先）
      const slidesData = metadata.slides.map((slide: any) => {
        // 検証: スライド番号が存在するか確認
        if (!slide['スライド番号'] && slide['スライド番号'] !== 0) {
          console.warn(`スライド番号が欠落しているスライドがあります`);
          // 欠落している場合は代替IDを生成
          slide['スライド番号'] = `unknown_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        }
        
        // 画像パスを取得し、検証
        let imagePath = "";
        if (slide['画像テキスト'] && Array.isArray(slide['画像テキスト']) && slide['画像テキスト'].length > 0) {
          const imageText = slide['画像テキスト'][0];
          if (imageText && typeof imageText === 'object' && '画像パス' in imageText) {
            imagePath = imageText['画像パス'] || "";
          }
        }
        
        // 画像パスがない場合はログ
        if (!imagePath) {
          invalidPathCount++;
          console.warn(`スライド ${slide['スライド番号']} に有効な画像パスがありません`);
        }
        
        // 画像パスの参照を knowledge-base/images に統一
        if (imagePath) {
          // ファイル名だけを抽出
          const fileName = imagePath.split('/').pop();
          if (fileName) {
            // 知識ベースの画像ディレクトリに統一
            imagePath = `/knowledge-base/images/${fileName}`;
          }
        }
        
        // 画像を常にPNG形式に変換する
        if (imagePath && !imagePath.toLowerCase().endsWith('.png')) {
          // PNGパスに変換
          const basePath = imagePath.substring(0, imagePath.lastIndexOf('.') !== -1 ? 
                                              imagePath.lastIndexOf('.') : imagePath.length);
          imagePath = `${basePath}.png`;
        }
        
        // タイトルの検証
        const slideTitle = slide['タイトル'] || `スライド ${slide['スライド番号']}`;
        if (!slide['タイトル']) {
          missingTitleCount++;
        }
        
        // キーワードを生成（本文とタイトルから）- 検証付き
        const keywords = [];
        
        // タイトルをキーワードに追加
        if (slideTitle && typeof slideTitle === 'string' && slideTitle.trim() !== '') {
          keywords.push(slideTitle.trim());
        }
        
        // 本文をキーワードに追加
        if (slide['本文'] && Array.isArray(slide['本文'])) {
          slide['本文'].forEach((text: any) => {
            if (text && typeof text === 'string' && text.trim() !== '') {
              keywords.push(text.trim());
            }
          });
        }
        
        // 検索を容易にするための追加の検索テキストフィールド
        const searchTextParts = [
          slideTitle,
          ...(slide['本文'] || []),
          "保守用車マニュアル" // カテゴリも検索できるように
        ].filter(Boolean);
        
        validSlideCount++;
        
        return {
          id: `slide_${slide['スライド番号']}`,
          file: imagePath,
          title: slideTitle,
          category: "保守用車マニュアル",
          keywords: keywords,
          description: "", // テキスト表示を削除
          details: "", // テキスト表示を削除
          searchText: searchTextParts.join(' ') // 検索用の追加フィールド
        };
      });
      
      // 品質チェック結果をログ
      console.log(`スライド処理結果: 有効=${validSlideCount}, 無効なパス=${invalidPathCount}, タイトル欠落=${missingTitleCount}`);
      
      // 有効な画像パスを持つスライドのみを追加し、データの整合性を確保
      slidesData
        .filter((item: any) => {
          const hasValidPath = item.file && typeof item.file === 'string' && item.file.length > 0;
          const hasValidTitle = item.title && typeof item.title === 'string';
          const hasValidKeywords = Array.isArray(item.keywords) && item.keywords.length > 0;
          
          return hasValidPath && hasValidTitle && hasValidKeywords;
        })
        .forEach((item: any) => imageSearchData.push(item));
      
      // 埋め込み画像もデータに追加 (PNGを優先) - 強化版
      if (metadata.embeddedImages && Array.isArray(metadata.embeddedImages)) {
        console.log(`${metadata.embeddedImages.length}件の埋め込み画像を処理します`);
        
        // 画像処理の統計を追跡
        let validImageCount = 0;
        let invalidPathCount = 0;
        
        // 埋め込み画像の検証とマッピング
        const embeddedImages = metadata.embeddedImages
          // 有効な抽出パスを持つ画像のみフィルタリング
          .filter((img: any) => {
            const isValid = img && typeof img === 'object' && 
                           '抽出パス' in img && 
                           img['抽出パス'] && 
                           typeof img['抽出パス'] === 'string';
            
            if (!isValid) {
              invalidPathCount++;
            }
            
            return isValid;
          })
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
            
            // すべての画像形式をPNGに統一
            if (!imagePath.toLowerCase().endsWith('.png')) {
              const basePath = imagePath.substring(0, 
                imagePath.lastIndexOf('.') !== -1 ? 
                imagePath.lastIndexOf('.') : imagePath.length);
              const pngPath = `${basePath}.png`;
              imagePath = pngPath;
            }
            
            // メタデータから追加情報を抽出（あれば）
            let title = `部品画像 ${index+1}`;
            let category = "部品写真";
            let additionalKeywords: string[] = [];
            
            // 元のファイル名から情報を抽出
            if (img['元のファイル名'] && typeof img['元のファイル名'] === 'string') {
              const originalName = img['元のファイル名'];
              
              // ファイル名からより具体的なタイトルを生成
              if (originalName.includes('エンジン') || originalName.includes('engine')) {
                title = `エンジン部品 ${index+1}`;
                category = "エンジン部品";
                additionalKeywords.push("エンジン", "動力系", "駆動部");
              } else if (originalName.includes('冷却') || originalName.includes('ラジエーター')) {
                title = `冷却系統 ${index+1}`;
                category = "冷却系統";
                additionalKeywords.push("冷却", "ラジエーター", "水冷");
              } else if (originalName.includes('ブレーキ') || originalName.includes('brake')) {
                title = `ブレーキ部品 ${index+1}`;
                category = "ブレーキ系統";
                additionalKeywords.push("ブレーキ", "制動装置");
              } else if (originalName.includes('ホイール') || originalName.includes('wheel')) {
                title = `車輪部品 ${index+1}`;
                category = "足回り";
                additionalKeywords.push("ホイール", "車輪", "タイヤ");
              }
            }
            
            // 基本キーワードと追加キーワードを結合
            const keywords = ["保守用車", "部品", "写真", ...additionalKeywords];
            
            // 検索用の統合テキスト
            const searchText = [title, category, ...keywords].join(' ');
            
            validImageCount++;
            
            return {
              id: `img_${index+1}`,
              file: imagePath,
              title: title,
              category: category,
              keywords: keywords,
              description: "", // テキスト表示を削除
              details: "", // テキスト表示を削除
              searchText: searchText // 検索用の統合テキスト
            };
          });
        
        console.log(`埋め込み画像処理結果: 有効=${validImageCount}, 無効パス=${invalidPathCount}`);
          
        // 有効な画像のみを追加（PNG形式に統一）
        embeddedImages
          .filter((item: any) => {
            // 有効なパスであることを確認
            const hasValidPath = item.file && 
                                typeof item.file === 'string' && 
                                item.file.length > 0 &&
                                item.file.toLowerCase().endsWith('.png');
            
            // 有効なタイトルがあることを確認
            const hasValidTitle = item.title && typeof item.title === 'string';
            
            // 有効なキーワードがあることを確認
            const hasValidKeywords = Array.isArray(item.keywords) && item.keywords.length > 0;
            
            return hasValidPath && hasValidTitle && hasValidKeywords;
          })
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
          // knowledge-base/dataディレクトリから読み込む（一元化）
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
          console.error(`画像検索データ読み込みに失敗しました:`, error);
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
    
    // サンプルデータは使用せず、空の配列を返す（ユーザー要求により）
    console.log("サンプル画像データを表示しないように設定しました");
    imageSearchData = [];
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
    { name: 'title', weight: 0.5 },
    { name: 'category', weight: 0.3 },
    { name: 'description', weight: 0.4 },
    { name: 'keywords', weight: 1.0 }, // キーワードの重みをさらに強化
    { name: 'metadata.documentId', weight: 0.8 }, // ドキュメントIDによる検索を強化
    { name: 'details', weight: 0.6 },
    { name: 'searchText', weight: 1.0 }, // 検索用テキストフィールドを最高の重みで追加
  ],
  threshold: 0.4, // 閾値を高めに設定して、より幅広い一致を許容
  ignoreLocation: true, // 単語の位置を無視して検索
  useExtendedSearch: true, // 拡張検索モード
  minMatchCharLength: 1, // 部分一致の条件を緩和 (1文字一致から検索対象に)
  distance: 1000, // 単語間の距離制限をさらに緩める
  findAllMatches: true, // すべての一致を見つける
  isCaseSensitive: false, // 大文字小文字を区別しない
  shouldSort: true, // 結果をスコア順にソート
  tokenize: true, // 検索文字列をトークン化して部分一致を強化
  matchAllTokens: false, // すべてのトークンが一致する必要はない
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
      
      // キーワードを分割して検索（改善版：より厳密なフィルタリング）
      // 最小キーワード長を設定（日本語の場合は1文字でも意味を持つので1を許容）
      const MIN_KEYWORD_LENGTH = 1;
      // 無意味な単語や助詞のブラックリスト（検索対象から除外）
      const KEYWORD_BLACKLIST = [
        'の', 'に', 'は', 'を', 'が', 'と', 'も', 'や', 'な', 'で', 'へ',
        'から', 'まで', 'より', 'だけ', 'など', 'について'
      ];
      
      // キーワード分割と前処理
      const rawKeywords = text.split(/\s+/);
      const keywords = rawKeywords
        .filter(k => 
          // 空でなく、最小長さを超えていること
          k.length >= MIN_KEYWORD_LENGTH &&
          // ブラックリストに含まれていないこと
          !KEYWORD_BLACKLIST.includes(k)
        )
        // 重複を除去
        .filter((v, i, a) => a.indexOf(v) === i);
      
      // 有効なキーワードがなければ、元のテキスト全体で検索
      if (keywords.length === 0 && text.trim().length > 0) {
        console.log('有効なキーワードが抽出できなかったため、全体のテキストで検索します');
        keywords.push(text.trim());
      }
      
      console.log(`前処理後のキーワード: ${keywords.join(', ')} (${keywords.length}件)`);
      let searchResults: any[] = [];
      
      if (keywords.length > 1) {
        console.log(`複数キーワード検索: ${keywords.join(', ')}`);
        // 複数のキーワードがある場合、各キーワードで検索
        for (const keyword of keywords) {
          if (keyword.length >= MIN_KEYWORD_LENGTH) {
            const results = fuse.search(keyword);
            searchResults.push(...results);
          }
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
      } else if (keywords.length === 1) {
        console.log(`単一キーワード検索: ${keywords[0]}`);
        searchResults = fuse.search(keywords[0]);
      } else {
        console.log(`検索キーワードが抽出できなかったため検索をスキップします`);
        searchResults = [];
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
        let relatedKeywords: string[] = [];
        
        if (text.includes('エンジン') || text.includes('モーター') || text.includes('駆動')) {
          targetCategory = 'エンジン';
          relatedKeywords = ["エンジン", "モーター", "動力系", "駆動部"];
        } else if (text.includes('冷却') || text.includes('水') || text.includes('温度')) {
          targetCategory = '冷却系統';
          relatedKeywords = ["冷却", "ラジエーター", "水漏れ", "オーバーヒート"];
        } else if (text.includes('フレーム') || text.includes('車体') || text.includes('シャーシ')) {
          targetCategory = '車体';
          relatedKeywords = ["フレーム", "シャーシ", "車体", "構造"];
        } else if (text.includes('運転') || text.includes('キャビン') || text.includes('操作')) {
          targetCategory = '運転室';
          relatedKeywords = ["キャビン", "運転室", "操作パネル", "計器盤"];
        } else if (text.includes('ブレーキ') || text.includes('制動') || text.includes('バネ')) {
          targetCategory = 'ブレーキ系統';
          relatedKeywords = ["ブレーキ", "制動装置", "バネ", "駐車ブレーキ", "エアータンク"];
        }
        
        // カテゴリに基づいて画像を検索
        if ((targetCategory || relatedKeywords.length > 0) && imageSearchData.length > 0) {
          // まずはカテゴリに基づくフィルタリング
          let categoryResults: ImageSearchItem[] = [];
          
          if (targetCategory) {
            categoryResults = imageSearchData.filter(item => 
              item.category === targetCategory || 
              (item.keywords && item.keywords.some(k => k.includes(targetCategory)))
            );
          }
          
          // カテゴリベースで見つからない場合は、関連キーワードを使用
          if (categoryResults.length === 0 && relatedKeywords.length > 0) {
            categoryResults = imageSearchData.filter(item => 
              item.keywords && 
              item.keywords.some(k => 
                relatedKeywords.some(rk => k.includes(rk) || rk.includes(k))
              )
            );
          }
          
          // それでも見つからない場合は元のクエリで部分一致検索
          if (categoryResults.length === 0) {
            categoryResults = imageSearchData.filter(item => {
              // 検索テキストを項目のタイトル、カテゴリ、キーワード、説明に部分一致させる
              const searchLower = text.toLowerCase();
              return (
                (item.title && item.title.toLowerCase().includes(searchLower)) ||
                (item.category && item.category.toLowerCase().includes(searchLower)) ||
                (item.description && item.description.toLowerCase().includes(searchLower)) ||
                (item.searchText && item.searchText?.toLowerCase().includes(searchLower)) ||
                (item.keywords && item.keywords.some(k => 
                  k.toLowerCase().includes(searchLower) || searchLower.includes(k.toLowerCase())
                ))
              );
            });
          }
          
          if (categoryResults.length > 0) {
            if (targetCategory) {
              console.log(`カテゴリ「${targetCategory}」に基づいて ${categoryResults.length} 件の関連画像を見つけました`);
            } else {
              console.log(`関連キーワード [${relatedKeywords.join(', ')}] に基づいて ${categoryResults.length} 件の関連画像を見つけました`);
            }
            
            // 関連結果をFuse.js形式に変換
            searchResults = categoryResults.map(item => ({
              item,
              score: 0.5, // 中程度の関連度
              refIndex: 0
            }));
          } else {
            // 最後の手段として、ランダムな画像を表示
            if (imageSearchData.length > 0) {
              console.log('関連画像が見つからないため、利用可能な画像からランダムに5件表示します');
              const randomSample = [];
              const shuffled = [...imageSearchData].sort(() => 0.5 - Math.random());
              const sampleSize = Math.min(5, shuffled.length);
              
              for (let i = 0; i < sampleSize; i++) {
                randomSample.push(shuffled[i]);
              }
              
              searchResults = randomSample.map(item => ({
                item,
                score: 0.9, // 低い関連度
                refIndex: 0
              }));
            }
          }
        }
      }
      
      // 検索結果を必要な形式にマッピング
      const formattedResults = searchResults.map(result => {
        const item = result.item;
        
        // 画像URLとフォールバックを設定
        let imageUrl = '';
        let fallbackUrl = '';
        
        // PNG形式のみを使用するように修正
        if (item.file) {
          if (item.file.toLowerCase().endsWith('.png')) {
            // PNGファイルの場合
            imageUrl = item.file;
          } else {
            // その他の形式の場合、可能ならPNGに変換されたパスを使用
            const basePath = item.file.substring(0, item.file.lastIndexOf('.'));
            const pngPath = `${basePath}.png`;
            imageUrl = pngPath;
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
        
        // 画像の種類を決定（PNGのみになったので常にimage）
        const imageType = 'image';
        
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
          url: imageUrl,                   // PNG形式を使用
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