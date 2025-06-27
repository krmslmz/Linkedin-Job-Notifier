let isMonitoring = false;
let lastJobIds = new Set();
let foundJobsList = []; // Bulunan işleri sakla
let filters = {
  keywords: [],
  company: '',
  location: '',
  datePosted: '24h',
  easyApply: false
};
let autoRefreshInterval = 5; // Dakika cinsinden
let autoSearchEnabled = true; // Otomatik arama özelliği
let isInitialLoad = true; // İlk yükleme kontrolü
let lastAutoSearchTime = 0; // Service worker için global değişken
let activeTabsStatus = new Map(); // Aktif tab'ların durumunu takip et

// Chrome başladığında veya extension yüklendiğinde
chrome.runtime.onInstalled.addListener(() => {
  console.log('LinkedIn Job Alert extension installed');
  // Varsayılan ayarları kaydet
  chrome.storage.local.set({ 
    filters: filters, 
    autoRefreshInterval: autoRefreshInterval,
    autoSearchEnabled: autoSearchEnabled,
    foundJobs: [],
    hiddenJobIds: []
  });
  
  // Extension yüklendiğinde alarm'ları temizle ve yeniden oluştur
  setupAlarms();
});

// Extension başlatıldığında ayarları yükle
chrome.runtime.onStartup.addListener(() => {
  loadSettings();
  setupAlarms();
});

// Service worker uyanıp alarm'ları kontrol et
chrome.runtime.onSuspend.addListener(() => {
  console.log('Service worker suspending...');
});

// Alarm'ları kurmak için ayrı fonksiyon
function setupAlarms() {
  // Önce tüm alarm'ları temizle
  chrome.alarms.clearAll(() => {
    console.log('All alarms cleared');
    
    // Yeni alarm'ları oluştur
    chrome.alarms.create('checkJobs', { 
      delayInMinutes: 0.1, // Hemen başla
      periodInMinutes: 0.5 // 30 saniyede bir
    });
    
    chrome.alarms.create('autoRefresh', { 
      delayInMinutes: autoRefreshInterval, // İlk çalışma
      periodInMinutes: autoRefreshInterval // Periyodik çalışma
    });
    
    // Keepalive alarm'ı ekle - Service worker'ı uyanık tutar
    chrome.alarms.create('keepalive', {
      delayInMinutes: 0.1,
      periodInMinutes: 1 // Her dakika
    });
    
    console.log('Alarms set up successfully');
  });
}

// Ayarları yükleme fonksiyonu
function loadSettings() {
  chrome.storage.local.get(['filters', 'autoRefreshInterval', 'autoSearchEnabled', 'foundJobs'], (result) => {
    if (result.filters) {
      filters = result.filters;
      console.log('Filters loaded:', filters);
    }
    if (result.autoRefreshInterval) {
      autoRefreshInterval = result.autoRefreshInterval;
      console.log('Auto refresh interval:', autoRefreshInterval);
    }
    if (result.autoSearchEnabled !== undefined) {
      autoSearchEnabled = result.autoSearchEnabled;
      console.log('Auto search enabled:', autoSearchEnabled);
    }
    if (result.foundJobs) {
      foundJobsList = result.foundJobs;
      // ID'leri Set'e yükle
      lastJobIds = new Set(foundJobsList.map(job => job.id));
      console.log('Loaded jobs count:', foundJobsList.length);
    }
  });
}

// İlk yüklemede ayarları al ve alarm'ları kur
loadSettings();
setupAlarms();

chrome.alarms.onAlarm.addListener((alarm) => {
  console.log('🔔 Alarm triggered:', alarm.name, 'at', new Date().toLocaleTimeString());
  
  if (alarm.name === 'keepalive') {
    // Service worker'ı uyanık tut
    console.log('💓 Keepalive ping');
    return;
  }
  
  if (alarm.name === 'checkJobs' && isMonitoring) {
    console.log('🔍 Checking for new jobs...');
    checkForNewJobs();
  } else if (alarm.name === 'autoRefresh' && isMonitoring) {
    console.log('🔄 Auto refresh triggered...');
    console.log('📊 Current state:', {
      isMonitoring,
      autoSearchEnabled,
      hasKeywords: filters.keywords && filters.keywords.length > 0,
      keywords: filters.keywords,
      lastSearchTime: lastAutoSearchTime ? new Date(lastAutoSearchTime).toLocaleTimeString() : 'Never'
    });
    
    if (autoSearchEnabled && filters.keywords && filters.keywords.length > 0) {
      console.log('✅ Conditions met, performing auto search...');
      performAutoSearch();
    } else {
      console.log('❌ Conditions not met for auto search');
      console.log('   - autoSearchEnabled:', autoSearchEnabled);
      console.log('   - has keywords:', filters.keywords && filters.keywords.length > 0);
      console.log('   - keywords:', filters.keywords);
      
      // Alternatif: Sadece sayfayı yenile
      console.log('🔄 Performing simple page refresh instead...');
      autoRefreshLinkedIn();
    }
  }
});

