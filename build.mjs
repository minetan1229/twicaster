import { build, context } from 'esbuild';
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

const isWatch = process.argv.includes('--watch');
const outDir = resolve('dist');
const srcDir = resolve('src');

async function copyAssets() {
  console.log('copyAssets started');
  if (!existsSync(outDir)) {
    console.log('Creating outDir:', outDir);
    mkdirSync(outDir, { recursive: true });
  }
  // Copy manifest.json
  console.log('Copying manifest.json');
  copyFileSync(resolve('manifest.json'), join(outDir, 'manifest.json'));
  console.log('Copied manifest.json');
  
  // Copy popup.html
  console.log('Copying popup.html');
  copyFileSync(join(srcDir, 'popup', 'popup.html'), join(outDir, 'popup.html'));
  console.log('Copied popup.html');
  
  // Copy offscreen.html
  console.log('Copying offscreen.html');
  copyFileSync(join(srcDir, 'offscreen', 'offscreen.html'), join(outDir, 'offscreen.html'));
  console.log('Copied offscreen.html');
  
  // Copy popup.css
  console.log('Copying popup.css');
  copyFileSync(join(srcDir, 'popup', 'popup.css'), join(outDir, 'popup.css'));
  console.log('Copied popup.css');
  
  // Copy FFmpeg core files (needed for @ffmpeg/core)
  console.log('Checking FFmpeg core');
  const ffmpegCoreDir = resolve('node_modules/@ffmpeg/core/dist/esm');
  console.log('FFmpeg core dir:', ffmpegCoreDir, existsSync(ffmpegCoreDir));
  if (existsSync(ffmpegCoreDir)) {
    const ffmpegOutDir = join(outDir, 'ffmpeg-core');
    if (!existsSync(ffmpegOutDir)) {
      mkdirSync(ffmpegOutDir, { recursive: true });
    }
    for (const file of readdirSync(ffmpegCoreDir)) {
      const srcPath = join(ffmpegCoreDir, file);
      const destPath = join(ffmpegOutDir, file);
      if (statSync(srcPath).isFile()) {
        copyFileSync(srcPath, destPath);
      }
    }
  }
  console.log('copyAssets complete');
}

const entryPoints = {
  background: join(srcDir, 'background', 'background.ts'),
  offscreen: join(srcDir, 'offscreen', 'offscreen.ts'),
  popup: join(srcDir, 'popup', 'popup.ts'),
  content: join(srcDir, 'content', 'content.ts'),
};

const buildOptions = {
  entryPoints,
  bundle: true,
  outdir: outDir,
  format: 'esm',
  target: 'chrome110',
  platform: 'browser',
  sourcemap: true,
  splitting: false,
  treeShaking: true,
  external: ['chrome'],
  define: {
    'process.env.NODE_ENV': '"production"',
  },
};

async function main() {
  console.log('Starting build...');
  await copyAssets();
  console.log('Assets copied');
  
  if (isWatch) {
    const ctx = await context(buildOptions);
    await ctx.watch();
    console.log('Watching for changes...');
    
    ctx.on('rebuild', async (result) => {
      if (result.errors.length > 0) {
        console.error('Build failed:', result.errors);
      } else {
        await copyAssets();
        console.log('Rebuild complete');
      }
    });
  } else {
    await build(buildOptions);
    console.log('esbuild complete');
    console.log('Build complete');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});