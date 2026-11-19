import { FFmpeg } from '@ffmpeg/ffmpeg';
import { MessageType, DownloadProgress, CapturedStream, HLSVariant } from '../shared/types';
import { parseMasterPlaylist, selectHighestQuality, parseMediaPlaylist, selectSegmentsInRange } from '../shared/hls';
import { buildRequestHeaders } from '../shared/headers';

let ffmpeg: FFmpeg | null = null;
let ffmpegLoaded = false;

function logDebug(level: 'info' | 'warn' | 'error', message: string, details?: unknown): void {
  console[level](`[Offscreen] ${message}`, details !== undefined ? details : '');
  chrome.runtime.sendMessage({
    type: MessageType.DEBUG_LOG,
    payload: {
      timestamp: Date.now(),
      source: 'offscreen',
      level,
      message,
      details: details instanceof Error ? details.message : details,
    },
  }).catch(() => {});
}

// Notify background that offscreen document is ready to receive messages
chrome.runtime.sendMessage({ type: MessageType.OFFSCREEN_READY }).catch(() => {});
logDebug('info', 'オフスクリーンドキュメント初期化中');

const activeDownloads = new Map<string, AbortController>();

const MAX_PARALLEL_DOWNLOADS = 3;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 1000;

async function initFFmpeg(): Promise<void> {
  if (ffmpegLoaded && ffmpeg) return;
  
  logDebug('info', 'FFmpeg.wasm の初期化開始');
  reportProgress({
    stage: 'fetching',
    progress: 2,
    message: 'FFmpegエンジンを初期化中...',
  });

  try {
    ffmpeg = new FFmpeg();
    
    ffmpeg.on('log', ({ message }: { message: string }) => {
      logDebug('info', `FFmpeg Core: ${message}`);
    });

    ffmpeg.on('progress', (progress: { progress: number }) => {
      const p = Math.max(0, Math.min(100, Math.round(progress.progress * 100)));
      reportProgress({
        stage: 'processing',
        progress: p,
        message: `FFmpeg処理中: ${p}%`,
      });
    });
    
    await ffmpeg.load({
      coreURL: chrome.runtime.getURL('ffmpeg-core/ffmpeg-core.js'),
      wasmURL: chrome.runtime.getURL('ffmpeg-core/ffmpeg-core.wasm'),
    });
    ffmpegLoaded = true;
    logDebug('info', 'FFmpeg.wasm のロード完了');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logDebug('error', 'FFmpeg初期化に失敗しました', msg);
    throw new Error(`FFmpeg初期化エラー: ${msg}`, { cause: error });
  }
}

function reportProgress(progress: DownloadProgress): void {
  logDebug('info', `Progress [${progress.stage}]: ${progress.progress}% - ${progress.message}`);
  chrome.runtime.sendMessage({ type: MessageType.DOWNLOAD_PROGRESS, payload: progress }).catch(() => {});
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  headers: Record<string, string>,
  signal: AbortSignal,
  retries = MAX_RETRIES
): Promise<Response> {
  const requestHeaders = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    requestHeaders.set(key, value);
  }

  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: requestHeaders,
        credentials: 'include',
        signal,
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (signal.aborted || error instanceof DOMException && error.name === 'AbortError') {
        throw lastError;
      }
      
      if (attempt < retries) {
        const delay = RETRY_BASE_DELAY * Math.pow(2, attempt);
        reportProgress({
          stage: 'downloading',
          progress: 0,
          message: `リトライ ${attempt + 1}/${retries} (${delay}ms後): ${lastError.message}`,
        });
        await sleep(delay);
      }
    }
  }
  
  throw lastError!;
}

async function downloadPlaylist(url: string, headers: Record<string, string>, signal: AbortSignal): Promise<string> {
  const response = await fetchWithRetry(url, headers, signal);
  return response.text();
}