// Content script'i güvenli şekilde inject etme fonksiyonu
async function injectContentScript(tabId) {
  try {
    // chrome.scripting API'sinin mevcut olup olmadığını kontrol et
    if (!chrome.scripting) {
      console.error('❌ chrome.scripting API kullanılamıyor');
      return false;
    }

    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    });
    
    console.log('✅ Content script successfully injected');
    return true;
  } catch (error) {
    console.error('❌ Content script injection failed:', error);
    return false;
  }
}

// Güvenli mesaj gönderme fonksiyonu
function sendMessageToTab(tabId, message, retryCount = 0) {
  return new Promise((resolve, reject) => {
    // Önce tab'ın mevcut olup olmadığını kontrol et
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        console.log(`Tab ${tabId} mevcut değil:`, chrome.runtime.lastError.message);
        reject(new Error('Tab not found'));
        return;
      }
      
      // Tab mevcut, mesaj gönder
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          console.log(`Mesaj gönderme hatası (deneme ${retryCount + 1}):`, chrome.runtime.lastError.message);
          
          // Eğer content script yüklü değilse ve retry sayısı 2'den azsa tekrar dene
          if (retryCount < 2 && chrome.runtime.lastError.message.includes('Receiving end does not exist')) {
            console.log('🔄 Content script yeniden yüklenmeye çalışılıyor...');
            
            injectContentScript(tabId).then((success) => {
              if (success) {
                // 3 saniye bekle ve tekrar dene
                setTimeout(() => {
                  sendMessageToTab(tabId, message, retryCount + 1)
                    .then(resolve)
                    .catch(reject);
                }, 3000);
              } else {
                reject(new Error('Content script injection failed'));
              }
            }).catch(reject);
          } else {
            reject(new Error(chrome.runtime.lastError.message));
          }
        } else {
          resolve(response);
        }
      });
    });
  });
}

// Otomatik arama yap
function performAutoSearch() {
  console.log('🚀 performAutoSearch() called at', new Date().toLocaleTimeString());
  
  // Çok sık arama yapmasını önle
  const now = Date.now();
  if (lastAutoSearchTime && (now - lastAutoSearchTime < 120000)) { // 2 dakika
    const timeSinceLastSearch = Math.round((now - lastAutoSearchTime) / 1000);
    console.log(`⚠️ Son arama ${timeSinceLastSearch} saniye önce yapıldı, 2 dakika bekleniyor...`);
    return;
  }
  
  console.log('✅ Arama koşulları sağlandı, LinkedIn sekmesi aranıyor...');
  lastAutoSearchTime = now;
  
  chrome.tabs.query({ url: 'https://www.linkedin.com/jobs/*' }, (tabs) => {
    console.log('🔍 LinkedIn sekmeleri:', tabs.length);
    
    if (tabs.length === 0) {
      console.log('❌ LinkedIn sekmesi bulunamadı');
      return;
    }
    
    const tab = tabs[0]; // İlk LinkedIn sekmesini kullan
    console.log('📋 Aktif sekme:', tab.id, tab.url);
    console.log('🎯 Arama kriterleri:', filters);
    
    // Güvenli mesaj gönderme kullan
    const searchMessage = {
      action: 'performSearch',
      keywords: filters.keywords,
      location: filters.location,
      datePosted: filters.datePosted,
      easyApply: filters.easyApply
    };

    sendMessageToTab(tab.id, searchMessage)
      .then((response) => {
        if (response && response.success) {
          console.log('✅ Arama başarıyla başlatıldı:', response.message);
          
          // Kullanıcıya bilgi ver
          let searchInfo = `🔍 "${filters.keywords.join(', ')}" için arama yapılıyor`;
          if (filters.easyApply) {
            searchInfo += '\n⚡ Easy Apply filtresi aktif';
          }
          if (filters.datePosted) {
          const dateKey = `datePosted${filters.datePosted.charAt(0).toUpperCase() + filters.datePosted.slice(1)}`;
          const dateText = chrome.i18n.getMessage(dateKey) || filters.datePosted;
          searchInfo += `\n📅 ${dateText}`;
        }
        
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon128.png',
          title: '🔍 ' + chrome.i18n.getMessage('filtersTitle'),
          message: searchInfo,
          priority: 1,
          silent: true
        });
        } else {
          console.log('⚠️ Arama response:', response);
        }
      })
      .catch((error) => {
        console.error('❌ Arama mesajı gönderilemedi:', error.message || error);
      });
  });
}

