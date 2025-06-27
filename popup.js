let keywords = [];
let foundJobs = [];
let hiddenJobIds = new Set();
let viewedJobIds = new Set();
let currentLang = 'en';
let translations = {};

// --- 1. MANUAL TRANSLATION HANDLER ---

async function loadLanguage(lang) {
  try {
    const response = await fetch(`/_locales/${lang}/messages.json`);
    if (!response.ok) throw new Error(`Failed to load ${lang}.json`);
    const messages = await response.json();
    translations = {};
    for (const key in messages) {
      translations[key] = messages[key].message;
    }
  } catch (error) {
    console.error('Language load failed:', error);
    if (lang !== 'en') await loadLanguage('en');
  }
}

function t(key, substitutions = []) {
  let message = translations[key] || key;
  substitutions.forEach((sub, i) => {
    message = message.replace(`$${i + 1}`, sub);
  });
  return message;
}

// --- 2. UI RENDERING ---

function renderUI() {
  document.documentElement.lang = currentLang;
  document.querySelectorAll('[data-i18n]').forEach(elem => {
    const key = elem.getAttribute('data-i18n');
    const value = elem.getAttribute('data-i18n-value');
    elem.textContent = t(key, value ? [value] : []);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(elem => {
    const key = elem.getAttribute('data-i18n-placeholder');
    elem.placeholder = t(key);
  });
  updateStatus();
  updateJobList();
}

async function setLanguageAndRender(lang) {
  currentLang = lang;
  await loadLanguage(lang);
  renderUI();
}

// --- 3. CORE LOGIC & EVENT HANDLERS ---

function updateStatus() {
  chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
    if (chrome.runtime.lastError) return;
    const statusDot = document.getElementById('statusDot');
    const toggleBtn = document.getElementById('toggleBtn');
    const statusText = document.getElementById('statusText');
    if (response && response.isMonitoring) {
      statusDot.classList.add('active');
      toggleBtn.classList.add('stop');
      toggleBtn.textContent = t('buttonStop');
      statusText.textContent = response.autoRefreshInterval > 0
        ? t('statusActiveWithRefresh', [response.autoRefreshInterval.toString()])
        : t('statusActive');
    } else {
      statusDot.classList.remove('active');
      toggleBtn.classList.remove('stop');
      statusText.textContent = t('statusInactive');
      toggleBtn.textContent = t('buttonStart');
    }
  });
}

function handleToggle() {
  chrome.runtime.sendMessage({ action: 'toggleMonitoring' }, (response) => {
    if (chrome.runtime.lastError) return;
    updateStatus();
    if (response && response.isMonitoring) {
      chrome.tabs.query({ url: 'https://www.linkedin.com/jobs/*' }, (tabs) => {
        if (tabs.length === 0) alert(t('alertLinkedInNotOpen'));
      });
    }
  });
}

function saveFilters() {
  const filters = {
    keywords: keywords,
    company: document.getElementById('companyFilter').value.trim(),
    location: document.getElementById('locationFilter').value.trim(),
    datePosted: document.getElementById('datePostedFilter').value,
    easyApply: document.getElementById('easyApplyFilter').checked
  };
  chrome.storage.local.set({ filters }, () => {
    chrome.runtime.sendMessage({ action: 'updateFilters', filters: filters }, () => {
      alert(t('alertFiltersSaved'));
    });
  });
}

function clearAllJobs() {
  if (confirm(t('alertConfirmClear'))) {
    foundJobs = [];
    hiddenJobIds.clear();
    viewedJobIds.clear();
    chrome.storage.local.set({ foundJobs: [], hiddenJobIds: [], viewedJobIds: [] }, updateJobList);
  }
}

function updateJobList() {
  const jobList = document.getElementById('jobList');
  const jobCount = document.getElementById('jobCount');
  const filterText = document.getElementById('listFilterInput').value.toLowerCase();
  const sortOrder = document.getElementById('listSortSelect').value;

  let filteredJobs = foundJobs.filter(job => {
    return (job.title.toLowerCase().includes(filterText) ||
            job.company.toLowerCase().includes(filterText) ||
            job.location.toLowerCase().includes(filterText));
  });

  filteredJobs.sort((a, b) => {
    return sortOrder === 'newest' ? b.foundAt - a.foundAt : a.foundAt - b.foundAt;
  });

  jobCount.textContent = filteredJobs.length;
  jobList.innerHTML = '';

  if (filteredJobs.length === 0) {
    jobList.innerHTML = `<div class="no-jobs">...</div>`; // Temp content
    jobList.querySelector('.no-jobs').innerHTML = `
      <div class="no-jobs-icon">📭</div>
      <p data-i18n="noJobsFound">${t('noJobsFound')}</p>
      <p style="font-size: 12px; color: #999;" data-i18n="noJobsHint">${t('noJobsHint')}</p>`;
    return;
  }

  filteredJobs.forEach((job) => {
    const jobItem = document.createElement('div');
    const isViewed = viewedJobIds.has(job.id);
    jobItem.className = `job-item ${isViewed ? 'viewed' : ''}`;
    
    const timeAgo = getTimeAgo(job.foundAt);
    const easyApplyBadge = job.isEasyApply ? `<span class="job-badge easy-apply-badge">${t('jobBadgeEasyApply')}</span>` : '';
    const newBadge = `<span class="job-badge new-badge">${t('jobBadgeNew', [timeAgo])}</span>`;

    jobItem.innerHTML = `
      <div class="job-header">
        <a href="${job.url}" target="_blank" class="job-title" data-job-id="${job.id}">${job.title}</a>
      </div>
      <div class="job-company">${job.company || t('jobCompanyUnknown')}</div>
      <div class="job-details">
        <div class="job-detail-item">📍 ${job.location || t('jobLocationUnknown')}</div>
        <div class="job-detail-item">⏰ ${job.postedTime || t('jobPostedTimeUnknown')}</div>
      </div>
      <div class="job-badges">${easyApplyBadge}${newBadge}</div>`;
    
    jobList.appendChild(jobItem);
  });

  jobList.querySelectorAll('.job-title').forEach(link => {
    link.addEventListener('click', (e) => {
      const jobId = e.target.dataset.jobId;
      if (jobId && !viewedJobIds.has(jobId)) {
        viewedJobIds.add(jobId);
        chrome.storage.local.set({ viewedJobIds: Array.from(viewedJobIds) });
        e.target.closest('.job-item').classList.add('viewed');
      }
    });
  });
}

