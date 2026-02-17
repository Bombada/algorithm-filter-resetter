const DEFAULT_SETTINGS = {
  autoExplore: true,
  interestExpansion: true,
  sensitivity: 0.8,
  expansionKeywords: ''
};

let settings = { ...DEFAULT_SETTINGS };
let lastDigest = '';
let lastActionAt = 0;
let scanTimer = null;

const ANALYSIS_INTERVAL_MS = 5000;
const ACTION_COOLDOWN_MS = 15000;

const TITLE_SELECTORS = [
  'h1',
  'h2',
  'h3',
  '[id="video-title"]',
  'a#video-title',
  '[data-e2e="video-desc"]',
  '[data-e2e="browse-video-desc"]',
  'article h2',
  'article h3'
];

const TAG_SELECTORS = [
  '[rel="tag"]',
  'a[href*="/hashtag/"]',
  '.hashtag',
  '[class*="tag"]'
];

function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\p{L}\p{N}# ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text) {
  const normalized = normalizeText(text);
  return normalized
    .split(' ')
    .filter((token) => token.length > 2 || token.startsWith('#'));
}

function readElements(selectors) {
  const values = [];
  selectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((el) => {
      const text = (el.textContent || '').trim();
      if (text) {
        values.push(text);
      }
    });
  });
  return values;
}

function collectFeedTexts() {
  const titleTexts = readElements(TITLE_SELECTORS);
  const tagTexts = readElements(TAG_SELECTORS);
  const combined = [...titleTexts, ...tagTexts];

  if (combined.length === 0) {
    const fallback = Array.from(document.querySelectorAll('a, span, h1, h2, h3'))
      .map((el) => (el.textContent || '').trim())
      .filter(Boolean)
      .slice(0, 60);
    return fallback;
  }

  return combined.slice(0, 80);
}

function computeRepetition(feedItems) {
  if (!feedItems.length) {
    return {
      repetitive: false,
      bubbleIndex: 0,
      similarityScore: 0,
      topTerms: []
    };
  }

  const tokenCounts = new Map();
  const signatures = feedItems.map((item) => {
    const tokens = tokenize(item);
    const unique = [...new Set(tokens)];
    unique.forEach((token) => tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1));
    return unique;
  });

  const sortedTerms = [...tokenCounts.entries()].sort((a, b) => b[1] - a[1]);
  const topTerms = sortedTerms.slice(0, 5).map(([term]) => term);

  const dominantCoverage = sortedTerms
    .slice(0, 5)
    .reduce((acc, [, count]) => acc + count, 0) / (feedItems.length * 5 || 1);

  const base = signatures[0] || [];
  let similarCount = 0;
  for (let i = 1; i < signatures.length; i += 1) {
    const compared = signatures[i];
    const intersection = compared.filter((token) => base.includes(token)).length;
    const union = new Set([...base, ...compared]).size || 1;
    const score = intersection / union;
    if (score >= 0.5) {
      similarCount += 1;
    }
  }

  const similarityScore = signatures.length > 1 ? similarCount / (signatures.length - 1) : 0;
  const bubbleIndex = Math.round(Math.min(100, ((dominantCoverage + similarityScore) / 2) * 100));
  const repetitive = bubbleIndex >= Math.round(settings.sensitivity * 100);

  return {
    repetitive,
    bubbleIndex,
    similarityScore,
    topTerms
  };
}

function digestResult(result) {
  return JSON.stringify({
    repetitive: result.repetitive,
    bubbleIndex: result.bubbleIndex,
    topTerms: result.topTerms
  });
}

function runAnalysis() {
  const feedItems = collectFeedTexts();
  const result = computeRepetition(feedItems);
  const digest = digestResult(result);

  if (digest === lastDigest) {
    return;
  }

  lastDigest = digest;

  chrome.runtime.sendMessage({
    type: 'analysisReport',
    payload: {
      url: location.href,
      feedSize: feedItems.length,
      ...result
    }
  });
}

function tryAutoAction() {
  const now = Date.now();
  if (now - lastActionAt < ACTION_COOLDOWN_MS) {
    return;
  }

  lastActionAt = now;

  const beforeHeight = document.body ? document.body.scrollHeight : 0;
  window.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' });

  setTimeout(() => {
    const afterHeight = document.body ? document.body.scrollHeight : 0;
    const heightDelta = Math.abs(afterHeight - beforeHeight);

    if (heightDelta < 40) {
      const nextButton =
        document.querySelector('a[rel="next"]') ||
        document.querySelector('button[aria-label*="next" i]') ||
        document.querySelector('button[aria-label*="다음" i]');

      if (nextButton) {
        nextButton.click();
      }
    }
  }, 3500);
}

function startAnalyzer() {
  if (scanTimer) {
    clearInterval(scanTimer);
  }

  scanTimer = setInterval(runAnalysis, ANALYSIS_INTERVAL_MS);
  runAnalysis();
}

chrome.storage.sync.get(DEFAULT_SETTINGS, (stored) => {
  settings = { ...DEFAULT_SETTINGS, ...stored };
  startAnalyzer();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'sync') {
    return;
  }

  Object.keys(changes).forEach((key) => {
    settings[key] = changes[key].newValue;
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'performAutoExplore') {
    if (settings.autoExplore) {
      setTimeout(tryAutoAction, 3000);
    }
    sendResponse({ ok: true });
  }

  if (message?.type === 'getContentSnapshot') {
    const feedItems = collectFeedTexts();
    const result = computeRepetition(feedItems);
    sendResponse({ ok: true, snapshot: result, feedSize: feedItems.length });
  }

  return true;
});
