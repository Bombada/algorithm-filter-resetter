const DEFAULT_SETTINGS = {
  autoExplore: true,
  interestExpansion: true,
  sensitivity: 0.8,
  expansionKeywords: ''
};

const bubbleValue = document.getElementById('bubbleValue');
const gauge = document.getElementById('gauge');
const statusText = document.getElementById('statusText');
const termText = document.getElementById('termText');
const sensitivityValue = document.getElementById('sensitivityValue');
const searchResult = document.getElementById('searchResult');

const autoExplore = document.getElementById('autoExplore');
const interestExpansion = document.getElementById('interestExpansion');
const sensitivity = document.getElementById('sensitivity');
const keywords = document.getElementById('keywords');
const searchBtn = document.getElementById('searchBtn');

let activeTab = null;

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

(async function init() {
  chrome.storage.sync.get(DEFAULT_SETTINGS, async (stored) => {
    hydrateSettings({ ...DEFAULT_SETTINGS, ...stored });

    activeTab = await getActiveTab();
    if (activeTab?.id) {
      const state = await loadTabState(activeTab.id);
      updateStatus(state);
    }
  });
})();
