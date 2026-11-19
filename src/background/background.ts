import { CapturedStream, Message, MessageType, CurrentTimeInfo, LiveStreamInfo, HLSVariant, DownloadHistoryItem } from '../shared/types';
import { buildRequestHeaders } from '../shared/headers';
import { parseMasterPlaylist, parseMediaPlaylist, extractLiveInfo, selectHighestQuality } from '../shared/hls';

const capturedStreams = new Map<string, CapturedStream>();
const debuggerTabs = new Set<number>();
const currentTimes = new Map<string, CurrentTimeInfo>();
const recordingStates = new Map<string, { controller: AbortController; startTime: number }>();
const videoIdToStreamId = new Map<string, string>();

const MAX_HISTORY_ENTRIES = 100;
const HISTORY_STORAGE_KEY = 'downloadHistory';

function generateStreamId(): string {
  return `stream_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateHistoryId(): string {
  return `hist_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function isMasterM3U8(url: string): boolean {
  return url.includes('master.m3u8');
}

function isLiveM3U8(url: string): boolean {
  return url.includes('tc.livehls') && url.includes('media.m3u8');
}

async function attachDebugger(tabId: number): Promise<void> {
  if (debuggerTabs.has(tabId)) return;
  
  try {
    await chrome.debugger.attach({ tabId }, '1.3');
    await chrome.debugger.sendCommand({ tabId }, 'Network.enable');
    await chrome.debugger.sendCommand({ tabId }, 'Network.setCacheDisabled', { cacheDisabled: true });
    debuggerTabs.add(tabId);
    console.log(`Debugger attached to tab ${tabId}`);
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes('Another debugger is already attached')) {
      debuggerTabs.add(tabId);
      console.log(`Debugger was already attached to tab ${tabId}`);
      return;
    }
    console.warn(`Failed to attach debugger to tab ${tabId}:`, errorMsg);
  }
}

async function detachDebugger(tabId: number): Promise<void> {
  debuggerTabs.delete(tabId);
  try {
    await chrome.debugger.detach({ tabId });
    console.log(`Debugger detached from tab ${tabId}`);
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (!errorMsg.includes('No tab with given id') && !errorMsg.includes('Not attached')) {
      console.warn(`Failed to detach debugger from tab ${tabId}:`, errorMsg);
    }
  }
}

async function extractCookies(): Promise<string> {
  try {
    const cookies = await chrome.cookies.getAll({ domain: 'twitcasting.tv' });
    return cookies.map(c => `${c.name}=${c.value}`).join('; ');
  } catch (error) {
    console.error('Failed to extract cookies:', error);
    return '';
  }
}

async function getTabInfo(tabId: number): Promise<{ title: string; url: string } | null> {
  try {
    const tab = await chrome.tabs.get(tabId);
    return { title: tab.title || '', url: tab.url || '' };
  } catch {
    return null;
  }
}

function extractVideoId(url: string): string | undefined {
  const movieMatch = url.match(/\/movie\/(\d+)/i);
  if (movieMatch) {
    return movieMatch[1];
  }
  const userMatch = url.match(/twitcasting\.tv\/([a-zA-Z0-9_:]+)(?:\/|$|\?)/i) || url.match(/^\/([a-zA-Z0-9_:]+)(?:\/|$|\?)/);
  if (userMatch) {
    return userMatch[1];
  }
  const match = url.match(/\/([a-zA-Z0-9_:]+)(?:\?|$)/);
  return match ? match[1] : undefined;
}

async function fetchLivePlaylist(masterUrl: string, headers: Record<string, string>): Promise<LiveStreamInfo | null> {
  try {
    const response = await fetch(masterUrl, {
      method: 'GET',
      headers: new Headers(headers),
      credentials: 'include',
    });
    if (!response.ok) return null;
    const text = await response.text();
    const baseUrl = masterUrl.substring(0, masterUrl.lastIndexOf('/') + 1);
    const playlist = parseMediaPlaylist(text, baseUrl);
    return extractLiveInfo(playlist);
  } catch {
    return null;
  }
}

