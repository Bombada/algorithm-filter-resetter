const DEFAULT_SETTINGS = {
  autoExplore: true,
  interestExpansion: true,
  sensitivity: 0.8,
  expansionKeywords: ''
};

const KEYWORD_STATS_KEY = 'keywordStatsHistory';
const MAX_HISTORY_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_HISTORY_ENTRIES = 3000;

const tabState = new Map();

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(DEFAULT_SETTINGS, (stored) => {
    chrome.storage.sync.set({ ...DEFAULT_SETTINGS, ...stored });
  });
});

function updateBadge(tabId, bubbleIndex) {
  const text = bubbleIndex > 0 ? `${bubbleIndex}%` : '';
  const color = bubbleIndex >= 80 ? '#d64545' : bubbleIndex >= 50 ? '#d69b45' : '#3d8f52';

  chrome.action.setBadgeText({ tabId, text });
  chrome.action.setBadgeBackgroundColor({ tabId, color });
}

function normalizeKeyword(term) {
  return (term || '').toString().trim().toLowerCase();
}

function pruneHistory(history) {
  const now = Date.now();
  const recent = history.filter((entry) => now - entry.timestamp <= MAX_HISTORY_MS);
  if (recent.length <= MAX_HISTORY_ENTRIES) {
    return recent;
  }

  return recent.slice(recent.length - MAX_HISTORY_ENTRIES);
}

function appendKeywordStats(payload, tab) {
  const topTerms = Array.isArray(payload.topTerms) ? payload.topTerms : [];
  if (!topTerms.length || !payload.changed) {
    return;
  }

  const timestamp = Date.now();
  const sourceUrl = payload.url || tab?.url || '';
  let sourceDomain = '';
  if (sourceUrl) {
    try {
      sourceDomain = new URL(sourceUrl).hostname;
    } catch (_error) {
      sourceDomain = '';
    }
  }
  const terms = topTerms.map(normalizeKeyword).filter(Boolean);

  if (!terms.length) {
    return;
  }

  chrome.storage.local.get({ [KEYWORD_STATS_KEY]: [] }, (stored) => {
    const history = Array.isArray(stored[KEYWORD_STATS_KEY]) ? stored[KEYWORD_STATS_KEY] : [];
    history.push({ timestamp, terms, sourceUrl, sourceDomain });
    chrome.storage.local.set({ [KEYWORD_STATS_KEY]: pruneHistory(history) });
  });
}

function summarizeKeywordStats(windowMs) {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [KEYWORD_STATS_KEY]: [] }, (stored) => {
      const history = Array.isArray(stored[KEYWORD_STATS_KEY]) ? stored[KEYWORD_STATS_KEY] : [];
      const now = Date.now();
      const cutoff = now - windowMs;
      const inRange = history.filter((entry) => entry.timestamp >= cutoff);

      const keywordCounts = new Map();
      const domainCounts = new Map();

      inRange.forEach((entry) => {
        entry.terms.forEach((term) => {
          keywordCounts.set(term, (keywordCounts.get(term) || 0) + 1);
        });

        if (entry.sourceDomain) {
          domainCounts.set(entry.sourceDomain, (domainCounts.get(entry.sourceDomain) || 0) + 1);
        }
      });

      const topKeywords = [...keywordCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([keyword, count]) => ({ keyword, count }));

      const topDomains = [...domainCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([domain, count]) => ({ domain, count }));

      resolve({
        timeWindowMs: windowMs,
        samples: inRange.length,
        topKeywords,
        topDomains
      });
    });
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'analysisReport' && sender.tab?.id) {
    const tabId = sender.tab.id;
    const payload = message.payload || {};

    tabState.set(tabId, {
      ...payload,
      updatedAt: Date.now()
    });

    updateBadge(tabId, payload.bubbleIndex || 0);
    appendKeywordStats(payload, sender.tab);

    chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
      if (settings.autoExplore && payload.repetitive) {
        chrome.tabs.sendMessage(tabId, { type: 'performAutoExplore' });
      }
    });

    sendResponse({ ok: true });
  }

  if (message?.type === 'getKeywordStats') {
    const windowMs = Math.max(60 * 60 * 1000, Math.min(MAX_HISTORY_MS, Number(message.windowMs) || 60 * 60 * 1000));
    summarizeKeywordStats(windowMs).then((stats) => {
      sendResponse({ ok: true, stats });
    });
  }

  if (message?.type === 'getTabState') {
    const tabId = message.tabId;
    sendResponse({
      ok: true,
      state: tabState.get(tabId) || null
    });
  }

  if (message?.type === 'runKeywordExpansion') {
    const { keyword, sourceUrl } = message;
    if (!keyword) {
      sendResponse({ ok: false, error: 'Keyword is empty.' });
      return true;
    }

    const domain = sourceUrl ? new URL(sourceUrl).hostname : '';
    let target = `https://www.google.com/search?q=${encodeURIComponent(keyword)}`;

    if (domain.includes('youtube.com')) {
      target = `https://www.youtube.com/results?search_query=${encodeURIComponent(keyword)}`;
    } else if (domain.includes('tiktok.com')) {
      target = `https://www.tiktok.com/search?q=${encodeURIComponent(keyword)}`;
    }

    chrome.tabs.create({ url: target });
    sendResponse({ ok: true, target });
  }

  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabState.delete(tabId);
});
