// Content script için güvenlik kontrolü - Birden fazla yüklenmesini önle
(function() {
  'use strict';
  
  if (window.linkedinJobMonitorLoaded) {
    console.log('⚠️ Content script zaten yüklü, yeniden yüklenmesi engelleniyor');
    return;
  }
  window.linkedinJobMonitorLoaded = true;

console.log('🚀 LinkedIn Job Monitor Content Script başlatıldı');

// LinkedIn'deki tüm iş ilanlarını topla - Güncellenmiş versiyon
function getAllJobs() {
  const jobs = [];
  
  console.log('🔍 İş ilanları aranıyor...');
  
  // LinkedIn'in güncel yapısına göre seçiciler
  const jobSelectors = [
    // Yeni LinkedIn yapısı (2025)
    'a.job-card-job-posting-card-wrapper__card-link',
    '.job-card-job-posting-card-wrapper',
    // Eski yapılar
    '.jobs-search-results__list-item',
    '.job-card-container',
    '.job-card-list__entity-lockup',
    '.scaffold-layout__list-container li',
    // Alternatif yapılar
    '[data-job-id]',
    '.job-search-card',
    '.jobs-search-results li',
    '.job-card',
    // Genel li elementleri (job listelerinde)
    '.jobs-search__results-list li',
    'li[data-occludable-job-id]',
    'li[data-job-id]'
  ];
  
  let foundCards = [];
  
  // Her seçiciyi dene
  for (const selector of jobSelectors) {
    const cards = document.querySelectorAll(selector);
    if (cards.length > 0) {
      console.log(`✅ ${selector} ile ${cards.length} kart bulundu`);
      foundCards = Array.from(cards);
      break; // İlk başarılı seçiciyi kullan
    }
  }
  
  // Hiç kart bulunamadıysa alternatif yöntem
  if (foundCards.length === 0) {
    console.log('⚠️ Hiç iş kartı bulunamadı, alternatif yöntem deneniyor...');
    
    // Sayfa içindeki tüm linkleri kontrol et
    const allLinks = document.querySelectorAll('a[href*="/jobs/view/"]');
    allLinks.forEach(link => {
      const container = link.closest('li, .job-card, [data-job-id], div[class*="job"]');
      if (container && !foundCards.includes(container)) {
        foundCards.push(container);
      }
    });
    
    console.log(`🔄 Alternatif yöntemle ${foundCards.length} kart bulundu`);
  }
  
  if (foundCards.length === 0) {
    console.log('❌ Hiç iş ilanı bulunamadı. Sayfa yapısı değişmiş olabilir.');
    
    // Debug için sayfa yapısını kontrol et
    const possibleContainers = document.querySelectorAll('li, [class*="job"], [data-job]');
    console.log('🔍 Sayfada bulunan potansiyel konteynerler:', possibleContainers.length);
    
    return [];
  }
  
  foundCards.forEach((card, index) => {
    try {
      console.log(`📝 Kart ${index + 1} işleniyor...`);
      
      // İş başlığı - Güncel LinkedIn yapısı için
      const titleSelectors = [
        // Yeni yapı (2025)
        '.artdeco-entity-lockup__title strong',
        '.job-card-job-posting-card-wrapper__title strong',
        '.artdeco-entity-lockup__title',
        '.job-card-job-posting-card-wrapper__title',
        // Eski yapılar
        '.job-card-list__title a',
        '.job-card-container__link',
        '.job-card-container__job-title',
        '[data-test-job-title]',
        'a[href*="/jobs/view/"]',
        '.job-card-list__title',
        '.base-search-card__title a',
        'h3 a', 'h4 a',
        '.job-title a',
        '.sr-only + a' // Bazen başlık sr-only'den sonra gelir
      ];
      
      let titleEl = null;
      let titleText = '';
      
      for (const selector of titleSelectors) {
        titleEl = card.querySelector(selector);
        if (titleEl) {
          titleText = titleEl.textContent.trim();
          if (titleText.length > 0) {
            console.log(`✅ Başlık bulundu: "${titleText}" (${selector})`);
            break;
          }
        }
      }
      
      // Şirket adı - Güncel LinkedIn yapısı için
      const companySelectors = [
        // Yeni yapı (2025)
        '.artdeco-entity-lockup__subtitle',
        '.artdeco-entity-lockup__subtitle div',
        // Eski yapılar
        '.job-card-container__company-name',
        '.job-card-container__primary-description',
        '.job-card-list__company-name',
        '[data-test-job-company-name]',
        '.base-search-card__subtitle a',
        '.job-card-container__company',
        'a[href*="/company/"]',
        '.company-name'
      ];
      
      let companyEl = null;
      let companyText = '';
      
      for (const selector of companySelectors) {
        companyEl = card.querySelector(selector);
        if (companyEl) {
          companyText = companyEl.textContent.trim();
          if (companyText.length > 0) {
            console.log(`✅ Şirket bulundu: "${companyText}" (${selector})`);
            break;
          }
        }
      }
      
      // Konum - Güncel LinkedIn yapısı için
      const locationSelectors = [
        // Yeni yapı (2025)
        '.artdeco-entity-lockup__caption',
        '.artdeco-entity-lockup__caption div',
        // Eski yapılar
        '.job-card-container__metadata-item',
        '.job-card-list__location',
        '[data-test-job-location]',
        '.job-card-container__metadata .tvm__text',
        '.base-search-card__metadata .tvm__text'
      ];
      
      let locationEl = null;
      let locationText = '';
      
      for (const selector of locationSelectors) {
        locationEl = card.querySelector(selector);
        if (locationEl) {
          locationText = locationEl.textContent.trim();
          if (locationText.length > 0 && !locationText.includes('ago') && !locationText.includes('önce')) {
            console.log(`✅ Konum bulundu: "${locationText}" (${selector})`);
            break;
          }
        }
      }
      
      // İlan zamanı
      const timeSelectors = [
        'time',
        '.job-card-container__listed-status',
        '.job-card-list__listed-date',
        '.tvm__text:last-child'
      ];
      
      let timeEl = null;
      let timeText = '';
      
      for (const selector of timeSelectors) {
        timeEl = card.querySelector(selector);
        if (timeEl) {
          timeText = timeEl.textContent.trim();
          if (timeText.includes('ago') || timeText.includes('önce') || timeText.includes('hour') || timeText.includes('day')) {
            break;
          }
        }
      }
      
      // Easy Apply kontrolü - Güncel LinkedIn yapısı için
      let isEasyApply = false;
      
      // 1. Direkt class/attribute kontrolü
      const easyApplySelectors = [
        // Yeni yapı (2025)
        '.job-card-job-posting-card-wrapper__footer-item',
        // Eski yapılar
        '.job-card-container__easy-apply-label',
        '[aria-label*="Easy Apply"]',
        '.job-card-list__easy-apply-label',
        '.job-card-container__apply-link[aria-label*="Easy Apply"]',
        '[data-test-easy-apply]'
      ];
      
      for (const selector of easyApplySelectors) {
        const element = card.querySelector(selector);
        if (element) {
          const text = element.textContent.toLowerCase();
          // "Applied" durumunu da kontrol et (zaten başvurulmuş)
          if (text.includes('easy apply') || text.includes('kolay başvuru') || 
              text.includes('applied') || text.includes('başvuruldu')) {
            isEasyApply = true;
            break;
          }
        }
      }
      
      // 2. Text içeriği kontrolü
      if (!isEasyApply) {
        const allText = card.textContent.toLowerCase();
        if (allText.includes('easy apply') || allText.includes('kolay başvuru')) {
          isEasyApply = true;
        }
      }
      
      // 3. Button text kontrolü
      if (!isEasyApply) {
        const buttons = card.querySelectorAll('button, a');
        buttons.forEach(btn => {
          const btnText = btn.textContent.toLowerCase();
          if (btnText.includes('easy apply') || btnText.includes('kolay başvuru')) {
            isEasyApply = true;
          }
        });
      }
      
      // Link bulma - Güncel LinkedIn yapısı için
      let jobUrl = '';
      let jobId = '';
      
      // Önce link elementi olup olmadığını kontrol et (a tag'i)
      if (card.tagName === 'A') {
        jobUrl = card.href;
      } else if (titleEl && titleEl.href) {
        jobUrl = titleEl.href;
      } else {
        // Alternatif link arama
        const linkEl = card.querySelector('a[href*="/jobs/view/"], a.job-card-job-posting-card-wrapper__card-link');
        if (linkEl) {
          jobUrl = linkEl.href;
        }
      }
      
      // Job ID çıkarma - currentJobId parametresinden de al
      if (jobUrl) {
        // Önce currentJobId parametresini kontrol et
        const currentJobMatch = jobUrl.match(/[?&]currentJobId=(\d+)/);
        if (currentJobMatch) {
          jobId = currentJobMatch[1];
        } else {
          // Standart URL'den al
          const idMatch = jobUrl.match(/\/jobs\/view\/(\d+)/);
          if (idMatch) {
            jobId = idMatch[1];
          }
        }
      }
      
      // Job ID yoksa data attribute'lerden al
      if (!jobId) {
        jobId = card.getAttribute('data-job-id') || 
               card.getAttribute('data-occludable-job-id') || 
               card.getAttribute('data-entity-urn')?.split(':').pop() ||
               Date.now().toString() + Math.random().toString(36).substr(2, 9);
      }
      
      // Minimum gereksinimler kontrolü
      if (titleText && jobUrl && jobId) {
        const job = {
          id: jobId,
          title: titleText,
          company: companyText || 'Şirket belirtilmemiş',
          location: locationText || 'Konum belirtilmemiş',
          url: jobUrl,
          postedTime: timeText || '',
          isEasyApply: isEasyApply
        };
        
        console.log(`✅ İş eklendi:`, job);
        jobs.push(job);
      } else {
        console.log(`⚠️ Eksik bilgi:`, {
          title: titleText,
          url: jobUrl,
          id: jobId
        });
      }
    } catch (error) {
      console.error('❌ İş ilanı çıkarma hatası:', error);
    }
  });
  
  console.log(`🎉 Toplam ${jobs.length} iş ilanı bulundu`);
  return jobs;
}

// Anahtar kelimeleri rastgele sırala
function shuffleKeywords(keywords) {
  const shuffled = [...keywords];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Rastgele varyasyonlar oluştur
function createSearchVariation(keywords) {
  if (!keywords || keywords.length === 0) return '';
  
  // Tek kelime varsa farklı varyasyonlar ekle
  if (keywords.length === 1) {
    const baseKeyword = keywords[0];
    const variations = [
      `${baseKeyword} developer`,
      `${baseKeyword} engineer`,
      `${baseKeyword} programming`,
      `${baseKeyword} software`,
      `senior ${baseKeyword}`,
      `${baseKeyword} specialist`
    ];
    
    // Rastgele bir varyasyon seç
    const randomVariation = variations[Math.floor(Math.random() * variations.length)];
    console.log(`🎲 Tek kelime için varyasyon: "${baseKeyword}" → "${randomVariation}"`);
    return randomVariation;
  }
  
  // Çoklu kelimeler için rastgele sırala
  const shuffled = shuffleKeywords(keywords);
  const connectors = [' OR ', ' | ', ' AND '];
  const randomConnector = connectors[Math.floor(Math.random() * connectors.length)];
  
  console.log(`🎲 Rastgele sıralama: [${keywords.join(', ')}] → [${shuffled.join(', ')}]`);
  console.log(`🔗 Kullanılan bağlaç: "${randomConnector}"`);
  
  return shuffled.join(randomConnector);
}

// Otomatik arama yapma fonksiyonu - Rastgele varyasyonlu versiyon
function performAutoSearch(originalSearchTerms) {
  console.log('🔍 Otomatik arama başlatılıyor (orijinal):', originalSearchTerms);
  
  // Keywords array'ini al
  const keywordsArray = originalSearchTerms.split(' OR ').map(k => k.trim());
  
  // Tek kelime ise sayfa yenile, çoklu ise rastgele sırala
  if (keywordsArray.length === 1) {
    console.log('🔄 Tek kelime tespit edildi, sayfa yenileniyor...');
    
    // Geçerli URL'yi temizle
    const baseUrl = 'https://www.linkedin.com/jobs/search/';
    window.location.href = baseUrl;
    
    // Storage'a yenileme bilgisi kaydet
    chrome.storage.local.set({
      pendingSearchTerms: originalSearchTerms,
      pendingSearchTime: Date.now()
    });
    
    return true;
  }
  
  // Çoklu kelime - rastgele varyasyon oluştur
  const searchVariation = createSearchVariation(keywordsArray);
  console.log('🎯 Kullanılacak arama terimi:', searchVariation);
  
  // Sonsuz döngüyü önlemek için flag kontrol et
  if (window.searchInProgress) {
    console.log('⚠️ Arama zaten devam ediyor, atlanıyor...');
    return false;
  }
  
  window.searchInProgress = true;
  
  // 30 saniye sonra flag'i temizle (güvenlik için)
  setTimeout(() => {
    window.searchInProgress = false;
  }, 30000);
  
  // LinkedIn arama inputunu bul
  const searchSelectors = [
    'input[aria-label*="Search by title"]',
    'input[placeholder*="Search by title"]',
    'input.jobs-search-box__text-input',
    'input[role="combobox"][id*="jobs-search"]',
    'input[name="keywords"]',
    '.jobs-search-box input[type="text"]'
  ];
  
  let searchInput = null;
  
  for (const selector of searchSelectors) {
    searchInput = document.querySelector(selector);
    if (searchInput) {
      console.log(`✅ Arama kutusu bulundu: ${selector}`);
      break;
    }
  }
  
  if (!searchInput) {
    console.error('❌ Arama kutusu bulunamadı');
    window.searchInProgress = false;
    return false;
  }
  
  // Input'u tamamen temizle
  searchInput.value = '';
  searchInput.focus();
  
  // Select all + delete (tamamen temizlemek için)
  setTimeout(() => {
    searchInput.select();
    document.execCommand('delete');
    
    setTimeout(() => {
      // Yeni rastgele terimi yaz
      searchInput.value = searchVariation;
      
      // Input event'lerini tetikle
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      searchInput.dispatchEvent(new Event('change', { bubbles: true }));
      searchInput.dispatchEvent(new Event('keyup', { bubbles: true }));
      
      console.log('📝 Rastgele arama metni yazıldı:', searchVariation);
      
      // Enter'a bas
      setTimeout(() => {
        const enterEvent = new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true
        });
        
        searchInput.dispatchEvent(enterEvent);
        console.log('⌨️ Enter tuşu gönderildi');
        
        // Alternatif: Form submit
        const form = searchInput.closest('form');
        if (form) {
          setTimeout(() => {
            console.log('📤 Form submit yedek tetikleniyor...');
            form.submit();
          }, 1000);
        }
        
        // Arama başarısını kontrol et
        setTimeout(() => {
          const newUrl = window.location.href;
          const hasKeywords = newUrl.includes('keywords') || newUrl.toLowerCase().includes(encodeURIComponent(searchVariation.toLowerCase()));
          
          if (hasKeywords) {
            console.log('✅ Rastgele arama başarılı - URL değişti');
          } else {
            console.log('⚠️ URL değişmedi, search butonuna tıklanıyor...');
            
            // Search butonunu bul ve tıkla
            const searchButton = document.querySelector(
              'button[aria-label*="Search"], ' +
              'button[type="submit"], ' +
              '.jobs-search-box__submit-button'
            );
            
            if (searchButton) {
              console.log('🔘 Search butonuna tıklanıyor...');
              searchButton.click();
            }
          }
          
          // Flag'i temizle
          setTimeout(() => {
            window.searchInProgress = false;
          }, 3000);
          
        }, 3000);
        
      }, 1500);
    }, 500);
  }, 500);
  
  return true;
}

// Konum filtresini ayarla
function setLocationFilter(location) {
  console.log('📍 Konum filtresi ayarlanıyor:', location);
  
  // Konum butonunu bul ve tıkla
  const locationButton = document.querySelector(
    'button[aria-label*="City, state, or zip code"], ' +
    'button[aria-label*="Location"], ' +
    '.search-reusables__filter-binary-toggle button'
  );
  
  if (locationButton) {
    locationButton.click();
    
    setTimeout(() => {
      // Konum inputunu bul
      const locationInput = document.querySelector(
        'input[aria-label*="City, state, or zip code"], ' +
        'input[placeholder*="City, state, or zip code"], ' +
        'input#jobs-search-box-location-id'
      );
      
      if (locationInput) {
        locationInput.value = '';
        locationInput.focus();
        locationInput.value = location;
        locationInput.dispatchEvent(new Event('input', { bubbles: true }));
        
        // Dropdown'dan ilk sonucu seç
        setTimeout(() => {
          const firstOption = document.querySelector(
            '.basic-typeahead__triggered-content li:first-child'
          );
          if (firstOption) {
            firstOption.click();
          }
        }, 1000);
      }
    }, 500);
  }
}

// Date Posted filtresini ayarla
function setDatePostedFilter(dateFilter) {
  console.log('📅 Tarih filtresi ayarlanıyor:', dateFilter);
  
  // Date posted dropdown butonunu bul
  const datePostedBtn = document.querySelector(
    'button[aria-label*="Date posted"], ' +
    'button[aria-label*="Date Posted"], ' +
    'button[id*="searchFilter_timePostedRange"]'
  );
  
  if (datePostedBtn) {
    datePostedBtn.click();
    
    setTimeout(() => {
      // Dropdown içindeki radio butonları bul
      let dateOption;
      
      switch(dateFilter) {
        case '24h':
          // Past 24 hours seçeneğini bul
          const labels = document.querySelectorAll('label');
          labels.forEach(label => {
            if (label.textContent && label.textContent.includes('Past 24 hours')) {
              dateOption = label;
            }
          });
          break;
        case 'week':
          // Past week seçeneğini bul
          const weekLabels = document.querySelectorAll('label');
          weekLabels.forEach(label => {
            if (label.textContent && label.textContent.includes('Past week')) {
              dateOption = label;
            }
          });
          break;
        case 'month':
          // Past month seçeneğini bul
          const monthLabels = document.querySelectorAll('label');
          monthLabels.forEach(label => {
            if (label.textContent && label.textContent.includes('Past month')) {
              dateOption = label;
            }
          });
          break;
      }
      
      if (dateOption) {
        // Radio button'ı seç
        const radioInput = dateOption.querySelector('input[type="radio"]');
        if (radioInput) {
          radioInput.click();
        } else {
          dateOption.click();
        }
        
        // Show results butonuna tıkla
        setTimeout(() => {
          const showResultsBtn = document.querySelector(
            'button[aria-label*="Show results"], ' +
            'button[aria-label*="Apply filters"]'
          );
          
          if (!showResultsBtn) {
            // Text ile ara
            const buttons = document.querySelectorAll('button');
            buttons.forEach(btn => {
              if (btn.textContent && btn.textContent.includes('Show results')) {
                btn.click();
              }
            });
          } else {
            showResultsBtn.click();
          }
        }, 300);
      }
    }, 500);
  }
}

// Easy Apply filtresini ayarla
function setEasyApplyFilter(onlyEasyApply) {
  if (!onlyEasyApply) return;
  
  console.log('⚡ Easy Apply filtresi ayarlanıyor');
  
  // All filters butonunu bul
  let allFiltersBtn = document.querySelector('button[aria-label="Show all filters"]');
  
  if (!allFiltersBtn) {
    const buttons = document.querySelectorAll('button');
    buttons.forEach(button => {
      if (button.textContent && button.textContent.includes('All filters')) {
        allFiltersBtn = button;
      }
    });
  }
  
  if (allFiltersBtn) {
    allFiltersBtn.click();
    
    setTimeout(() => {
      // Easy Apply toggle'ını bul
      const easyApplyToggle = document.querySelector(
        'input[id*="f_LF"][value="f_AL"], ' +
        'input[id*="f_AL"], ' +
        'label[for*="f_AL"] input'
      );
      
      if (easyApplyToggle && !easyApplyToggle.checked) {
        easyApplyToggle.click();
      }
      
      // Apply/Show results butonuna tıkla
      setTimeout(() => {
        const applyBtn = document.querySelector(
          'button[aria-label*="Apply filters"], ' +
          'button[aria-label*="Show results"]'
        );
        
        if (!applyBtn) {
          // Text ile ara
          const buttons = document.querySelectorAll('button');
          buttons.forEach(btn => {
            if (btn.textContent && 
                (btn.textContent.includes('Apply filters') || 
                 btn.textContent.includes('Show results'))) {
              btn.click();
            }
          });
        } else {
          applyBtn.click();
        }
      }, 500);
    }, 1000);
  }
}

// Heartbeat fonksiyonu - Extension'ın aktif olduğunu background'a bildir
function sendHeartbeat() {
  try {
    chrome.runtime.sendMessage({ 
      action: 'heartbeat',
      timestamp: Date.now(),
      url: window.location.href
    }).catch(error => {
      console.log('Heartbeat gönderilemedi:', error);
    });
  } catch (error) {
    console.log('Heartbeat hatası:', error);
  }
}

// Background'dan gelen mesajları dinle
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 Mesaj alındı:', request.action);
  
  try {
    if (request.action === 'getAllJobs') {
      console.log('📋 İş ilanları talep edildi');
      const jobs = getAllJobs();
      
      console.log(`📊 Bulunan iş sayısı: ${jobs.length}`);
      
      if (jobs.length > 0) {
        chrome.runtime.sendMessage({
          action: 'newJobsDetected',
          jobs: jobs
        }).catch(err => console.log('Mesaj gönderme hatası:', err));
      }
      
      // Sync response
      sendResponse({ success: true, jobCount: jobs.length });
      return false; // Sync response olduğunu belirt
      
    } else if (request.action === 'performSearch') {
      // Otomatik arama yap
      const { keywords, location, datePosted, easyApply } = request;
      
      // Arama terimlerini birleştir
      const searchQuery = keywords.join(' OR ');
      
      console.log('🎯 Arama parametreleri:', { searchQuery, location, datePosted, easyApply });
      
      // Hemen response gönder
      sendResponse({ success: true, message: 'Arama başlatıldı' });
      
      // Aramayı async olarak yap
      setTimeout(() => {
        const searchSuccess = performAutoSearch(searchQuery);
        
        if (searchSuccess) {
          console.log('✅ Arama başlatıldı, filtrelerin uygulanması bekleniyor...');
          
          // Arama sonuçlarının yüklenmesini bekle
          setTimeout(() => {
            
            // Date Posted filtresini uygula
            if (datePosted) {
              console.log('📅 Tarih filtresi uygulanıyor...');
              setDatePostedFilter(datePosted);
            }
            
            // Konum filtresini uygula
            if (location) {
              setTimeout(() => {
                console.log('📍 Konum filtresi uygulanıyor...');
                setLocationFilter(location);
              }, 2000);
            }
            
            // Easy Apply filtresini uygula
            if (easyApply) {
              setTimeout(() => {
                console.log('⚡ Easy Apply filtresi uygulanıyor...');
                setEasyApplyFilter(true);
              }, 4000);
            }
            
            // Tüm filtreler uygulandıktan sonra sonuçları topla
            setTimeout(() => {
              console.log('🏁 Arama tamamlandı, sonuçlar toplanıyor...');
              const jobs = getAllJobs();
              console.log('🎉 Arama sonuçları:', jobs.length, 'ilan bulundu');
              
              if (jobs.length > 0) {
                chrome.runtime.sendMessage({
                  action: 'newJobsDetected',
                  jobs: jobs
                }).catch(err => console.log('Mesaj gönderme hatası:', err));
              } else {
                console.log('⚠️ Hiç ilan bulunamadı, sayfa yapısı kontrol ediliyor...');
                
                // Debug için sayfa yapısını kontrol et
                setTimeout(() => {
                  const allLinks = document.querySelectorAll('a[href*="/jobs/view/"]');
                  console.log('🔍 Sayfada bulunan iş linkleri:', allLinks.length);
                  
                  const potentialCards = document.querySelectorAll('li, [class*="job"], [data-job]');
                  console.log('🔍 Potansiyel iş kartları:', potentialCards.length);
                }, 1000);
              }
            }, 8000); // 8 saniye sonra sonuçları topla
            
          }, 5000); // 5 saniye sonra filtreleri uygulamaya başla
        } else {
          console.log('❌ Arama başlatılamadı');
        }
      }, 100);
      
      return false; // Sync response kullan
      
    } else if (request.action === 'playSound') {
      // Bildirim sesi çal
      try {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBD6S1Oy9diMFl2z7n8A7+hWZyuvy2LK2pJKigGeIY8LszKkeGTqN0+2ukjMJHnt/ksbLkxwYOYrU6bWVLwkejMD03Yz/Dp9ZIAunup/wwWQVCyuBz/TOhgsGQ4LL7sV5GwdWiub7spQRCHJ2N1+0936bsZ2mg4Bdf3iOt7uTMw0lia3m8ahdFApKkeHyyGYhBCCI0PD3nRYGPYTN79KBJAgUgNPy0Hkc');
        audio.volume = 0.5;
        audio.play();
      } catch (e) {
        console.log('🔇 Ses çalınamadı:', e);
      }
      sendResponse({ success: true });
      return false;
      
    } else if (request.action === 'ping') {
      // Ping-pong yanıtı - Extension'ın aktif olduğunu gösterir
      console.log('🏓 Ping alındı, pong gönderiliyor');
      sendResponse({ success: true, timestamp: Date.now() });
      return false;
    }
  } catch (error) {
    console.error('❌ Mesaj işleme hatası:', error);
    sendResponse({ success: false, error: error.message });
    return false;
  }
});

