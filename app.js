// === CONFIGURATION ===
const EDGE_API_URL = "https://dictionary-edge-api.naruttamboruah.workers.dev";
// =====================

// State Monitoring Variables
let activeSelectedWordObj = null; 
let savedBookmarksArray = []; 
let typingTimer = null; 
let currentDropdownMatches = []; 
const localSearchCache = new Map(); 

// DOM Elements
const searchInput = document.getElementById('search-input'); 
const searchHelp = document.getElementById('search-help'); 
const wordSidebarList = document.getElementById('word-sidebar-list'); 
const wordSidebarContainer = document.getElementById('word-sidebar-container'); 
const emptyState = document.getElementById('empty-state'); 
const meaningContent = document.getElementById('meaning-content'); 

const viewWord = document.getElementById('view-word'); 
const viewTransliteration = document.getElementById('view-transliteration'); 
const viewType = document.getElementById('view-type'); 
const viewMeaning = document.getElementById('view-meaning'); 
const viewDefAssamese = document.getElementById('view-def-assamese'); 
const viewDefEnglish = document.getElementById('view-def-english'); 
const viewExample = document.getElementById('view-example'); 
const exampleBox = document.getElementById('example-box'); 

// Correction Drawer Elements
const correctionDrawer = document.getElementById('correction-drawer'); 
const correctionWordDisplay = document.getElementById('correction-word-display'); 
const correctionType = document.getElementById('correction-type'); 
const correctionFeedback = document.getElementById('correction-feedback'); 

// Application Bootstrap initialization
window.onload = () => {
    // 1. Initial State Initialization
    loadSavedBookmarksFromStorage(); 
    
    // 2. STRATEGY 1 URL DEEPLINK ROUTER: Check if visitor loaded a specific entry
    const urlParams = new URLSearchParams(window.location.search);
    const wordParam = urlParams.get('word');

    if (wordParam) {
        const cleanWord = decodeURIComponent(wordParam).trim().toLowerCase();
        if (searchInput) searchInput.value = cleanWord;
        closeCorrectionForm();
        hideAutocompleteDropdown();
        fetchDetailedDefinition(cleanWord);
    } else {
        // Default homepage reset routing state
        navigateToHomeScreenHome(); 
    }
};

// ==========================================
// HOME RESET CONTROLLER
// ==========================================
function navigateToHomeScreenHome() {
    if (searchInput) searchInput.value = ''; 
    hideAutocompleteDropdown(); 
    closeCorrectionForm(); 
    resetDefinitionView(); 
    fetchWordOfTheDay();   
    
    // Clean browser history string query if user explicitly wipes screen
    if (window.location.search) {
        const clearUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
        window.history.replaceState({ path: clearUrl }, '', clearUrl);
    }
}

// ==========================================
// MODULE 1: STABLE SEED "WORD OF THE DAY" SYSTEM
// ==========================================
async function fetchWordOfTheDay() {
    const loader = document.getElementById('wotd-loader'); 
    const contentBox = document.getElementById('wotd-content'); 

    if (loader) loader.classList.remove('hidden'); 
    if (contentBox) contentBox.classList.add('hidden'); 

    try {
        const localWotdSeeds = ["curiosity", "resilience", "harmony", "eloquent", "benevolent", "innovation", "serenity", "zenith"];
        
        const rightNow = new Date(); 
        const calendarSeedInteger = rightNow.getFullYear() * 10000 + (rightNow.getMonth() + 1) * 100 + rightNow.getDate(); 
        
        let stringHashCounter = 0; 
        const seedString = calendarSeedInteger.toString(); 
        for (let i = 0; i < seedString.length; i++) {
            stringHashCounter = (stringHashCounter << 5) - stringHashCounter + seedString.charCodeAt(i); 
            stringHashCounter |= 0; 
        }
        
        const lockedDailyIndex = Math.abs(stringHashCounter) % localWotdSeeds.length; 
        const targetSeedWord = localWotdSeeds[lockedDailyIndex]; 

        const response = await fetch(`${EDGE_API_URL}/word/${targetSeedWord}`);
        if (!response.ok) throw new Error("Fallback activation");
        
        const dailyWord = await response.json();
        dailyWord.word = targetSeedWord; 

        document.getElementById('wotd-word').textContent = dailyWord.word || "অভিধান"; 
        document.getElementById('wotd-pos').textContent = dailyWord.part_of_speech || dailyWord.type || "Word"; 
        document.getElementById('wotd-meaning').textContent = dailyWord.meaning || "Meaning lookup available."; 

        document.getElementById('wotd-action-btn').onclick = () => {
            displayDefinition(dailyWord); 
            if (searchInput) searchInput.value = dailyWord.word; 
            updateBrowserHistoryUrl(dailyWord.word);
        };

        if (loader) loader.classList.add('hidden'); 
        if (contentBox) contentBox.classList.remove('hidden'); 

    } catch (err) {
        console.error("Daily highlight processing failure:", err);
        if (loader) loader.textContent = "System ready. Begin searching above."; 
    }
}