// LinkedIn sayfasını otomatik yenile
function autoRefreshLinkedIn() {
  chrome.tabs.query({ url: 'https://www.linkedin.com/jobs/*' }, (tabs) => {
    tabs.forEach(tab => {
      console.log('Auto refreshing LinkedIn tab:', tab.id);
      // Sayfayı yenile
      chrome.tabs.reload(tab.id, { bypassCache: false }, () => {
        // Yenileme sonrası 5 saniye bekle ve kontrol et
        setTimeout(() => {
          sendMessageToTab(tab.id, { action: 'getAllJobs' })
            .catch(err => console.log('Tab mesajı gönderilemedi:', err));
        }, 5000);
      });
      
      // Kullanıcıya bilgi ver
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon128.png',
        title: '🔄 ' + chrome.i18n.getMessage('autoRefreshLabel'),
        message: chrome.i18n.getMessage('extDescription'),
        priority: 1,
        silent: true
      });
    });
  });
}

// Content script'ten gelen mesajları dinle
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'newJobsDetected') {
    console.log('Jobs received:', request.jobs.length);
    const filteredJobs = filterJobs(request.jobs);
    console.log('Filtered jobs:', filteredJobs.length);
    
    let newJobs = [];
    let updatedJobs = false;
    
    // İlk yükleme ise tüm filtrelenmiş işleri ekle
    if (isInitialLoad && isMonitoring && filteredJobs.length > 0) {
      console.log('İlk yükleme - tüm uygun ilanlar ekleniyor:', filteredJobs.length);
      
      filteredJobs.forEach(job => {
        if (!lastJobIds.has(job.id)) {
          job.foundAt = Date.now();
          foundJobsList.unshift(job);
          lastJobIds.add(job.id);
          updatedJobs = true;
        }
      });
      
      isInitialLoad = false;
      
      // İlk yüklemede bildirim gönderme (çok fazla bildirim olmasın)
      if (foundJobsList.length > 0) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon128.png',
          title: '📋 ' + chrome.i18n.getMessage('tabJobs'),
          message: chrome.i18n.getMessage('notificationTitle', [foundJobsList.length.toString()]),
          priority: 1,
          silent: true
        });
      }
    } else {
      // Normal çalışma - sadece yeni ilanları ekle (bildirim YOK)
      filteredJobs.forEach(job => {
        if (!lastJobIds.has(job.id)) {
          job.foundAt = Date.now();
          newJobs.push(job);
          lastJobIds.add(job.id);
          foundJobsList.unshift(job);
          updatedJobs = true;
        }
      });
      
      // Yeni ilanlar varsa sadece log'a yaz, bildirim gönderme
      if (newJobs.length > 0) {
        console.log(`✅ ${newJobs.length} yeni ilan sessizce listeye eklendi`);
      }
    }
    
    // Değişiklik olduysa storage'a kaydet ve popup'ı güncelle
    if (updatedJobs) {
      chrome.storage.local.set({ foundJobs: foundJobsList }, () => {
        console.log('Jobs saved to storage:', foundJobsList.length);
        // Popup'a haber ver
        chrome.runtime.sendMessage({ 
          action: 'jobsFound', 
          jobs: foundJobsList 
        }).catch(err => console.log('Popup mesajı gönderilemedi:', err));
      });
    }
    
    sendResponse({ processed: filteredJobs.length, new: newJobs.length });
    
  } else if (request.action === 'toggleMonitoring') {
    isMonitoring = !isMonitoring;
    
    if (isMonitoring) {
      // İzleme başladığında ilk yükleme flag'ini set et
      isInitialLoad = true;
      console.log('Monitoring started - initial load flag set');
      
      // Alarm'ları yeniden kur
      setupAlarms();
      
      // Otomatik yenileme alarmını güncelle
      updateAutoRefreshAlarm();
      
      // Eğer otomatik arama açıksa ve kriterler varsa hemen ara
      if (autoSearchEnabled && filters.keywords && filters.keywords.length > 0) {
        setTimeout(() => performAutoSearch(), 2000);
      } else {
        // Otomatik arama kapalıysa mevcut sayfayı kontrol et
        setTimeout(() => {
          chrome.tabs.query({ url: 'https://www.linkedin.com/jobs/*' }, (tabs) => {
            if (tabs.length > 0) {
              sendMessageToTab(tabs[0].id, { action: 'getAllJobs' })
                .catch(err => console.log('İlk kontrol mesajı gönderilemedi:', err));
            }
          });
        }, 1000);
      }
    } else {
      console.log('Monitoring stopped');
      // Monitoring durdurulduğunda alarm'ları temizle (keepalive hariç)
      chrome.alarms.clear('checkJobs');
      chrome.alarms.clear('autoRefresh');
    }
    
    sendResponse({ isMonitoring });
    return true;
    
  } else if (request.action === 'getStatus') {
    sendResponse({ isMonitoring, autoRefreshInterval, autoSearchEnabled });
    return true;
    
  } else if (request.action === 'updateFilters') {
    filters = request.filters;
    // Filtreler değiştiğinde ilk yükleme flag'ini set et
    if (isMonitoring) {
      isInitialLoad = true;
    }
    chrome.storage.local.set({ filters }, () => {
      console.log('Filters updated:', filters);
    });
    sendResponse({ success: true });
    return true;
    
  } else if (request.action === 'updateAutoRefresh') {
    autoRefreshInterval = request.interval;
    chrome.storage.local.set({ autoRefreshInterval }, () => {
      updateAutoRefreshAlarm();
      console.log('Auto refresh interval updated:', autoRefreshInterval);
    });
    sendResponse({ success: true });
    return true;
    
  } else if (request.action === 'toggleAutoSearch') {
    autoSearchEnabled = request.enabled;
    chrome.storage.local.set({ autoSearchEnabled }, () => {
      console.log('Auto search enabled:', autoSearchEnabled);
    });
    sendResponse({ success: true });
    return true;
    
  } else if (request.action === 'requestAutoSearch') {
    // Content script otomatik arama istediğinde
    console.log('🎯 Manual auto search requested');
    if (isMonitoring && autoSearchEnabled) {
      performAutoSearch();
    } else {
      console.log('❌ Cannot perform auto search:', {
        isMonitoring,
        autoSearchEnabled
      });
    }
  } else if (request.action === 'manualSearch') {
    // Manuel arama testi için
    console.log('🧪 Manual search test requested');
    performAutoSearch();
    sendResponse({ success: true });
    return true;
  } else if (request.action === 'heartbeat') {
    // Content script'ten gelen heartbeat
    const tabId = sender.tab ? sender.tab.id : 'unknown';
    activeTabsStatus.set(tabId, {
      timestamp: Date.now(),
      url: request.url || 'unknown'
    });
    console.log('💓 Heartbeat alındı tab:', tabId);
    sendResponse({ success: true });
    return true;
  }
});