function getTimeAgo(timestamp) {
  if (!timestamp) return t('timeAgoJustNow');
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 1000 / 60);
  if (minutes < 60) return t('timeAgoMinutes', [minutes.toString()]);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('timeAgoHours', [hours.toString()]);
  const days = Math.floor(hours / 24);
  return t('timeAgoDays', [days.toString()]);
}

function loadSettings() {
  chrome.storage.local.get(['filters', 'autoRefreshInterval'], (result) => {
    if (result.filters) {
      keywords = result.filters.keywords || [];
      document.getElementById('companyFilter').value = result.filters.company || '';
      document.getElementById('locationFilter').value = result.filters.location || '';
      document.getElementById('datePostedFilter').value = result.filters.datePosted || '24h';
      document.getElementById('easyApplyFilter').checked = result.filters.easyApply || false;
      updateKeywordList();
    }
    if (result.autoRefreshInterval !== undefined) {
      document.getElementById('autoRefreshInterval').value = result.autoRefreshInterval;
    }
  });
}

function loadFoundJobs() {
  chrome.storage.local.get(['foundJobs', 'hiddenJobIds', 'viewedJobIds'], (result) => {
    foundJobs = result.foundJobs || [];
    hiddenJobIds = new Set(result.hiddenJobIds || []);
    viewedJobIds = new Set(result.viewedJobIds || []);
    updateJobList();
  });
}

function addKeyword() {
  const input = document.getElementById('keywordInput');
  const keyword = input.value.trim();
  if (keyword && !keywords.includes(keyword)) {
    keywords.push(keyword);
    updateKeywordList();
    input.value = '';
  }
}

function updateKeywordList() {
  const listEl = document.getElementById('keywordList');
  listEl.innerHTML = '';
  keywords.forEach((keyword, index) => {
    const tag = document.createElement('div');
    tag.className = 'keyword-tag';
    tag.textContent = keyword;
    const removeBtn = document.createElement('button');
    removeBtn.textContent = '×';
    removeBtn.onclick = () => {
      keywords.splice(index, 1);
      updateKeywordList();
    };
    tag.appendChild(removeBtn);
    listEl.appendChild(tag);
  });
}

// --- 4. INITIALIZATION ---

document.addEventListener('DOMContentLoaded', () => {
  const langSelector = document.getElementById('lang-selector');
  const toggleBtn = document.getElementById('toggleBtn');
  const saveFiltersBtn = document.getElementById('saveFiltersBtn');
  const addKeywordBtn = document.getElementById('addKeywordBtn');
  const keywordInput = document.getElementById('keywordInput');
  const clearAllBtn = document.getElementById('clearAllBtn');
  const jobsTab = document.getElementById('jobsTab');
  const filtersTab = document.getElementById('filtersTab');
  const jobsContent = document.getElementById('jobsContent');
  const filtersContent = document.getElementById('filtersContent');
  const listFilterInput = document.getElementById('listFilterInput');
  const listSortSelect = document.getElementById('listSortSelect');

  langSelector.addEventListener('change', (e) => setLanguageAndRender(e.target.value));
  toggleBtn.addEventListener('click', handleToggle);
  saveFiltersBtn.addEventListener('click', saveFilters);
  addKeywordBtn.addEventListener('click', addKeyword);
  keywordInput.addEventListener('keypress', (e) => e.key === 'Enter' && addKeyword());
  clearAllBtn.addEventListener('click', clearAllJobs);
  listFilterInput.addEventListener('input', updateJobList);
  listSortSelect.addEventListener('change', updateJobList);
  
  jobsTab.addEventListener('click', () => {
    jobsTab.classList.add('active');
    filtersTab.classList.remove('active');
    jobsContent.classList.add('active');
    filtersContent.classList.remove('active');
  });
  
  filtersTab.addEventListener('click', () => {
    filtersTab.classList.add('active');
    jobsTab.classList.remove('active');
    filtersContent.classList.add('active');
    jobsContent.classList.remove('active');
  });

  chrome.storage.local.get('language', (result) => {
    const lang = result.language || (chrome.i18n.getUILanguage().startsWith('tr') ? 'tr' : 'en');
    langSelector.value = lang;
    setLanguageAndRender(lang).then(() => {
      loadSettings();
      loadFoundJobs();
    });
  });
});

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'jobsFound') {
    foundJobs = request.jobs || [];
    chrome.storage.local.set({ foundJobs: foundJobs }, () => {
      updateJobList();
    });
  }
});