// ==========================================
// MODULE 2: HIGH-SPEED AUTOCOMPLETE SEARCH
// ==========================================
function handleSearch() {
    if (!searchInput) return;
    clearTimeout(typingTimer); 
    const query = searchInput.value.trim(); 
    
    if (query.length === 0) {
        hideAutocompleteDropdown(); 
        return;
    }

    typingTimer = setTimeout(() => {
        fetchWordsFromCloud(query); 
    }, 120); 
}

async function fetchWordsFromCloud(query) {
    const cacheKey = query.toLowerCase(); 

    if (localSearchCache.has(cacheKey)) {
        currentDropdownMatches = localSearchCache.get(cacheKey); 
        renderAutocompleteDropdown(currentDropdownMatches); 
        return;
    }

    try {
        const response = await fetch(`${EDGE_API_URL}/search/${encodeURIComponent(cacheKey)}`);
        if (!response.ok) throw new Error("Edge search communication exception");
        
        const data = await response.json();
        currentDropdownMatches = data || []; 
        
        localSearchCache.set(cacheKey, currentDropdownMatches); 
        renderAutocompleteDropdown(currentDropdownMatches); 
    } catch (err) {
        console.error("Search query error:", err); 
    }
}

function renderAutocompleteDropdown(data) {
    if (!wordSidebarList || !wordSidebarContainer) return;
    
    wordSidebarList.innerHTML = ''; 
    const totalCount = data ? data.length : 0; 
    
    wordSidebarContainer.classList.remove('hidden'); 
    wordSidebarContainer.classList.add('flex'); 

    document.getElementById('dropdown-status-label').textContent = `Matches Found (${totalCount})`; 

    if (totalCount === 0) {
        wordSidebarList.innerHTML = `<p class="text-xs text-slate-400 py-4 text-center italic">কোনো শব্দ পোৱা নগ’ল (No results found).</p>`; 
        return;
    }

    data.forEach(item => {
        const button = document.createElement('button'); 
        button.innerText = `${item.word} ➔ ${item.meaning || ''}`; 
        button.className = "w-full text-left px-3 py-2.5 rounded-xl text-slate-700 hover:bg-teal-50 hover:text-teal-950 font-medium transition-all text-sm border border-transparent cursor-pointer block truncate font-as"; 
        
        button.onclick = () => {
            if (searchInput) searchInput.value = item.word; 
            fetchDetailedDefinition(item.word);
            hideAutocompleteDropdown();                      
        };
        wordSidebarList.appendChild(button); 
    });
}

async function fetchDetailedDefinition(targetWord) {
    const cleanWord = targetWord.trim().toLowerCase();
    try {
        const response = await fetch(`${EDGE_API_URL}/word/${encodeURIComponent(cleanWord)}`);
        if (!response.ok) throw new Error("Detailed lookup failed");
        
        const fullData = await response.json();
        fullData.word = targetWord; 
        displayDefinition(fullData);
        updateBrowserHistoryUrl(cleanWord);
    } catch(err) {
        console.error("Detailed definition retrieval error:", err);
    }
}

if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && currentDropdownMatches.length > 0) {
            const queryVal = searchInput.value.trim().toLowerCase(); 
            const exactMatch = currentDropdownMatches.find(item => item.word === queryVal) || currentDropdownMatches[0]; 
            
            searchInput.value = exactMatch.word; 
            fetchDetailedDefinition(exactMatch.word); 
            hideAutocompleteDropdown(); 
        }
    });
}

function hideAutocompleteDropdown() {
    if (wordSidebarContainer) {
        wordSidebarContainer.classList.add('hidden'); 
        wordSidebarContainer.classList.remove('flex'); 
    }
}

document.addEventListener('click', function(event) {
    if (!searchInput || !wordSidebarContainer) return;
    const isSearchBoxClick = event.target.closest('#search-input') || event.target.closest('#word-sidebar-container'); 
    if (!isSearchBoxClick) {
        hideAutocompleteDropdown(); 
    }
});

