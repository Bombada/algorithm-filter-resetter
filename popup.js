const DEFAULT_SETTINGS = {
  autoExplore: true,
  interestExpansion: true,
  sensitivity: 0.8,
  expansionKeywords: ''
};

const STATS_WINDOWS = {
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000
};

const bubbleValue = document.getElementById('bubbleValue');
const gauge = document.getElementById('gauge');
const statusText = document.getElementById('statusText');
const termText = document.getElementById('termText');
const sensitivityValue = document.getElementById('sensitivityValue');
const searchResult = document.getElementById('searchResult');
const keywordWindow = document.getElementById('keywordWindow');
const statsMeta = document.getElementById('statsMeta');
const statsList = document.getElementById('statsList');
const statsDomain = document.getElementById('statsDomain');

const autoExplore = document.getElementById('autoExplore');
const interestExpansion = document.getElementById('interestExpansion');
const sensitivity = document.getElementById('sensitivity');
const keywords = document.getElementById('keywords');
const searchBtn = document.getElementById('searchBtn');

let activeTab = null;
let statsRefreshTimer = null;

function setGauge(value) {
  const safe = Math.max(0, Math.min(100, value || 0));
  gauge.style.width = `${safe}%`;
  bubbleValue.textContent = `${safe}%`;
}

function updateStatus(state) {
  if (!state) {
    setGauge(0);
    statusText.textContent = 'No feed analysis yet on this tab.';
    termText.textContent = '';
    return;
  }

  setGauge(state.bubbleIndex);
  statusText.textContent = state.repetitive
    ? 'Repetitive pattern detected. Auto-reset behavior is active.'
    : 'Feed looks diverse enough at the moment.';
  termText.textContent = state.topTerms?.length
    ? `Dominant terms: ${state.topTerms.join(', ')}`
    : 'No dominant terms yet.';
}

function saveSettings() {
  const payload = {
    autoExplore: autoExplore.checked,
    interestExpansion: interestExpansion.checked,
    sensitivity: Number(sensitivity.value) / 100,
    expansionKeywords: keywords.value.trim()
  };

  chrome.storage.sync.set(payload);
  sensitivityValue.textContent = `${Math.round(payload.sensitivity * 100)}%`;
}

function hydrateSettings(settings) {
  autoExplore.checked = !!settings.autoExplore;
  interestExpansion.checked = !!settings.interestExpansion;
  sensitivity.value = Math.round((settings.sensitivity || 0.8) * 100);
  sensitivityValue.textContent = `${sensitivity.value}%`;
  keywords.value = settings.expansionKeywords || '';
}

function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0]);
    });
  });
}

function loadTabState(tabId) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'getTabState', tabId }, (response) => {
      resolve(response?.state || null);
    });
  });
}

function renderKeywordStats(stats) {
  statsMeta.textContent = `Samples: ${stats.samples}`;

  if (!stats.topKeywords.length) {
    statsList.innerHTML = '<li>No keyword data yet.</li>';
  } else {
    statsList.innerHTML = stats.topKeywords
      .map((item) => `<li><span>${item.keyword}</span><strong>${item.count}</strong></li>`)
      .join('');
  }

  if (!stats.topDomains.length) {
    statsDomain.textContent = 'Top pages: no data yet';
  } else {
    const top = stats.topDomains.map((item) => `${item.domain} (${item.count})`).join(', ');
    statsDomain.textContent = `Top pages: ${top}`;
  }
}

function refreshKeywordStats() {
  const selectedWindow = STATS_WINDOWS[keywordWindow.value] || STATS_WINDOWS.hour;

  chrome.runtime.sendMessage({ type: 'getKeywordStats', windowMs: selectedWindow }, (response) => {
    if (!response?.ok || !response.stats) {
      statsMeta.textContent = 'Stats unavailable right now.';
      return;
    }

    renderKeywordStats(response.stats);
  });
}

searchBtn.addEventListener('click', () => {
  const keywordRaw = keywords.value.trim();
  if (!keywordRaw) {
    searchResult.textContent = 'Please enter at least one keyword.';
    return;
  }

  const firstKeyword = keywordRaw.split(',')[0].trim();

  chrome.runtime.sendMessage(
    {
      type: 'runKeywordExpansion',
      keyword: firstKeyword,
      sourceUrl: activeTab?.url || ''
    },
    (response) => {
      if (response?.ok) {
        searchResult.textContent = `Opened exploration for: ${firstKeyword}`;
      } else {
        searchResult.textContent = response?.error || 'Unable to run exploration.';
      }
    }
  );
});

[autoExplore, interestExpansion, sensitivity, keywords].forEach((el) => {
  el.addEventListener('change', saveSettings);
});

keywordWindow.addEventListener('change', refreshKeywordStats);

(async function init() {
  chrome.storage.sync.get(DEFAULT_SETTINGS, async (stored) => {
    hydrateSettings({ ...DEFAULT_SETTINGS, ...stored });

    activeTab = await getActiveTab();
    if (activeTab?.id) {
      const state = await loadTabState(activeTab.id);
      updateStatus(state);
    }

    refreshKeywordStats();
    statsRefreshTimer = setInterval(refreshKeywordStats, 5000);
  });
})();

window.addEventListener('unload', () => {
  if (statsRefreshTimer) {
    clearInterval(statsRefreshTimer);
  }
});
