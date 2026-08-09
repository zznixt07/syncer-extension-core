
import type {AdapterKind, MediaIdentity} from '../types.js';

export interface BrowserNode {
  textContent?: string | null;
  getAttribute?(name: string): string | null;
  contentDocument?: BrowserPage['document'] | null;
}

export interface BrowserMediaElement extends BrowserNode {
  clientWidth: number;
  clientHeight: number;
  currentTime: number;
  duration: number;
  ended: boolean;
  muted: boolean;
  paused: boolean;
  playbackRate: number;
  preservesPitch?: boolean;
  readyState: number;
  addEventListener(type: string, listener: () => void): void;
  pause(): void;
  play(): Promise<unknown>;
}

interface BrowserPage {
  document: {
    title?: string;
    documentElement?: unknown;
    querySelector(selector: string): BrowserNode | null;
    querySelectorAll(selector: string): ArrayLike<unknown>;
  };
  location: {href: string};
  MutationObserver?: new (listener: () => void) => {observe(target: unknown, options: unknown): void; disconnect?(): void};
  setInterval(listener: () => void, milliseconds: number): unknown;
  clearInterval?(timer: unknown): void;
}

export type BrowserServiceStatus = 'ready' | 'missing-media' | 'ad' | 'unavailable';

export interface BrowserAdapterInspection {
  adapter: Extract<AdapterKind, 'html' | 'youtube' | 'spotify'>;
  service: string;
  identity: Omit<MediaIdentity, 'isLive' | 'durationMs'>;
  status: BrowserServiceStatus;
  message?: string;
  experimental?: boolean;
  canSetRate: boolean;
}

export interface BrowserAdapterApi {
  findMedia(): BrowserMediaElement | null;
  inspect(): BrowserAdapterInspection;
  sameIdentity(left?: string, right?: string): boolean;
  watch(listener: (inspection: BrowserAdapterInspection) => void): () => void;
}

export interface BrowserRootIdentity {
  url: string;
  title?: string;
}

const hostMatches = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);
const clean = (value?: string | null) => value?.replace(/\s+/g, ' ').trim() || undefined;
const nodeValue = (node: BrowserNode | null) => clean(node?.getAttribute?.('content') || node?.textContent);

export const youtubeCanonicalId = (input: string, base = input) => {
  try {
    const url = new URL(input, base);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    let id: string | undefined;
    if (host === 'youtu.be') id = clean(url.pathname.split('/').filter(Boolean)[0]);
    else if (hostMatches(host, 'youtube.com') || hostMatches(host, 'youtube-nocookie.com')) {
      if (url.pathname === '/watch') id = clean(url.searchParams.get('v'));
      else {
        const parts = url.pathname.split('/').filter(Boolean);
        const marker = parts.findIndex(part => ['shorts', 'embed', 'live'].includes(part));
        if (marker >= 0) id = clean(parts[marker + 1]);
      }
    }
    return id ? `youtube:${id}` : undefined;
  } catch {
    return undefined;
  }
};