// Sayfa değişikliklerini izle (LinkedIn dinamik içerik yüklediğinde)
// Observer sadece bir kez tanımlanmasını sağla
if (!window.linkedinJobObserver) {
  console.log('🔍 Mutation Observer başlatılıyor...');
  
  window.linkedinJobObserver = new MutationObserver((mutations) => {
    // Büyük değişiklikler olduğunda kontrol et
    const hasSignificantChanges = mutations.some(mutation => 
      mutation.addedNodes.length > 5 || 
      (mutation.target.classList && mutation.target.classList.contains('jobs-search-results'))
    );
    
    if (hasSignificantChanges) {
      console.log('🔄 Sayfa içeriği değişti, yeni ilanlar kontrol ediliyor...');
      // 2 saniye bekle, LinkedIn'in yüklemesini tamamlaması için
      setTimeout(() => {
        const jobs = getAllJobs();
        if (jobs.length > 0) {
          chrome.runtime.sendMessage({
            action: 'newJobsDetected',
            jobs: jobs
          });
        }
      }, 2000);
    }
  });

  // Observer'ı başlat
  const targetNode = document.querySelector('body');
  if (targetNode) {
    window.linkedinJobObserver.observe(targetNode, {
      childList: true,
      subtree: true
    });
    console.log('✅ Mutation Observer başlatıldı');
  }
}