// Helper utility to alter url context state dynamically for search crawler entry index maps
function updateBrowserHistoryUrl(wordKey) {
    const nextUrlPath = `${window.location.protocol}//${window.location.host}${window.location.pathname}?word=${encodeURIComponent(wordKey)}`;
    window.history.pushState({ path: nextUrlPath }, '', nextUrlPath);
}

// ==========================================
// MODULE 3: DEFINITION DISPLAY LOGIC
// ==========================================
function displayDefinition(item) {
    activeSelectedWordObj = item; 
    closeCorrectionForm(); 

    const isBookmarked = savedBookmarksArray.some(x => x.word === item.word); 
    updateBookmarkStarUI(isBookmarked); 

    if (emptyState) emptyState.classList.add('hidden'); 
    if (meaningContent) meaningContent.classList.remove('hidden'); 

    viewWord.innerText = item.word || ''; 
    viewType.innerText = item.part_of_speech || item.type || "Word"; 

    if (item.transliteration && item.transliteration !== "Pending") {
        viewTransliteration.innerText = `[ ${item.transliteration} ]`; 
        viewTransliteration.classList.remove('hidden'); 
    } else {
        viewTransliteration.classList.add('hidden'); 
    }

    const isWordAssamese = /[\u0980-\u09FF]/.test(item.word || ''); 
    viewWord.className = `text-3xl font-bold text-teal-950 tracking-wide ${isWordAssamese ? 'font-as' : 'font-en'}`; 

    const meaningTarget = document.getElementById('view-meaning'); 
    if (meaningTarget) {
        meaningTarget.innerHTML = ''; 
        if (item.meaning) {
            const cleanMeaningsArray = item.meaning.split(/[,;]\s*/); 
            const badgeContainer = document.createElement('div'); 
            badgeContainer.className = "flex flex-wrap gap-2 mt-1 mb-2 justify-start"; 

            cleanMeaningsArray.forEach(meaningWord => {
                if (meaningWord.trim() !== "") {
                    const badge = document.createElement('button'); 
                    badge.innerText = meaningWord.trim(); 
                    
                    const isBadgeAssamese = /[\u0980-\u09FF]/.test(meaningWord); 
                    badge.className = `px-3 py-1.5 text-xs font-semibold bg-slate-50 hover:bg-teal-600 hover:text-white text-slate-700 rounded-lg border border-slate-200 transition-all duration-150 cursor-pointer active:scale-95 ${isBadgeAssamese ? 'font-as' : 'font-en'}`; 
                    
                    badge.onclick = async () => {
                        const targetTerm = meaningWord.trim().toLowerCase(); 
                        if (searchInput) searchInput.value = targetTerm; 
                        hideAutocompleteDropdown(); 

                        try {
                            const response = await fetch(`${EDGE_API_URL}/word/${encodeURIComponent(targetTerm)}`);
                            if (response.ok) {
                                const data = await response.json();
                                data.word = targetTerm; 
                                displayDefinition(data); 
                                updateBrowserHistoryUrl(targetTerm);
                            } else {
                                fetchWordsFromCloud(targetTerm); 
                            }
                        } catch (err) {
                            console.error("Direct badge query failed:", err); 
                        }
                    };
                    badgeContainer.appendChild(badge); 
                }
            });
            meaningTarget.appendChild(badgeContainer); 
        }
    }

    viewDefAssamese.innerText = item.assamese_definition || 'সংজ্ঞা পৰীক্ষা কৰা হৈছে...'; 
    viewDefEnglish.innerText = item.english_definition || 'Conceptual definition lookup available.'; 

    if (item.context_example && item.context_example.trim() !== "" && item.context_example !== "Context lookup available online.") {
        exampleBox.classList.remove('hidden'); 
        viewExample.innerText = item.context_example; 
    } else if (item.example && item.example.trim() !== "") {
        exampleBox.classList.remove('hidden'); 
        viewExample.innerText = item.example; 
    } else {
        exampleBox.classList.add('hidden'); 
    }
}

// ==========================================
// MODULE 4: BOOKMARKS / FAVORITES SYSTEM
// ==========================================
function loadSavedBookmarksFromStorage() {
    const storageData = localStorage.getItem('asomiya_lexicon_bookmarks'); 
    if (storageData) {
        try { savedBookmarksArray = JSON.parse(storageData); } catch(e) { savedBookmarksArray = []; } 
    }
    renderFavoritesListUI(); 
}

function updateBookmarksStorage() {
    localStorage.setItem('asomiya_lexicon_bookmarks', JSON.stringify(savedBookmarksArray)); 
    renderFavoritesListUI(); 
}