async function downloadSegment(url: string, headers: Record<string, string>, signal: AbortSignal): Promise<Uint8Array> {
  const response = await fetchWithRetry(url, headers, signal);
  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

async function downloadSegmentsParallel(
  segments: Array<{ uri: string; index: number }>,
  headers: Record<string, string>,
  signal: AbortSignal,
  onProgress: (completed: number, total: number, speed?: number, eta?: number) => void
): Promise<Uint8Array[]> {
  const results: (Uint8Array | Error)[] = new Array(segments.length);
  let completed = 0;
  const startTime = Date.now();
  let totalBytes = 0;
  
  const queue = [...segments];
  
  async function worker() {
    while (queue.length > 0 && !signal.aborted) {
      const item = queue.shift()!;
      
      try {
        const data = await downloadSegment(item.uri, headers, signal);
        results[item.index] = data;
        totalBytes += data.length;
      } catch (error) {
        results[item.index] = error instanceof Error ? error : new Error(String(error));
      }
      
      completed++;
      const elapsed = (Date.now() - startTime) / 1000;
      const speed = elapsed > 0 ? totalBytes / elapsed : 0;
      const remaining = segments.length - completed;
      const avgSegmentSize = completed > 0 ? totalBytes / completed : 0;
      const eta = speed > 0 && avgSegmentSize > 0 ? (remaining * avgSegmentSize) / speed : 0;
      
      onProgress(completed, segments.length, speed, eta);
    }
  }
  
  const workers = Array.from({ length: Math.min(MAX_PARALLEL_DOWNLOADS, segments.length) }, () => worker());
  await Promise.all(workers);
  
  if (signal.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  
  const errors = results.filter(r => r instanceof Error) as Error[];
  if (errors.length > 0) {
    throw new Error(`セグメントのダウンロードに失敗: ${errors.length}/${segments.length} - ${errors[0].message}`);
  }
  
  return results as Uint8Array[];
}

async function clipVideo(
  masterUrl: string,
  headers: Record<string, string>,
  startTime: number,
  endTime: number,
  outputFilename: string,
  signal?: AbortSignal,
  mediaUrl?: string,
  mediaVariants?: HLSVariant[]
): Promise<Blob> {
  await initFFmpeg();
  const ffmpegInstance = ffmpeg!;
  if (!ffmpegInstance) throw new Error('FFmpegが初期化されていません');
  
  const abortSignal = signal || new AbortSignal();
  
  reportProgress({ stage: 'fetching', progress: 5, message: 'プレイリストを取得中...' });
  
  let mediaPlaylistText: string;
  let mediaBaseUrl: string;
  
  if (mediaUrl) {
    mediaPlaylistText = await downloadPlaylist(mediaUrl, headers, abortSignal);
    mediaBaseUrl = mediaUrl.substring(0, mediaUrl.lastIndexOf('/') + 1);
  } else {
    reportProgress({ stage: 'fetching', progress: 5, message: 'マスタープレイリストを取得中...' });
    
    const masterPlaylistText = await downloadPlaylist(masterUrl, headers, abortSignal);
    const baseUrl = masterUrl.substring(0, masterUrl.lastIndexOf('/') + 1);
    const variants = mediaVariants || parseMasterPlaylist(masterPlaylistText, baseUrl);
    
    if (variants.length === 0) {
      throw new Error('マスタープレイリストにバリアントが見つかりません');
    }
    
    const selectedVariant = selectHighestQuality(variants);
    if (!selectedVariant) {
      throw new Error('画質バリアントの選択に失敗しました');
    }
    
    reportProgress({ stage: 'fetching', progress: 15, message: 'メディアプレイリストを取得中...' });
    
    mediaPlaylistText = await downloadPlaylist(selectedVariant.uri, headers, abortSignal);
    mediaBaseUrl = selectedVariant.uri.substring(0, selectedVariant.uri.lastIndexOf('/') + 1);
  }
  
  const mediaPlaylist = parseMediaPlaylist(mediaPlaylistText, mediaBaseUrl);
  
  const segmentsInRange = selectSegmentsInRange(mediaPlaylist, startTime, endTime);
  if (segmentsInRange.length === 0) {
    throw new Error('指定された時間範囲にセグメントが見つかりません');
  }
  
  reportProgress({ stage: 'downloading', progress: 20, message: `${segmentsInRange.length}個のセグメントをダウンロード中...` });
  
  const segmentFiles: string[] = [];
  const segmentsWithIndex = segmentsInRange.map((segment, index) => ({ uri: segment.uri, index }));
  
  const segmentDataArray = await downloadSegmentsParallel(
    segmentsWithIndex,
    headers,
    abortSignal,
    (completed, total, speed, eta) => {
      const progress = 20 + Math.round((completed / total) * 50);
      reportProgress({
        stage: 'downloading',
        progress,
        message: `ダウンロード済み: ${completed}/${total} セグメント`,
        speed,
        eta,
        segmentsDownloaded: completed,
        segmentsTotal: total,
      });
    }
  );

  if (abortSignal.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  for (let i = 0; i < segmentDataArray.length; i++) {
    if (abortSignal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    const segmentFilename = `segment_${i}.ts`;
    await ffmpegInstance.writeFile(segmentFilename, segmentDataArray[i]);
    segmentFiles.push(segmentFilename);
  }

  if (abortSignal.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  reportProgress({ stage: 'processing', progress: 75, message: 'セグメントを結合中...' });

  const concatList = segmentFiles.map(f => `file '${f}'`).join('\n');
  await ffmpegInstance.writeFile('concat.list', concatList);

  await ffmpegInstance.exec([
    '-y', '-f', 'concat', '-safe', '0', '-i', 'concat.list',
    '-c', 'copy', '-movflags', '+faststart', outputFilename
  ]);
  
  reportProgress({ stage: 'processing', progress: 95, message: 'ファイルを最終処理中...' });
  
  const outputData = await ffmpegInstance.readFile(outputFilename) as Uint8Array<ArrayBuffer>;
  const blob = new Blob([outputData], { type: 'video/mp4' });
  
  for (const file of segmentFiles) {
    void (await ffmpegInstance.deleteFile?.(file) || ffmpegInstance.writeFile(file, new Uint8Array(0)));
  }
  void (await ffmpegInstance.deleteFile?.('concat.list') || ffmpegInstance.writeFile('concat.list', new Uint8Array(0)));
  void (await ffmpegInstance.deleteFile?.(outputFilename) || ffmpegInstance.writeFile(outputFilename, new Uint8Array(0)));
  
  reportProgress({ stage: 'complete', progress: 100, message: 'ダウンロード完了！' });
  
  return blob;
}

const LIVE_POLL_INTERVAL = 15000;
const FLUSH_INTERVAL = 30000;

async function recordLiveStream(
  mediaUrl: string,
  headers: Record<string, string>,
  startTime: number,
  endTime: number,
  outputFilename: string,
  signal?: AbortSignal
): Promise<Blob> {
  await initFFmpeg();
  const ffmpegInstance = ffmpeg!;
  if (!ffmpegInstance) throw new Error('FFmpegが初期化されていません');
  
  const abortSignal = signal || new AbortSignal();
  const segmentFiles: string[] = [];
  let segmentIndex = 0;
  let lastMediaSequence = -1;
  let concatListContent = '';
  let lastFlushTime = Date.now();
  
  reportProgress({ stage: 'fetching', progress: 5, message: 'ライブ録画を開始中...' });
  
  const flushSegments = async (force = false) => {
    const now = Date.now();
    if (!force && now - lastFlushTime < FLUSH_INTERVAL && segmentFiles.length < 100) {
      return;
    }
    
    if (segmentFiles.length === 0) return;
    
    reportProgress({ stage: 'processing', progress: 70, message: `${segmentFiles.length}個のセグメントをフラッシュ中...` });
    
    concatListContent = segmentFiles.map(f => `file '${f}'`).join('\n');
    await ffmpegInstance.writeFile('concat.list', concatListContent);
    
    const tempOutput = `temp_${Date.now()}.mp4`;
    await ffmpegInstance.exec([
      '-y', '-f', 'concat', '-safe', '0', '-i', 'concat.list',
      '-c', 'copy', '-movflags', '+faststart', tempOutput
    ]);
    
    for (const file of segmentFiles) {
      void (await ffmpegInstance.deleteFile?.(file) || ffmpegInstance.writeFile(file, new Uint8Array(0)));
    }
    segmentFiles.length = 0;
    
    void (await ffmpegInstance.deleteFile?.('concat.list') || ffmpegInstance.writeFile('concat.list', new Uint8Array(0)));
    
    segmentFiles.push(tempOutput);
    lastFlushTime = now;
  };
  
  const pollAndDownload = async () => {
    while (!abortSignal.aborted) {
      try {
        reportProgress({ stage: 'fetching', progress: 10, message: 'ライブプレイリストを取得中...' });
        
        const mediaPlaylistText = await downloadPlaylist(mediaUrl, headers, abortSignal);
        const mediaBaseUrl = mediaUrl.substring(0, mediaUrl.lastIndexOf('/') + 1);
        const mediaPlaylist = parseMediaPlaylist(mediaPlaylistText, mediaBaseUrl);
        
        if (lastMediaSequence === -1) {
          lastMediaSequence = mediaPlaylist.mediaSequence;
        }
        
        const startIndex = lastMediaSequence - mediaPlaylist.mediaSequence + 1;
        const newSegments = mediaPlaylist.segments.slice(Math.max(0, startIndex));
        
        for (const segment of newSegments) {
          if (abortSignal.aborted) break;
          
          const segmentFilename = `segment_${segmentIndex}.ts`;
          
          reportProgress({ 
            stage: 'downloading', 
            progress: 20 + Math.min(50, segmentIndex * 2), 
            message: `セグメント ${segmentIndex + 1} を録画中...` 
          });
          
          const segmentData = await downloadSegment(segment.uri, headers, abortSignal);
          await ffmpegInstance.writeFile(segmentFilename, segmentData);
          segmentFiles.push(segmentFilename);
          segmentIndex++;
        }
        
        lastMediaSequence = mediaPlaylist.mediaSequence + mediaPlaylist.segments.length - 1;
        
        await flushSegments();
        
        if (abortSignal.aborted) break;
        
        await new Promise(resolve => setTimeout(resolve, LIVE_POLL_INTERVAL));
      } catch (error) {
        if (abortSignal.aborted) break;
        reportProgress({ 
          stage: 'error', 
          progress: 0, 
          message: `ポーリングエラー: ${error instanceof Error ? error.message : '不明なエラー'}`,
          error: error instanceof Error ? error.message : '不明なエラー'
        });
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    await flushSegments(true);
    
    if (segmentFiles.length === 0) {
      throw new Error('録画されたセグメントがありません');
    }
    
    reportProgress({ stage: 'processing', progress: 90, message: '録画を最終処理中...' });
    
    concatListContent = segmentFiles.map(f => `file '${f}'`).join('\n');
    await ffmpegInstance.writeFile('concat.list', concatListContent);
    
    await ffmpegInstance.exec([
      '-y', '-f', 'concat', '-safe', '0', '-i', 'concat.list',
      '-c', 'copy', '-movflags', '+faststart', outputFilename
    ]);
    
    for (const file of segmentFiles) {
      void (await ffmpegInstance.deleteFile?.(file) || ffmpegInstance.writeFile(file, new Uint8Array(0)));
    }
    void (await ffmpegInstance.deleteFile?.('concat.list') || ffmpegInstance.writeFile('concat.list', new Uint8Array(0)));
    for (const file of segmentFiles) {
      if (file.startsWith('temp_')) {
        void (await ffmpegInstance.deleteFile?.(file) || ffmpegInstance.writeFile(file, new Uint8Array(0)));
      }
    }
    
    reportProgress({ stage: 'processing', progress: 95, message: 'ファイルを最終処理中...' });
    
    const outputData = await ffmpegInstance.readFile(outputFilename) as Uint8Array<ArrayBuffer>;
    const blob = new Blob([outputData], { type: 'video/mp4' });
    
    void (await ffmpegInstance.deleteFile?.(outputFilename) || ffmpegInstance.writeFile(outputFilename, new Uint8Array(0)));
    
    reportProgress({ stage: 'complete', progress: 100, message: 'ライブ録画完了！' });
    
    return blob;
  };
  
  return pollAndDownload();
}

chrome.runtime.onMessage.addListener(async (message: { type: string; payload?: unknown }) => {
  if (message.type === MessageType.DOWNLOAD_STREAM) {
    const payload = message.payload as {
      streamId: string;
      masterUrl: string;
      headers: Record<string, string>;
      startTime: number;
      endTime: number;
      quality: string;
      outputFilename: string;
      isLive?: boolean;
      variants?: HLSVariant[];
      historyId?: string;
    };
    
    const controller = new AbortController();
    activeDownloads.set(payload.streamId, controller);
    
    try {
      const requestHeaders = buildRequestHeaders(
        { masterUrl: payload.masterUrl, headers: payload.headers } as CapturedStream,
        payload.masterUrl
      );
      
      let blob: Blob;
      
      if (payload.isLive) {
        blob = await recordLiveStream(
          payload.masterUrl,
          requestHeaders,
          payload.startTime,
          payload.endTime,
          payload.outputFilename,
          controller.signal
        );
      } else {
        blob = await clipVideo(
          payload.masterUrl,
          requestHeaders,
          payload.startTime,
          payload.endTime,
          payload.outputFilename,
          controller.signal,
          undefined,
          payload.variants
        );
      }
      
      const url = URL.createObjectURL(blob);
      logDebug('info', `Blob 生成完了: ${blob.size} bytes, ダウンロードダイアログ呼び出し中...`);

      // Wait for download to initiate or complete
      const downloadId = await new Promise<number>((resolve, reject) => {
        chrome.downloads.download({
          url,
          filename: payload.outputFilename,
          saveAs: true,
        }, (dId) => {
          if (chrome.runtime.lastError) {
            reject(new Error(`chrome.downloads: ${chrome.runtime.lastError.message}`));
          } else if (dId === undefined) {
            reject(new Error('ダウンロードIDの取得に失敗しました'));
          } else {
            resolve(dId);
          }
        });
      });

      logDebug('info', `ダウンロード開始 (ID: ${downloadId})`);

      // Wait for download to finish by listening to onChanged
      await new Promise<void>((resolve, reject) => {
        const listener = (delta: chrome.downloads.DownloadDelta) => {
          if (delta.id === downloadId) {
            if (delta.state && delta.state.current === 'complete') {
              chrome.downloads.onChanged.removeListener(listener);
              URL.revokeObjectURL(url);
              resolve();
            } else if (delta.state && delta.state.current === 'interrupted') {
              chrome.downloads.onChanged.removeListener(listener);
              URL.revokeObjectURL(url);
              reject(new Error(`ダウンロード中断: ${delta.error?.current || '不明なエラー'}`));
            }
          }
        };
        chrome.downloads.onChanged.addListener(listener);
      });

      logDebug('info', 'ダウンロード正常完了');
      chrome.runtime.sendMessage({
        type: MessageType.DOWNLOAD_COMPLETE,
        payload: { streamId: payload.streamId, historyId: payload.historyId, fileSize: blob.size }
      }).catch(() => {});
    } catch (error) {
      const isAborted = (error instanceof DOMException && error.name === 'AbortError') ||
        (error instanceof Error && error.message.toLowerCase().includes('aborted'));
      const errorMessage = isAborted ? 'ダウンロードは停止されました' : (error instanceof Error ? error.message : '不明なエラー');
      logDebug(isAborted ? 'info' : 'error', `ダウンロード処理結果: ${errorMessage}`, error);
      reportProgress({ stage: 'error', progress: 0, message: errorMessage, error: errorMessage });
      chrome.runtime.sendMessage({
        type: MessageType.DOWNLOAD_ERROR,
        payload: { streamId: payload.streamId, historyId: payload.historyId, error: errorMessage }
      }).catch(() => {});
    } finally {
      activeDownloads.delete(payload.streamId);
    }
  }

  if (message.type === MessageType.STOP_DOWNLOAD) {
    const { streamId } = message.payload as { streamId: string };
    const controller = activeDownloads.get(streamId);
    if (controller) {
      controller.abort();
      activeDownloads.delete(streamId);
      logDebug('info', `ダウンロード停止: streamId=${streamId}`);
    }
  }

  if (message.type === MessageType.CHECK_OFFSCREEN) {
    logDebug('info', 'CHECK_OFFSCREEN 受信、OFFSCREEN_READY を応答');
    chrome.runtime.sendMessage({ type: MessageType.OFFSCREEN_READY }).catch(() => {});
  }
});

logDebug('info', 'オフスクリーンドキュメントの初期化完了');