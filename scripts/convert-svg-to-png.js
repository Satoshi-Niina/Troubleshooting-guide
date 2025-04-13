const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function convertSvgToPng(svgPath, pngPath) {
  try {
    console.log(`Converting: ${svgPath} -> ${pngPath}`);
    
    // SVGファイルを読み込む
    const svgContent = fs.readFileSync(svgPath, 'utf8');
    
    // SVGバッファを生成
    const svgBuffer = Buffer.from(svgContent);
    
    // sharpを使ってSVGをPNGに変換
    await sharp(svgBuffer)
      .png()
      .toFile(pngPath);
    
    console.log(`Converted: ${path.basename(pngPath)}`);
    return true;
  } catch (error) {
    console.error(`Error converting ${svgPath} to PNG:`, error);
    return false;
  }
}

async function convertAllSvgInDirectory(directory) {
  try {
    // ディレクトリ内のすべてのファイルを取得
    const files = fs.readdirSync(directory);
    
    // SVGファイルをフィルタリング
    const svgFiles = files.filter(file => file.toLowerCase().endsWith('.svg'));
    
    console.log(`Found ${svgFiles.length} SVG files in ${directory}`);
    
    // すべてのSVGファイルに対して処理
    const results = await Promise.all(
      svgFiles.map(async (svgFile) => {
        const svgPath = path.join(directory, svgFile);
        const pngPath = path.join(directory, svgFile.replace(/\.svg$/i, '.png'));
        return await convertSvgToPng(svgPath, pngPath);
      })
    );
    
    // 成功した変換と失敗した変換の数をカウント
    const successCount = results.filter(result => result).length;
    const failureCount = results.filter(result => !result).length;
    
    console.log(`Conversion complete. Success: ${successCount}, Failed: ${failureCount}`);
  } catch (error) {
    console.error('Error processing directory:', error);
  }
}

// アップロードディレクトリパス
const uploadsImagesDir = path.join(__dirname, '..', 'uploads', 'images');
const publicUploadsImagesDir = path.join(__dirname, '..', 'public', 'uploads', 'images');

// 変換を実行
console.log('Starting SVG to PNG conversion...');
convertAllSvgInDirectory(uploadsImagesDir)
  .then(() => {
    console.log('Processing public directory...');
    return convertAllSvgInDirectory(publicUploadsImagesDir);
  })
  .then(() => {
    console.log('All conversions completed!');
  })
  .catch(error => {
    console.error('Conversion error:', error);
  });