function renderFavoritesListUI() {
    const scrollList = document.getElementById('favorites-scroll-list'); 
    const counterLabel = document.getElementById('fav-counter-label'); 
    
    if (counterLabel) counterLabel.textContent = `Favorites (${savedBookmarksArray.length})`; 
    if (!scrollList) return;
    
    scrollList.innerHTML = ''; 

    if (savedBookmarksArray.length === 0) {
        scrollList.innerHTML = `<p class="text-xs text-slate-400 py-8 text-center italic">No bookmarked terms saved.</p>`; 
        return;
    }

    savedBookmarksArray.forEach(item => {
        const rowDiv = document.createElement('div'); 
        rowDiv.className = "flex justify-between items-center bg-slate-50 border border-slate-200/60 p-2.5 rounded-xl text-sm font-medium"; 
        
        const labelBtn = document.createElement('button'); 
        labelBtn.textContent = item.word; 
        labelBtn.className = "text-left font-as text-slate-800 hover:text-teal-700 truncate flex-1 cursor-pointer"; 
        labelBtn.onclick = () => {
            displayDefinition(item); 
            searchInput.value = item.word; 
            updateBrowserHistoryUrl(item.word.toLowerCase());
            toggleFavoritesSidebar(); 
        };

        const deleteBtn = document.createElement('button'); 
        deleteBtn.innerHTML = "🗑️"; 
        deleteBtn.className = "text-xs px-2 py-1 opacity-60 hover:opacity-100 cursor-pointer transition-all"; 
        deleteBtn.onclick = (e) => {
            e.stopPropagation(); 
            removeBookmarkRecord(item.word); 
        };

        rowDiv.appendChild(labelBtn); 
        rowDiv.appendChild(deleteBtn); 
        scrollList.appendChild(rowDiv); 
    });
}

function toggleActiveBookmarkState() {
    if (!activeSelectedWordObj) return;
    const isAlreadyBookmarked = savedBookmarksArray.some(x => x.word === activeSelectedWordObj.word); 
    
    if (isAlreadyBookmarked) {
        removeBookmarkRecord(activeSelectedWordObj.word); 
    } else {
        savedBookmarksArray.push(activeSelectedWordObj); 
        updateBookmarksStorage(); 
        updateBookmarkStarUI(true); 
    }
}

function removeBookmarkRecord(wordKey) {
    savedBookmarksArray = savedBookmarksArray.filter(x => x.word !== wordKey); 
    updateBookmarksStorage(); 
    if (activeSelectedWordObj && activeSelectedWordObj.word === wordKey) {
        updateBookmarkStarUI(false); 
    }
}

function updateBookmarkStarUI(isFav) {
    const starBtn = document.getElementById('bookmark-toggle-btn'); 
    if (!starBtn) return;
    if (isFav) {
        starBtn.className = "p-2 bg-amber-50 text-amber-500 rounded-xl border border-amber-200 shadow-3xs cursor-pointer transition-all"; 
    } else {
        starBtn.className = "p-2 bg-slate-50 hover:bg-amber-50 text-slate-400 hover:text-amber-500 rounded-xl border border-slate-200/60 shadow-3xs cursor-pointer transition-all"; 
    }
}

function clearAllSavedFavorites() {
    if (confirm("Clear all bookmarked items?")) {
        savedBookmarksArray = []; 
        updateBookmarksStorage(); 
        updateBookmarkStarUI(false); 
    }
}

function toggleFavoritesSidebar() {
    const sidebar = document.getElementById('favorites-sidebar'); 
    const overlay = document.getElementById('sidebar-overlay'); 
    if (!sidebar || !overlay) return;

    if (sidebar.classList.contains('translate-x-full')) {
        sidebar.classList.remove('translate-x-full'); 
        overlay.classList.remove('hidden'); 
    } else {
        sidebar.classList.add('translate-x-full'); 
        overlay.classList.add('hidden'); 
    }
}

// ==========================================
// MODULE 5: CORRECTION SUBMISSIONS
// ==========================================
function openCorrectionForm() {
    if (!activeSelectedWordObj) return;
    correctionWordDisplay.value = activeSelectedWordObj.word; 
    correctionFeedback.value = ''; 
    correctionType.selectedIndex = 0; 
    if (correctionDrawer) {
        correctionDrawer.classList.remove('hidden'); 
        correctionDrawer.classList.add('flex'); 
    }
}

function closeCorrectionForm() {
    if (correctionDrawer) {
        correctionDrawer.classList.add('hidden'); 
        correctionDrawer.classList.remove('flex'); 
    }
}

