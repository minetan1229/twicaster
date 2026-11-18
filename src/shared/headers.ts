import { CapturedStream } from './types';

const DEFAULT_HEADERS = {
  'Accept': '*/*',
  'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'cross-site',
  'Priority': 'u=1, i',
};

export function buildRequestHeaders(
  stream: CapturedStream,
  url: string
): Record<string, string> {
  const urlObj = new URL(url);
  const isTwitCasting = urlObj.hostname.endsWith('twitcasting.tv');
  const isDownloadDomain = urlObj.hostname.startsWith('dl') && urlObj.hostname.endsWith('twitcasting.tv');
  
  const headers: Record<string, string> = {
    ...DEFAULT_HEADERS,
    'Origin': 'https://twitcasting.tv',
    'Referer': 'https://twitcasting.tv/',
    'User-Agent': navigator.userAgent,
  };
  
  if (stream.headers.Cookie) {
    headers['Cookie'] = stream.headers.Cookie;
  }
  
  if (isDownloadDomain) {
    headers['Referer'] = 'https://twitcasting.tv/';
    headers['Origin'] = 'https://twitcasting.tv';
  }
  
  return headers;
}

export async function extractCookiesForDomain(domain: string): Promise<string> {
  const cookies = await chrome.cookies.getAll({ domain });
  return cookies
    .map(c => `${c.name}=${c.value}`)
    .join('; ');
}

export function parseResponseHeaders(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (lowerKey === 'set-cookie') {
      result.Cookie = value;
    } else if (['content-type', 'content-length', 'etag', 'last-modified'].includes(lowerKey)) {
      result[key] = value;
    }
  }
  return result;
}

export async function getHeadersForStream(stream: CapturedStream): Promise<Record<string, string>> {
  const cookieHeader = await extractCookiesForDomain('twitcasting.tv');
  const headers = { ...stream.headers };
  
  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }
  
  return headers;
}