async function fetchDurationAndVariants(stream: CapturedStream): Promise<{ duration?: number; variants?: HLSVariant[] }> {
  try {
    const headers = buildRequestHeaders(stream, stream.masterUrl);
    
    if (stream.type === 'live') {
      const response = await fetch(stream.masterUrl, {
        method: 'GET',
        headers: new Headers(headers),
        credentials: 'include',
      });
      if (!response.ok) return {};
      const text = await response.text();
      const baseUrl = stream.masterUrl.substring(0, stream.masterUrl.lastIndexOf('/') + 1);
      const mediaPlaylist = parseMediaPlaylist(text, baseUrl);
      return { duration: mediaPlaylist.totalDuration || undefined };
    } else {
      const masterResponse = await fetch(stream.masterUrl, {
        method: 'GET',
        headers: new Headers(headers),
        credentials: 'include',
      });
      if (!masterResponse.ok) return {};
      const masterText = await masterResponse.text();
      const baseUrl = stream.masterUrl.substring(0, stream.masterUrl.lastIndexOf('/') + 1);
      const variants = parseMasterPlaylist(masterText, baseUrl);
      
      if (variants.length === 0) return { variants };
      
      const selectedVariant = selectHighestQuality(variants);
      if (!selectedVariant) return { variants };
      
      const mediaResponse = await fetch(selectedVariant.uri, {
        method: 'GET',
        headers: new Headers(headers),
        credentials: 'include',
      });
      if (!mediaResponse.ok) return { variants };
      const mediaText = await mediaResponse.text();
      const mediaBaseUrl = selectedVariant.uri.substring(0, selectedVariant.uri.lastIndexOf('/') + 1);
      const mediaPlaylist = parseMediaPlaylist(mediaText, mediaBaseUrl);
      
      return { duration: mediaPlaylist.totalDuration || undefined, variants };
    }
  } catch (error) {
    console.error('Failed to fetch duration/variants:', error);
    return {};
  }
}

async function loadHistory(): Promise<DownloadHistoryItem[]> {
  try {
    const result = await chrome.storage.local.get(HISTORY_STORAGE_KEY);
    return result[HISTORY_STORAGE_KEY] || [];
  } catch {
    return [];
  }
}

async function saveHistory(history: DownloadHistoryItem[]): Promise<void> {
  try {
    await chrome.storage.local.set({ [HISTORY_STORAGE_KEY]: history });
  } catch (error) {
    console.error('Failed to save history:', error);
  }
}

async function addHistoryEntry(entry: Omit<DownloadHistoryItem, 'id' | 'timestamp' | 'status'>): Promise<DownloadHistoryItem> {
  const history = await loadHistory();
  const newEntry: DownloadHistoryItem = {
    ...entry,
    id: generateHistoryId(),
    timestamp: Date.now(),
    status: 'pending',
  };
  history.unshift(newEntry);
  if (history.length > MAX_HISTORY_ENTRIES) {
    history.splice(MAX_HISTORY_ENTRIES);
  }
  await saveHistory(history);
  return newEntry;
}

async function updateHistoryEntry(id: string, updates: Partial<DownloadHistoryItem>): Promise<void> {
  const history = await loadHistory();
  const index = history.findIndex(h => h.id === id);
  if (index >= 0) {
    history[index] = { ...history[index], ...updates };
    await saveHistory(history);
  }
}

async function deleteHistoryEntry(id: string): Promise<void> {
  const history = await loadHistory();
  const filtered = history.filter(h => h.id !== id);
  await saveHistory(filtered);
}

let creatingOffscreenPromise: Promise<void> | null = null;

