import { FFmpeg } from '@ffmpeg/ffmpeg';
import { MessageType, DownloadProgress, CapturedStream } from '../shared/types';
import { parseMasterPlaylist, selectHighestQuality, parseMediaPlaylist, selectSegmentsInRange } from '../shared/hls';
import { buildRequestHeaders } from '../shared/headers';

let ffmpeg: FFmpeg | null = null;
let ffmpegLoaded = false;

chrome.runtime.sendMessage({ type: MessageType.OFFSCREEN_READY });

async function initFFmpeg(): Promise<void> {
  if (ffmpegLoaded && ffmpeg) return;
  
  ffmpeg = new FFmpeg();
  
  ffmpeg.on('progress', (progress: { progress: number }) => {
    reportProgress({
      stage: 'processing',
      progress: Math.round(progress.progress * 100),
      message: `FFmpeg processing: ${Math.round(progress.progress * 100)}%`,
    });
  });
  
  await ffmpeg.load({
    coreURL: 'ffmpeg-core/ffmpeg-core.js',
  });
  ffmpegLoaded = true;
}

function reportProgress(progress: DownloadProgress): void {
  chrome.runtime.sendMessage({ type: MessageType.DOWNLOAD_PROGRESS, payload: progress });
}

async function fetchWithHeaders(url: string, headers: Record<string, string>): Promise<Response> {
  const requestHeaders = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    requestHeaders.set(key, value);
  }
  
  return fetch(url, {
    method: 'GET',
    headers: requestHeaders,
    credentials: 'include',
  });
}

async function downloadPlaylist(url: string, headers: Record<string, string>): Promise<string> {
  const response = await fetchWithHeaders(url, headers);
  if (!response.ok) {
    throw new Error(`Failed to fetch playlist: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function downloadSegment(url: string, headers: Record<string, string>): Promise<Uint8Array> {
  const response = await fetchWithHeaders(url, headers);
  if (!response.ok) {
    throw new Error(`Failed to fetch segment: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

async function clipVideo(
  masterUrl: string,
  headers: Record<string, string>,
  startTime: number,
  endTime: number,
  outputFilename: string
): Promise<Blob> {
  await initFFmpeg();
  if (!ffmpeg) throw new Error('FFmpeg not initialized');
  
  reportProgress({ stage: 'fetching', progress: 10, message: 'Fetching master playlist...' });
  
  const masterPlaylistText = await downloadPlaylist(masterUrl, headers);
  const baseUrl = masterUrl.substring(0, masterUrl.lastIndexOf('/') + 1);
  const variants = parseMasterPlaylist(masterPlaylistText, baseUrl);
  
  if (variants.length === 0) {
    throw new Error('No variants found in master playlist');
  }
  
  const selectedVariant = selectHighestQuality(variants);
  if (!selectedVariant) {
    throw new Error('Failed to select quality variant');
  }
  
  reportProgress({ stage: 'fetching', progress: 30, message: 'Fetching media playlist...' });
  
  const mediaPlaylistText = await downloadPlaylist(selectedVariant.uri, headers);
  const mediaBaseUrl = selectedVariant.uri.substring(0, selectedVariant.uri.lastIndexOf('/') + 1);
  const mediaPlaylist = parseMediaPlaylist(mediaPlaylistText, mediaBaseUrl);
  
  const segmentsInRange = selectSegmentsInRange(mediaPlaylist, startTime, endTime);
  if (segmentsInRange.length === 0) {
    throw new Error('No segments found in specified time range');
  }
  
  reportProgress({ stage: 'downloading', progress: 40, message: `Downloading ${segmentsInRange.length} segments...` });
  
  const segmentFiles: string[] = [];
  
  for (let i = 0; i < segmentsInRange.length; i++) {
    const segment = segmentsInRange[i];
    const segmentFilename = `segment_${i}.ts`;
    
    const segmentData = await downloadSegment(segment.uri, headers);
    await ffmpeg.writeFile(segmentFilename, segmentData);
    segmentFiles.push(segmentFilename);
    
    const progress = 40 + Math.round((i / segmentsInRange.length) * 40);
    reportProgress({ stage: 'downloading', progress, message: `Downloaded ${i + 1}/${segmentsInRange.length} segments` });
  }
  
  reportProgress({ stage: 'processing', progress: 80, message: 'Concatenating segments...' });
  
  const concatList = segmentFiles.map(f => `file '${f}'`).join('\n');
  await ffmpeg.writeFile('concat.list', concatList);
  
  await ffmpeg.exec([
    '-y', '-f', 'concat', '-safe', '0', '-i', 'concat.list',
    '-c', 'copy', '-movflags', '+faststart', outputFilename
  ]);
  
  reportProgress({ stage: 'processing', progress: 95, message: 'Finalizing...' });
  
  const outputData = await ffmpeg.readFile(outputFilename) as Uint8Array<ArrayBuffer>;
  const blob = new Blob([outputData], { type: 'video/mp4' });
  
  for (const file of segmentFiles) {
    try { await ffmpeg.deleteFile?.(file); } catch {}
  }
  try { await ffmpeg.deleteFile?.('concat.list'); } catch {}
  try { await ffmpeg.deleteFile?.(outputFilename); } catch {}
  
  reportProgress({ stage: 'complete', progress: 100, message: 'Download complete!' });
  
  return blob;
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
    };
    
    try {
      const requestHeaders = buildRequestHeaders(
        { masterUrl: payload.masterUrl, headers: payload.headers } as CapturedStream,
        payload.masterUrl
      );
      
      const blob = await clipVideo(
        payload.masterUrl,
        requestHeaders,
        payload.startTime,
        payload.endTime,
        payload.outputFilename
      );
      
      const url = URL.createObjectURL(blob);
      await chrome.downloads.download({
        url,
        filename: payload.outputFilename,
        saveAs: true,
      });
      
      URL.revokeObjectURL(url);
      
      chrome.runtime.sendMessage({ type: MessageType.DOWNLOAD_COMPLETE, payload: { streamId: payload.streamId } });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      reportProgress({ stage: 'error', progress: 0, message: 'Download failed', error: errorMessage });
      chrome.runtime.sendMessage({ type: MessageType.DOWNLOAD_ERROR, payload: { error: errorMessage } });
    }
  }
});

console.log('Offscreen document loaded');