async function submitCorrectionToCloud() {
    const feedbackText = correctionFeedback.value.trim(); 
    if (!feedbackText) return alert("Please provide feedback details."); 
    
    // Find entry trigger and disable it visually to safeguard against twin submission race conditions
    const submitBtn = document.querySelector('#correction-drawer button[onclick="submitCorrectionToCloud()"]');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = "Submitting...";
    }

    const payload = {
        word: activeSelectedWordObj.word,
        issue_type: correctionType.value,
        feedback: feedbackText
    };
    
    try {
        const response = await fetch(`${EDGE_API_URL}/report-correction`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) throw new Error("Server rejected request entry validation mapping logs");
        
        alert("ধন্যবাদ! Correction suggestion logged safely."); 
        closeCorrectionForm(); 
    } catch (err) {
        console.error("Submission operational crash exception trace:", err);
        alert("Failed to log correction context. Please try again later.");
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = "Submit Entry Log";
        }
    }
}

function copyWordToClipboard() {
    const wordText = viewWord.innerText; 
    navigator.clipboard.writeText(wordText).then(() => {
        const copyBtn = document.getElementById('copy-toast-btn'); 
        if (copyBtn) {
            copyBtn.innerText = "✓ Copied!"; 
            setTimeout(() => { copyBtn.innerText = "📋 Copy Word"; }, 1500); 
        }
    });
}

function resetDefinitionView() {
    if (emptyState) emptyState.classList.remove('hidden'); 
    if (meaningContent) meaningContent.classList.add('hidden'); 
    activeSelectedWordObj = null; 
}

// ==========================================
// MODULE 6: ADVANCED PWA INSTALL MANAGER
// ==========================================
let deferredPWAInstallPrompt = null; 

const isIOSDevice = () => {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream; 
};

const isRunningStandalone = () => {
    return (window.matchMedia('(display-mode: standalone)').matches) || (window.navigator.standalone === true); 
};

window.addEventListener('DOMContentLoaded', () => {
    const installBanner = document.getElementById('pwa-install-banner'); 
    
    if (isIOSDevice() && !isRunningStandalone() && installBanner) {
        const bannerTitle = installBanner.querySelector('h4'); 
        const bannerDesc = installBanner.querySelector('p'); 
        const bannerBtn = installBanner.querySelector('button'); 
        
        if (bannerTitle) bannerTitle.textContent = "Add to iPhone Home Screen"; 
        if (bannerDesc) bannerDesc.textContent = "Tap Safari's 'Share' icon below, then select 'Add to Home Screen'! 🍏"; 
        
        if (bannerBtn) {
            bannerBtn.textContent = "How to Install"; 
            bannerBtn.onclick = () => {
                alert("To install on iOS:\n\n1. Click the 'Share' button at the bottom of Safari (the square box with an up arrow).\n2. Scroll down the menu options.\n3. Tap 'Add to Home Screen'."); 
            };
        }
        
        installBanner.classList.remove('hidden'); 
        installBanner.classList.add('flex'); 
    }
});

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); 
    deferredPWAInstallPrompt = e; 
    
    const installBanner = document.getElementById('pwa-install-banner'); 
    if (installBanner && !isIOSDevice()) {
        installBanner.classList.remove('hidden'); 
        installBanner.classList.add('flex'); 
    }
});

async function triggerNativePWAInstallation() {
    if (!deferredPWAInstallPrompt) return;
    
    deferredPWAInstallPrompt.prompt(); 
    const { outcome } = await deferredPWAInstallPrompt.userChoice; 
    
    deferredPWAInstallPrompt = null; 
    
    const installBanner = document.getElementById('pwa-install-banner'); 
    if (installBanner) {
        installBanner.classList.add('hidden'); 
        installBanner.classList.remove('flex'); 
    }
}

function closePwaBanner() {
    const installBanner = document.getElementById('pwa-install-banner');
    if (installBanner) {
        installBanner.classList.add('hidden');
        installBanner.classList.remove('flex');
    }
}

window.addEventListener('appinstalled', () => {
    deferredPWAInstallPrompt = null; 
    const installBanner = document.getElementById('pwa-install-banner'); 
    if (installBanner) {
        installBanner.classList.add('hidden'); 
        installBanner.classList.remove('flex'); 
    }
});

// ==========================================
// MODULE 7: CREDITS MODAL CONTROLLER
// ==========================================
function toggleCreditsModal() {
    const modal = document.getElementById('credits-modal'); 
    if (!modal) return;
    
    if (modal.classList.contains('hidden')) {
        modal.classList.remove('hidden'); 
        modal.classList.add('flex'); 
    } else {
        modal.classList.add('hidden'); 
        modal.classList.remove('flex'); 
    }
}