// Otomatik yenileme alarmını güncelle
function updateAutoRefreshAlarm() {
  console.log('Updating auto refresh alarm...');
  chrome.alarms.clear('autoRefresh', () => {
    if (autoRefreshInterval > 0 && isMonitoring) {
      chrome.alarms.create('autoRefresh', { 
        delayInMinutes: 0.1, // Hemen başla
        periodInMinutes: autoRefreshInterval
      });
      console.log('Auto refresh alarm set for', autoRefreshInterval, 'minutes');
    } else {
      console.log('Auto refresh alarm disabled');
    }
  });
}

// Extension aktif tutma fonksiyonu
function keepExtensionAlive() {
  // Service worker için setInterval kullanma, alarm kullan
  console.log('⚡ Extension keepalive initialized');
}

// Extension'ı aktif tut
keepExtensionAlive();

// İlanları filtrele
function filterJobs(jobs) {
  if (!jobs || !Array.isArray(jobs)) {
    console.log('Invalid jobs array:', jobs);
    return [];
  }
  
  console.log('Filtering jobs with criteria:', filters);
  
  const filtered = jobs.filter(job => {
    // Easy Apply filtresi
    if (filters.easyApply && !job.isEasyApply) {
      return false;
    }
    
    // Şirket filtresi kontrolü
    if (filters.company) {
      const companyLower = job.company.toLowerCase();
      const filterCompanies = filters.company.toLowerCase().split(',').map(c => c.trim());
      const hasCompany = filterCompanies.some(company => 
        companyLower.includes(company)
      );
      if (!hasCompany) return false;
    }
    
    // Konum kontrolü (eğer arama sırasında uygulanmadıysa)
    if (filters.location && !autoSearchEnabled) {
      const locationLower = job.location.toLowerCase();
      const filterLocations = filters.location.toLowerCase().split(',').map(l => l.trim());
      const hasLocation = filterLocations.some(location => 
        locationLower.includes(location)
      );
      if (!hasLocation) return false;
    }
    
    return true;
  });
  
  console.log('Jobs after filtering:', filtered.length);
  return filtered;
}