// Heartbeat'i düzenli aralıklarla gönder
setInterval(sendHeartbeat, 30000); // Her 30 saniyede bir

// İlk yüklemede kontrol et
setTimeout(() => {
  console.log('🚀 Extension başlatıldı, ilk kontrol yapılıyor...');
  
  // Sonsuz döngüyü önlemek için kontrol
  if (window.initialCheckDone) {
    console.log('⚠️ İlk kontrol zaten yapıldı, atlanıyor...');
    return;
  }
  
  window.initialCheckDone = true;
  
  // İlk heartbeat gönder
  sendHeartbeat();
  
  // Bekleyen arama var mı kontrol et (tek kelime yenilemesi sonrası)
  chrome.storage.local.get(['pendingSearchTerms', 'pendingSearchTime'], (result) => {
    const now = Date.now();
    const isPendingSearch = result.pendingSearchTime && (now - result.pendingSearchTime < 10000); // 10 saniye içinde
    
    if (isPendingSearch && result.pendingSearchTerms) {
      console.log('🔄 Sayfa yenileme sonrası bekleyen arama var:', result.pendingSearchTerms);
      
      // Bekleyen aramayı temizle
      chrome.storage.local.remove(['pendingSearchTerms', 'pendingSearchTime']);
      
      // Tek kelimelik arama için varyasyon yap
      setTimeout(() => {
        const searchVariation = createSearchVariation([result.pendingSearchTerms]);
        console.log('🎯 Tek kelime için varyasyon yapılıyor:', searchVariation);
        
        // Arama inputunu bul ve varyasyonu yaz
        const searchInput = document.querySelector(
          'input[aria-label*="Search by title"], ' +
          'input[placeholder*="Search by title"], ' +
          'input.jobs-search-box__text-input'
        );
        
        if (searchInput) {
          searchInput.value = searchVariation;
          searchInput.dispatchEvent(new Event('input', { bubbles: true }));
          
          setTimeout(() => {
            searchInput.dispatchEvent(new KeyboardEvent('keydown', {
              key: 'Enter',
              keyCode: 13,
              bubbles: true
            }));
            console.log('✅ Tek kelime varyasyonu ile arama yapıldı');
          }, 1000);
        }
      }, 2000);
      
      return;
    }
    
    // Normal ilk kontrol
    const jobs = getAllJobs();
    console.log(`🏁 İlk kontrol: ${jobs.length} ilan bulundu`);
    
    if (jobs.length > 0) {
      chrome.runtime.sendMessage({
        action: 'newJobsDetected',
        jobs: jobs
      }).catch(err => console.log('Mesaj gönderme hatası:', err));
    }
    
    // Sadece ana jobs sayfasındaysa ve arama yapılmamışsa otomatik arama başlat
    const currentUrl = window.location.href;
    const isMainJobsPage = currentUrl.includes('/jobs/') && 
                          !currentUrl.includes('keywords') && 
                          !currentUrl.includes('search') && 
                          !currentUrl.includes('currentJobId');
    
    if (isMainJobsPage && jobs.length === 0) {
      chrome.storage.local.get(['filters'], (result) => {
        if (result.filters && result.filters.keywords && result.filters.keywords.length > 0) {
          console.log('🎯 Kriterler bulundu, otomatik arama başlatılıyor...');
          setTimeout(() => {
            chrome.runtime.sendMessage({ action: 'requestAutoSearch' })
              .catch(err => console.log('Auto search request hatası:', err));
          }, 2000);
        }
      });
    }
  });
}, 3000);

console.log('✅ LinkedIn Job Monitor Content Script tamamen yüklendi');

})(); // IIFE kapatma