export const spotifyCanonicalId = (input: string, base = input) => {
  const uri = input.match(/^spotify:(track|episode):([^:?#/]+)$/i);
  if (uri) return `spotify:${uri[1]!.toLowerCase()}:${uri[2]!}`;
  try {
    const url = new URL(input, base);
    if (!hostMatches(url.hostname.toLowerCase(), 'spotify.com')) return undefined;
    const parts = url.pathname.split('/').filter(Boolean);
    const index = parts.findIndex(part => part === 'track' || part === 'episode');
    return index >= 0 && parts[index + 1] ? `spotify:${parts[index]}:${parts[index + 1]}` : undefined;
  } catch {
    return undefined;
  }
};

export const normalizedIdentity = (value?: string) => {
  if (!value) return undefined;
  if (value.startsWith('youtube:') || value.startsWith('spotify:')) return value;
  return youtubeCanonicalId(value) || spotifyCanonicalId(value) || value;
};

const identityVariants = (value?: string) => {
  const normalized = normalizedIdentity(value);
  const variants = new Set<string>();
  if (!normalized) return variants;
  variants.add(normalized);
  if (normalized.startsWith('youtube:')) variants.add(normalized.slice('youtube:'.length));
  if (normalized.startsWith('spotify:')) variants.add(normalized.slice('spotify:'.length));
  return variants;
};

export const sameMediaIdentity = (left?: string, right?: string) => {
  if (!left || !right) return true;
  const rightVariants = identityVariants(right);
  return [...identityVariants(left)].some(value => rightVariants.has(value));
};

export const createBrowserAdapterApi = (
  scope: BrowserPage,
  getRootIdentity: () => BrowserRootIdentity | undefined = () => undefined,
): BrowserAdapterApi => {
  const query = (selector: string) => scope.document.querySelector(selector);
  const content = (selector: string) => nodeValue(query(selector));
  const exists = (selector: string) => Boolean(query(selector));
  const findMedia = () => {
    const media: BrowserMediaElement[] = [];
    const visited = new Set<BrowserPage['document']>();
    const scan = (document: BrowserPage['document']) => {
      if (visited.has(document)) return;
      visited.add(document);
      media.push(...Array.from(document.querySelectorAll('video, audio')) as BrowserMediaElement[]);
      (Array.from(document.querySelectorAll('iframe')) as BrowserNode[]).forEach(frame => {
        // Cross-origin frame documents intentionally throw or return null.
        try {
          if (frame.contentDocument) scan(frame.contentDocument);
        } catch {}
      });
    };
    scan(scope.document);
    return media.sort((left, right) =>
      right.clientWidth * right.clientHeight - left.clientWidth * left.clientHeight)[0] ?? null;
  };

  const inspect = (): BrowserAdapterInspection => {
    const href = scope.location.href;
    const url = new URL(href);
    const host = url.hostname.toLowerCase();
    const media = findMedia();

    if (host === 'youtu.be' || hostMatches(host, 'youtube.com') || hostMatches(host, 'youtube-nocookie.com')) {
      const canonicalId = youtubeCanonicalId(href);
      const ad = exists('.ad-showing, .video-ads ytd-ad-slot-renderer, .ytp-ad-player-overlay');
      const unavailable = exists('ytd-player-error-message-renderer, #error-screen, .ytp-error') || !canonicalId;
      const status: BrowserServiceStatus = ad ? 'ad' : unavailable ? 'unavailable' : media ? 'ready' : 'missing-media';
      return {
        adapter: 'youtube',
        service: 'youtube',
        identity: {
          canonicalId,
          url: href,
          title: content('meta[property="og:title"]') ||
            content('h1.ytd-watch-metadata yt-formatted-string') ||
            content('h1.title yt-formatted-string') || clean(scope.document.title?.replace(/\s*-\s*YouTube\s*$/, '')),
          artist: content('ytd-watch-metadata #owner #channel-name a') ||
            content('#upload-info #channel-name a') || content('meta[itemprop="author"]'),
        },
        status,
        message: ad ? 'YouTube ad playing; synchronization is paused.' : unavailable ?
          'This YouTube video is unavailable or has no stable identity.' :
          !media ? 'No YouTube media element is available yet.' : undefined,
        canSetRate: false,
      };
    }

    if (hostMatches(host, 'spotify.com')) {
      const identityNode = query('[data-testid="context-item-link"]') ||
        query('[data-testid="nowplaying-track-link"]') || query('a[href*="/track/"], a[href*="/episode/"]');
      const identityHref = identityNode?.getAttribute?.('href') || '';
      const canonicalId = spotifyCanonicalId(identityHref, href) || spotifyCanonicalId(href);
      const title = nodeValue(identityNode) || content('[data-testid="now-playing-widget"] [dir="auto"]') ||
        content('meta[property="og:title"]') || clean(scope.document.title);
      const artist = content('[data-testid="context-item-info-artist"]') ||
        content('[data-testid="now-playing-widget"] a[href*="/artist/"]') ||
        content('[data-testid="now-playing-widget"] a[href*="/show/"]') || content('meta[name="music:musician"]');
      const ad = exists('[data-testid="ad-banner"], [data-testid="now-playing-advertisement"], [data-ad-type]') ||
        /(^|\s)advertisement(\s|$)/i.test(`${title || ''} ${scope.document.title || ''}`);
      const unavailable = exists('[data-testid="track-page"] [aria-disabled="true"], [data-testid="error-page"], .error-page');
      const status: BrowserServiceStatus = ad ? 'ad' : unavailable || !canonicalId ? 'unavailable' : media ? 'ready' : 'missing-media';
      return {
        adapter: 'spotify',
        service: 'spotify',
        identity: {canonicalId, url: href, title, artist},
        status,
        experimental: true,
        message: ad ? 'Spotify ad playing; synchronization is paused.' : unavailable || !canonicalId ?
          'This Spotify track or episode is unavailable or has no stable identity.' :
          !media ? 'Spotify has not exposed a media element yet.' : undefined,
        canSetRate: false,
      };
    }

    const rootIdentity = getRootIdentity();
    const identityUrl = rootIdentity?.url || href;
    return {
      adapter: 'html',
      service: 'web',
      identity: {
        canonicalId: identityUrl,
        url: identityUrl,
        title: clean(rootIdentity?.title) || clean(scope.document.title),
      },
      status: media ? 'ready' : 'missing-media',
      message: media ? undefined : 'No HTML media element found.',
      canSetRate: true,
    };
  };

  const watch = (listener: (inspection: BrowserAdapterInspection) => void) => {
    let previous = '';
    const check = () => {
      const inspection = inspect();
      const key = `${inspection.adapter}|${inspection.identity.canonicalId || inspection.identity.url}|${inspection.status}|${inspection.identity.title || ''}`;
      if (key === previous) return;
      previous = key;
      listener(inspection);
    };
    check();
    const observer = scope.MutationObserver && scope.document.documentElement
      ? new scope.MutationObserver(check)
      : null;
    observer?.observe(scope.document.documentElement, {childList: true, subtree: true, attributes: true});
    const timer = scope.setInterval(check, 1000);
    return () => {
      observer?.disconnect?.();
      scope.clearInterval?.(timer);
    };
  };

  return {
    findMedia,
    inspect,
    sameIdentity: sameMediaIdentity,
    watch,
  };
};