function sendNotification(newJobs) {
  const title = chrome.i18n.getMessage('notificationTitle', [newJobs.length.toString()]);
  let message = '';
  
  if (newJobs.length === 1) {
    const job = newJobs[0];
    message = `${job.title}\n${job.company} - ${job.location}`;
    if (job.isEasyApply) {
      message += '\n' + chrome.i18n.getMessage('jobBadgeEasyApply');
    }
  } else {
    message = newJobs.slice(0, 3).map(job => {
      let jobText = `• ${job.title} (${job.company})`;
      if (job.isEasyApply) {
        jobText += ' ' + chrome.i18n.getMessage('jobBadgeEasyApply');
      }
      return jobText;
    }).join('\n');
    
    if (newJobs.length > 3) {
      message += `\n+ ${newJobs.length - 3} ...`;
    }
  }
  
  // Tıklanabilir bildirim
  chrome.notifications.create('job-notification', {
    type: 'basic',
    iconUrl: 'icon128.png',
    title: title,
    message: message,
    priority: 2,
    requireInteraction: true,
    buttons: [
      { title: chrome.i18n.getMessage('notificationButton') }
    ]
  });
  
  // Ses çal
  playNotificationSound();
}

// Bildirime tıklama
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (notificationId === 'job-notification' && buttonIndex === 0) {
    // Popup'ı aç
    chrome.action.openPopup();
  }
});

function playNotificationSound() {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs[0]) {
      sendMessageToTab(tabs[0].id, {action: 'playSound'})
        .catch(err => console.log('Ses çalınamadı:', err));
    }
  });
}

function checkForNewJobs() {
  chrome.tabs.query({ url: 'https://www.linkedin.com/jobs/*' }, (tabs) => {
    if (tabs.length === 0) {
      console.log('LinkedIn sekmesi bulunamadı');
      return;
    }
    
    tabs.forEach(tab => {
      // Önce tab'ın geçerli olup olmadığını kontrol et
      chrome.tabs.get(tab.id, (tabInfo) => {
        if (chrome.runtime.lastError) {
          console.log(`Tab ${tab.id} artık mevcut değil`);
          activeTabsStatus.delete(tab.id);
          return;
        }
        
        // Ping-pong test et önce
        sendMessageToTab(tab.id, { action: 'ping' })
          .then((response) => {
            if (response && response.success) {
              // Content script aktif, jobs talep et
              console.log('✅ Tab aktif, jobs talep ediliyor:', tab.id);
              return sendMessageToTab(tab.id, { action: 'getAllJobs' });
            }
          })
          .then((response) => {
            if (response) {
              console.log('Content script response:', response);
            }
          })
          .catch((error) => {
            console.log('Tab mesajı gönderilemedi:', error.message);
            // Tab aktif değil, kayıtlardan çıkar
            activeTabsStatus.delete(tab.id);
          });
      });
    });
  });
}

// Aktif tab'ları temizleme fonksiyonu
function cleanupInactiveTabs() {
  const now = Date.now();
  const inactiveThreshold = 120000; // 2 dakika
  
  activeTabsStatus.forEach((status, tabId) => {
    if (now - status.timestamp > inactiveThreshold) {
      console.log('🧹 Inactive tab temizleniyor:', tabId);
      activeTabsStatus.delete(tabId);
    }
  });
}

// Her 2 dakikada bir inactive tab'ları temizle
setInterval(cleanupInactiveTabs, 120000);

// Tab güncellendiğinde content script'i yeniden yükle
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && 
      tab.url && 
      tab.url.includes('linkedin.com/jobs') && 
      isMonitoring) {
    
    console.log('LinkedIn tab yenilendi, content script yükleniyor...');
    
    // 2 saniye bekle, sayfa tam yüklensin
    setTimeout(() => {
      injectContentScript(tabId).then((success) => {
        if (success) {
          console.log('Content script tab güncellemesi sonrası yüklendi');
          // Script yüklendikten sonra işleri kontrol et
          setTimeout(() => {
            sendMessageToTab(tabId, { action: 'getAllJobs' })
              .catch(err => console.log('Tab güncelleme sonrası mesaj gönderilemedi:', err));
          }, 2000);
        }
      });
    }, 2000);
  }
});