async function ensureOffscreenDocument(): Promise<void> {
  // Check if offscreen document already exists
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });
  if (existingContexts.length > 0) {
    return;
  }

  if (creatingOffscreenPromise) {
    await creatingOffscreenPromise;
    return;
  }

  creatingOffscreenPromise = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.runtime.onMessage.removeListener(readyListener);
      reject(new Error('Offscreen document ready timeout'));
    }, 15000);

    const readyListener = (msg: Message) => {
      if (msg.type === MessageType.OFFSCREEN_READY) {
        clearTimeout(timeout);
        chrome.runtime.onMessage.removeListener(readyListener);
        resolve();
      }
    };
    chrome.runtime.onMessage.addListener(readyListener);

    chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['AUDIO_PLAYBACK', 'CLIPBOARD'] as chrome.offscreen.Reason[],
      justification: 'Required for FFmpeg.wasm video processing',
    }).catch(err => {
      clearTimeout(timeout);
      chrome.runtime.onMessage.removeListener(readyListener);
      // If document was created in the meantime, treat as success
      if (err.message && err.message.includes('Only a single offscreen document may be created')) {
        resolve();
      } else {
        reject(err);
      }
    });
  }).finally(() => {
    creatingOffscreenPromise = null;
  });

  await creatingOffscreenPromise;
}

chrome.debugger.onEvent.addListener(async (source, method, params?: object) => {
  const tabId = source.tabId;
  
  if (!params || tabId === undefined) return;
  
  const p = params as Record<string, unknown>;
  
  if (method === 'Network.requestWillBeSent') {
    const request = p.request as { url: string; headers: Record<string, string> };
    const documentURL = p.documentURL as string;
    
    if (isMasterM3U8(request.url) || isLiveM3U8(request.url)) {
      console.log('Captured m3u8:', request.url);
      
      const tabInfo = await getTabInfo(tabId);
      const cookieHeader = await extractCookies();
      
      const headers: Record<string, string> = {
        ...request.headers,
        Cookie: cookieHeader || request.headers.Cookie || request.headers.cookie || '',
      };
      
      const streamId = generateStreamId();
      const isLive = isLiveM3U8(request.url);
      let liveInfo: LiveStreamInfo | undefined;
      
      if (isLive) {
        liveInfo = await fetchLivePlaylist(request.url, headers) || { isLive: true };
      }
      
      const stream: CapturedStream = {
        id: streamId,
        masterUrl: request.url,
        headers,
        timestamp: Date.now(),
        tabId,
        tabTitle: tabInfo?.title || 'Unknown',
        videoId: extractVideoId(documentURL || ''),
        type: isLive ? 'live' : 'vod',
        liveInfo,
      };
      
      capturedStreams.set(streamId, stream);
      
      if (stream.videoId) {
        videoIdToStreamId.set(stream.videoId, streamId);
      }
      
      const initialMessage: Message = {
        type: MessageType.STREAM_CAPTURED,
        payload: stream,
      };
      chrome.runtime.sendMessage(initialMessage).catch(() => {});
      
      fetchDurationAndVariants(stream).then(({ duration, variants }) => {
        const updatedStream = capturedStreams.get(streamId);
        if (updatedStream) {
          if (duration !== undefined) updatedStream.duration = duration;
          if (variants !== undefined) updatedStream.variants = variants;
          capturedStreams.set(streamId, updatedStream);
          
          chrome.runtime.sendMessage({
            type: MessageType.STREAM_CAPTURED,
            payload: updatedStream,
          }).catch(() => {});
        }
      });
    }
  }
  
  if (method === 'Network.responseReceived') {
    const _requestId = p.requestId as string;
    const _response = p.response as Record<string, unknown>;
  }
});

chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  if (message.type === MessageType.GET_STREAMS) {
    const streams = Array.from(capturedStreams.values());
    sendResponse({ type: MessageType.STREAMS_LIST, payload: streams });
    return true;
  }
  
  if (message.type === MessageType.GET_CURRENT_TIME) {
    const { streamId } = message.payload as { streamId: string };
    const stream = capturedStreams.get(streamId);

    const respondWithFallback = () => {
      let timeInfo = currentTimes.get(streamId);
      if (!timeInfo && stream?.videoId) {
        timeInfo = currentTimes.get(stream.videoId);
      }

      if (timeInfo) {
        sendResponse({ type: MessageType.CURRENT_TIME_RESPONSE, payload: { ...timeInfo, streamId } });
        return;
      }

      if (stream?.liveInfo?.programDateTime) {
        const now = Date.now();
        const serverTimeMs = (stream.liveInfo.serverTime || Math.floor(now / 1000)) * 1000;
        const programStartMs = stream.liveInfo.programDateTime.getTime();
        const elapsedSinceServerTime = now - serverTimeMs;
        const currentTime = Math.floor((serverTimeMs - programStartMs + elapsedSinceServerTime) / 1000);

        const fallbackInfo: CurrentTimeInfo = {
          streamId,
          currentTime: Math.max(0, currentTime),
          updatedAt: now,
          duration: stream.duration,
        };
        sendResponse({ type: MessageType.CURRENT_TIME_RESPONSE, payload: fallbackInfo });
        return;
      }

      sendResponse({ type: MessageType.CURRENT_TIME_RESPONSE, payload: null });
    };

    if (stream?.tabId !== undefined) {
      chrome.tabs.sendMessage(stream.tabId, { type: MessageType.GET_CURRENT_TIME }, (response: Message | undefined) => {
        if (!chrome.runtime.lastError && response?.type === MessageType.CURRENT_TIME_RESPONSE && response.payload) {
          const tabTimeInfo = response.payload as CurrentTimeInfo;
          const updatedInfo: CurrentTimeInfo = {
            ...tabTimeInfo,
            streamId,
          };
          currentTimes.set(streamId, updatedInfo);
          if (stream.videoId) {
            currentTimes.set(stream.videoId, updatedInfo);
          }
          sendResponse({ type: MessageType.CURRENT_TIME_RESPONSE, payload: updatedInfo });
        } else {
          respondWithFallback();
        }
      });
      return true;
    }

    respondWithFallback();
    return true;
  }
  
  if (message.type === MessageType.CURRENT_TIME_UPDATE) {
    const { streamId, currentTime, duration } = message.payload as { streamId: string; currentTime: number; duration?: number };
    
    let actualStreamId = streamId;
    if (videoIdToStreamId.has(streamId)) {
      actualStreamId = videoIdToStreamId.get(streamId)!;
    }
    
    const info: CurrentTimeInfo = {
      streamId: actualStreamId,
      currentTime,
      updatedAt: Date.now(),
      duration,
    };
    currentTimes.set(actualStreamId, info);
    currentTimes.set(streamId, info);
    sendResponse({ success: true });
    return true;
  }
  
  if (message.type === MessageType.DOWNLOAD_STREAM) {
    const { streamId, startTime, endTime, quality, outputFilename } = message.payload as {
      streamId: string;
      startTime: number;
      endTime: number;
      quality: string;
      outputFilename: string;
    };
    
    const stream = capturedStreams.get(streamId);
    if (!stream) {
      sendResponse({ type: MessageType.DOWNLOAD_ERROR, payload: { error: 'Stream not found' } });
      return true;
    }
    
    const controller = new AbortController();
    
    if (stream.type === 'live') {
      recordingStates.set(streamId, { controller, startTime: Date.now() });
      chrome.runtime.sendMessage({
        type: MessageType.RECORDING_STATE_CHANGE,
        payload: { streamId, state: 'recording' },
      });
    }

    (async () => {
      try {
        await ensureOffscreenDocument();
        const historyEntry = await addHistoryEntry({
          streamId,
          filename: outputFilename,
          startTime,
          endTime,
          fileSize: 0,
        });

        chrome.runtime.sendMessage({
          type: MessageType.DOWNLOAD_STREAM,
          payload: {
            streamId,
            masterUrl: stream.masterUrl,
            headers: stream.headers,
            startTime,
            endTime,
            quality,
            outputFilename,
            isLive: stream.type === 'live',
            variants: stream.variants,
            historyId: historyEntry.id,
          },
        });
        sendResponse({ success: true });
      } catch (error) {
        recordingStates.delete(streamId);
        const errMsg = error instanceof Error ? error.message : 'オフスクリーンドキュメントの初期化に失敗しました';
        chrome.runtime.sendMessage({
          type: MessageType.DOWNLOAD_ERROR,
          payload: { streamId, error: errMsg },
        });
        sendResponse({ success: false, error: errMsg });
      }
    })();
    
    return true;
  }
  
  if (message.type === MessageType.DOWNLOAD_COMPLETE) {
    const { streamId, historyId, fileSize } = message.payload as { 
      streamId: string; 
      historyId?: string;
      fileSize?: number;
    };
    
    if (historyId) {
      updateHistoryEntry(historyId, { 
        status: 'success', 
        fileSize: fileSize || 0 
      });
    }
    
    const stream = capturedStreams.get(streamId);
    if (stream?.type === 'live') {
      recordingStates.delete(streamId);
      chrome.runtime.sendMessage({
        type: MessageType.RECORDING_STATE_CHANGE,
        payload: { streamId, state: 'stopped' },
      });
    }
    return true;
  }
  
  if (message.type === MessageType.DOWNLOAD_ERROR) {
    const { streamId, historyId, error } = message.payload as { 
      streamId: string; 
      historyId?: string;
      error?: string;
    };
    
    if (historyId) {
      updateHistoryEntry(historyId, { 
        status: 'failed', 
        error 
      });
    }
    
    const errorStream = capturedStreams.get(streamId);
    if (errorStream?.type === 'live') {
      recordingStates.delete(streamId);
      chrome.runtime.sendMessage({
        type: MessageType.RECORDING_STATE_CHANGE,
        payload: { streamId, state: 'stopped' },
      });
    }
    return true;
  }
  
  if (message.type === MessageType.STOP_DOWNLOAD) {
    const { streamId } = message.payload as { streamId: string };
    const recording = recordingStates.get(streamId);
    if (recording) {
      recording.controller.abort();
      recordingStates.delete(streamId);
      chrome.runtime.sendMessage({
        type: MessageType.RECORDING_STATE_CHANGE,
        payload: { streamId, state: 'stopped' },
      });
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: 'No active download' });
    }
    return true;
  }
  
  if (message.type === MessageType.STOP_RECORDING) {
    const { streamId } = message.payload as { streamId: string };
    const recording = recordingStates.get(streamId);
    if (recording) {
      recording.controller.abort();
      recordingStates.delete(streamId);
      chrome.runtime.sendMessage({
        type: MessageType.RECORDING_STATE_CHANGE,
        payload: { streamId, state: 'stopped' },
      });
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: 'No active recording' });
    }
    return true;
  }
  
  if (message.type === MessageType.DELETE_STREAM) {
    const { streamId } = message.payload as { streamId: string };
    const stream = capturedStreams.get(streamId);
    if (stream?.videoId) {
      videoIdToStreamId.delete(stream.videoId);
    }
    capturedStreams.delete(streamId);
    currentTimes.delete(streamId);
    sendResponse({ success: true });
    return true;
  }
  
  if (message.type === MessageType.CLEAR_ALL_STREAMS) {
    capturedStreams.clear();
    currentTimes.clear();
    videoIdToStreamId.clear();
    sendResponse({ success: true });
    return true;
  }
  
  if (message.type === MessageType.GET_HISTORY) {
    loadHistory().then(history => {
      sendResponse({ type: MessageType.HISTORY_LIST, payload: history });
    });
    return true;
  }
  
  if (message.type === MessageType.DELETE_HISTORY) {
    const { id } = message.payload as { id: string };
    deleteHistoryEntry(id).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
  
  return false;
});

async function attachExistingTabs(): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({ url: '*://*.twitcasting.tv/*' });
    for (const tab of tabs) {
      if (tab.id !== undefined) {
        attachDebugger(tab.id).catch(err => {
          console.warn(`Could not attach debugger to tab ${tab.id}:`, err);
        });
      }
    }
  } catch (error) {
    console.error('Failed to query existing tabs:', error);
  }
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('twitcasting.tv')) {
    try {
      await attachDebugger(tabId);
    } catch (error) {
      console.error('Failed to auto-attach debugger:', error);
    }
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  detachDebugger(tabId);
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('Twicaster extension installed');
  attachExistingTabs();
});

attachExistingTabs();

console.log('Background service worker started');