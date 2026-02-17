const DEFAULT_SETTINGS = {
  autoExplore: true,
  interestExpansion: true,
  sensitivity: 0.8,
  expansionKeywords: ''
};

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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'analysisReport' && sender.tab?.id) {
    const tabId = sender.tab.id;
    const payload = message.payload || {};

    tabState.set(tabId, {
      ...payload,
      updatedAt: Date.now()
    });

    updateBadge(tabId, payload.bubbleIndex || 0);

    chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
      if (settings.autoExplore && payload.repetitive) {
        chrome.tabs.sendMessage(tabId, { type: 'performAutoExplore' });
      }
    });

    sendResponse({ ok: true });
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
