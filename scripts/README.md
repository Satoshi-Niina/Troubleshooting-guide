# 画像処理スクリプトのドキュメント

## 概要

このディレクトリには、保守用車システムの画像処理に関連する各種スクリプトが含まれています。これらのスクリプトは、PowerPointファイルからの画像抽出、SVGからPNGへの変換、画像検索データの最適化などの機能を提供します。

## 主要なスクリプト

### 1. 強化版PPTX抽出スクリプト (`enhance-pptx-extraction.js`)

PPTXファイルからの画像抽出処理を改善し、特にグループ化された要素の処理と検索メタデータの強化を行います。

**主な機能:**
- グループ化された要素を1つの統合画像として抽出
- 意味のある単位での画像保存
- 検索用メタデータの強化（キーワード生成）
- PNG形式に統一した画像保存

**使用方法:**
```bash
node scripts/enhance-pptx-extraction.js path/to/your/presentation.pptx
```

### 2. SVG→PNG変換スクリプト (`convert-svg-to-png.js`)

SVGファイルをPNG形式に変換します。アプリケーション全体のSVG参照をPNGに統一するために使用します。

**使用方法:**
```bash
node scripts/convert-svg-to-png.js
```

### 3. 欠損画像作成スクリプト (`create-missing-images.js`)

検索データに参照されているが実際には存在しない画像ファイルのプレースホルダーを作成します。

**使用方法:**
```bash
node scripts/create-missing-images.js
```

### 4. 画像検索データ更新スクリプト (`update-image-search-data.js`)

SVG参照をPNG参照に変更するなど、検索データの更新を行います。

**使用方法:**
```bash
node scripts/update-image-search-data.js
```

## 推奨されるワークフロー

1. PowerPointファイルが追加されたら、強化版PPTXスクリプトで処理
   ```bash
   node scripts/enhance-pptx-extraction.js path/to/new/presentation.pptx
   ```

2. 既存のSVGファイルをPNGに変換
   ```bash
   node scripts/convert-svg-to-png.js
   ```

3. 画像検索データを更新
   ```bash
   node scripts/update-image-search-data.js
   ```

4. 欠損画像がある場合はプレースホルダーを作成
   ```bash
   node scripts/create-missing-images.js
   ```

## 画像フォーマットのガイドライン

- **推奨形式**: PNG（透明度が必要な場合）またはJPG（高圧縮が必要な場合）
- **画像サイズ**: 標準的な解像度（例：1024x768px）を維持
- **ファイル名**: 特殊文字や日本語を使用しない（URLエンコーディング問題を避ける）
- **メタデータ**: 可能な限り詳細な説明と豊富なキーワードを含める

## 画像構成のベストプラクティス

1. **意味のある単位で画像を統合する**
   - 機能的に関連する複数の小さな画像要素は1つの図として統合
   - グループ化された複合図表は意味のあるユニットとして扱う

2. **メタデータと説明の最適化**
   - 各画像には具体的な説明テキストを付与
   - 検索キーワードに部品名や現象名などの専門用語を含める

3. **推奨するスライド構成**
   - 1枚の意味のある画像 + 簡潔な見出し + 詳細な説明テキスト
   - 画像は自己完結的で理解しやすいものにする
