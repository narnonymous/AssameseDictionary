// === CONFIGURATION ===
// Replace this with your actual Cloudflare Worker live deployment endpoint URL (NO trailing slash)
const EDGE_API_URL = "https://dictionary-edge-api.naruttamboruah.workers.dev";
// =====================

// State Monitoring Variables
let activeSelectedWordObj = null; // tracks the active dictionary row object
let savedBookmarksArray = []; // collection array for local bookmarks
let typingTimer = null; // debounce interval anchor
let currentDropdownMatches = []; // holds latest live matches array
const localSearchCache = new Map(); // Lightning-fast in-memory lookup cache

// DOM Elements
const searchInput = document.getElementById('search-input'); // search bar interface element
const searchHelp = document.getElementById('search-help'); // fallback search guidance element
const wordSidebarList = document.getElementById('word-sidebar-list'); // autocomplete container target element
const wordSidebarContainer = document.getElementById('word-sidebar-container'); // autocomplete alignment wrapper element
const emptyState = document.getElementById('empty-state'); // core application homepage container element
const meaningContent = document.getElementById('meaning-content'); // active definition viewing area element

const viewWord = document.getElementById('view-word'); // definition main title item
const viewTransliteration = document.getElementById('view-transliteration'); // script token element
const viewType = document.getElementById('view-type'); // grammatical classification tag item
const viewMeaning = document.getElementById('view-meaning'); // synonym container area element
const viewDefAssamese = document.getElementById('view-def-assamese'); // primary target definition text block
const viewDefEnglish = document.getElementById('view-def-english'); // baseline secondary description definition text
const viewExample = document.getElementById('view-example'); // syntax phrase rendering row
const exampleBox = document.getElementById('example-box'); // syntax display block frame container

// Correction Drawer Elements
const correctionDrawer = document.getElementById('correction-drawer'); // error report sliding panel element
const correctionWordDisplay = document.getElementById('correction-word-display'); // active context mirror item
const correctionType = document.getElementById('correction-type'); // classification drop menu element
const correctionFeedback = document.getElementById('correction-feedback'); // user remark field element

// Application Bootstrap initialization
window.onload = () => {
    navigateToHomeScreenHome(); // reset application view matrix
    loadSavedBookmarksFromStorage(); // bootstrap saved bookmarks from local user instance
};

// ==========================================
// HOME RESET CONTROLLER
// ==========================================
function navigateToHomeScreenHome() {
    if (searchInput) searchInput.value = ''; // wipe search field parameters cleanly
    hideAutocompleteDropdown(); // clear current search selections safely
    closeCorrectionForm(); // collapse user input feedback rows
    resetDefinitionView(); // bring back the original dashboard dashboard state
    fetchWordOfTheDay(); // calculate daily discovery word  
}

// ==========================================
// MODULE 1: STABLE SEED "WORD OF THE DAY" SYSTEM
// ==========================================
async function fetchWordOfTheDay() {
    const loader = document.getElementById('wotd-loader'); // loading icon tracker element
    const contentBox = document.getElementById('wotd-content'); // dynamic canvas asset element

    if (loader) loader.classList.remove('hidden'); // render loader elements
    if (contentBox) contentBox.classList.add('hidden'); // mask content layout fields safely

    try {
        // High-frequency curation words for daily deterministic seed generation
        const localWotdSeeds = ["curiosity", "resilience", "harmony", "eloquent", "benevolent", "innovation", "serenity", "zenith"];
        
        const rightNow = new Date(); // fetch local date timestamp properties
        const calendarSeedInteger = rightNow.getFullYear() * 10000 + (rightNow.getMonth() + 1) * 100 + rightNow.getDate(); // produce calendar sequence indices
        
        let stringHashCounter = 0; // initialize calculation parameters
        const seedString = calendarSeedInteger.toString(); // format calendar string values
        for (let i = 0; i < seedString.length; i++) {
            stringHashCounter = (stringHashCounter << 5) - stringHashCounter + seedString.charCodeAt(i); // cycle sequence bitmasks
            stringHashCounter |= 0; // lock into 32-bit integer workspace
        }
        
        const lockedDailyIndex = Math.abs(stringHashCounter) % localWotdSeeds.length; // slice index boundaries
        const targetSeedWord = localWotdSeeds[lockedDailyIndex]; // isolate daily selected text target

        // Fetch definition dynamically directly from Cloudflare KV Edge
        const response = await fetch(`${EDGE_API_URL}/word/${targetSeedWord}`);
        if (!response.ok) throw new Error("Fallback activation");
        
        const dailyWord = await response.json();
        dailyWord.word = targetSeedWord; // append baseline structural reference value to JSON payload

        document.getElementById('wotd-word').textContent = dailyWord.word || "অভিধান"; // inject localized title elements
        document.getElementById('wotd-pos').textContent = dailyWord.part_of_speech || dailyWord.type || "Word"; // process grammatical parameters
        document.getElementById('wotd-meaning').textContent = dailyWord.meaning || "Meaning lookup available."; // bind contextual description definitions

        document.getElementById('wotd-action-btn').onclick = () => {
            displayDefinition(dailyWord); // display data dashboard panels
            if (searchInput) searchInput.value = dailyWord.word; // sync keyword labels into core text inputs
        };

        if (loader) loader.classList.add('hidden'); // pull tracking layers away
        if (contentBox) contentBox.classList.remove('hidden'); // animate display frames cleanly

    } catch (err) {
        console.error("Daily highlight processing failure:", err); // capture communication breakdowns
        if (loader) loader.textContent = "System ready. Begin searching above."; // set baseline guidance
    }
}

// ==========================================
// MODULE 2: HIGH-SPEED AUTOCOMPLETE SEARCH
// ==========================================
function handleSearch() {
    if (!searchInput) return;
    clearTimeout(typingTimer); // flush running interval actions instantly
    const query = searchInput.value.trim(); // clean space artifacts from search text parameters
    
    if (query.length === 0) {
        hideAutocompleteDropdown(); // clear visibility frames if search field drops to zero
        return;
    }

    // Debounce dropped to 120ms for instant loading performance feedback
    typingTimer = setTimeout(() => {
        fetchWordsFromCloud(query); // run retrieval routines
    }, 120); 
}

async function fetchWordsFromCloud(query) {
    const cacheKey = query.toLowerCase(); // format parameter indexing lookups

    // In-memory local lookup bypass
    if (localSearchCache.has(cacheKey)) {
        currentDropdownMatches = localSearchCache.get(cacheKey); // pull collection arrays directly from mapping sets
        renderAutocompleteDropdown(currentDropdownMatches); // draw dropdown elements
        return;
    }

    try {
        // Query our prefix listing endpoint on the Cloudflare Worker
        const response = await fetch(`${EDGE_API_URL}/search/${encodeURIComponent(cacheKey)}`);
        if (!response.ok) throw new Error("Edge search communication exception");
        
        const data = await response.json();
        currentDropdownMatches = data || []; // route collection structures safely
        
        localSearchCache.set(cacheKey, currentDropdownMatches); // save properties into mapping cache
        renderAutocompleteDropdown(currentDropdownMatches); // update dropdown layout view boards
    } catch (err) {
        console.error("Search query error:", err); // flag connectivity anomalies
    }
}

function renderAutocompleteDropdown(data) {
    if (!wordSidebarList || !wordSidebarContainer) return;
    
    wordSidebarList.innerHTML = ''; // drop historical layouts cleanly
    const totalCount = data ? data.length : 0; // determine alignment totals
    
    wordSidebarContainer.classList.remove('hidden'); // flip hidden state visibility parameters
    wordSidebarContainer.classList.add('flex'); // bind layout rules

    document.getElementById('dropdown-status-label').textContent = `Matches Found (${totalCount})`; // render quantity tags

    if (totalCount === 0) {
        wordSidebarList.innerHTML = `<p class="text-xs text-slate-400 py-4 text-center italic">কোনো শব্দ পোৱা নগ’ল (No results found).</p>`; // empty dataset text output
        return;
    }

    data.forEach(item => {
        const button = document.createElement('button'); // build choice button elements
        button.innerText = `${item.word} ➔ ${item.meaning || ''}`; // compile pairing text definitions
        button.className = "w-full text-left px-3 py-2.5 rounded-xl text-slate-700 hover:bg-teal-50 hover:text-teal-950 font-medium transition-all text-sm border border-transparent cursor-pointer block truncate font-as"; // apply Tailwind class sets
        
        button.onclick = () => {
            if (searchInput) searchInput.value = item.word; // lock choice string into input frames
            
            // Fetch complete definitions dynamically since search results contain skeletal data strings
            fetchDetailedDefinition(item.word);
            hideAutocompleteDropdown(); // clear dropdown listings cleanly                    
        };
        wordSidebarList.appendChild(button); // append items to interface canvas
    });
}

// Supplemental routing module to drill into explicit dictionary row parameters cleanly
async function fetchDetailedDefinition(targetWord) {
    try {
        const response = await fetch(`${EDGE_API_URL}/word/${encodeURIComponent(targetWord.trim().toLowerCase())}`);
        if (!response.ok) throw new Error("Detailed lookup failed");
        
        const fullData = await response.json();
        fullData.word = targetWord; // attach label context fields safely
        displayDefinition(fullData);
    } catch(err) {
        console.error("Detailed definition retrieval error:", err);
    }
}

if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && currentDropdownMatches.length > 0) {
            const queryVal = searchInput.value.trim().toLowerCase(); // clean formatting
            const exactMatch = currentDropdownMatches.find(item => item.word === queryVal) || currentDropdownMatches[0]; // evaluate precision hits
            
            searchInput.value = exactMatch.word; // populate search label fields
            fetchDetailedDefinition(exactMatch.word); // process target definitions directly
            hideAutocompleteDropdown(); // clear visibility listings
        }
    });
}

function hideAutocompleteDropdown() {
    if (wordSidebarContainer) {
        wordSidebarContainer.classList.add('hidden'); // pull alignment visibility down
        wordSidebarContainer.classList.remove('flex'); // remove layout frames
    }
}

document.addEventListener('click', function(event) {
    if (!searchInput || !wordSidebarContainer) return;
    const isSearchBoxClick = event.target.closest('#search-input') || event.target.closest('#word-sidebar-container'); // track pointer intercept targets
    if (!isSearchBoxClick) {
        hideAutocompleteDropdown(); // fold interface items safely if pointer strikes outside action bounds
    }
});

// ==========================================
// MODULE 3: DEFINITION DISPLAY LOGIC
// ==========================================
function displayDefinition(item) {
    activeSelectedWordObj = item; // commit properties to running state variable structures
    closeCorrectionForm(); // drop report layouts instantly

    const isBookmarked = savedBookmarksArray.some(x => x.word === item.word); // match unique key indicators safely
    updateBookmarkStarUI(isBookmarked); // change state dashboard star colors

    if (emptyState) emptyState.classList.add('hidden'); // drop landing panel components
    if (meaningContent) meaningContent.classList.remove('hidden'); // unlock detailed viewing frames

    viewWord.innerText = item.word || ''; // render index text values
    viewType.innerText = item.part_of_speech || item.type || "Word"; // link syntax descriptors

    if (item.transliteration && item.transliteration !== "Pending") {
        viewTransliteration.innerText = `[ ${item.transliteration} ]`; // frame syntax string
        viewTransliteration.classList.remove('hidden'); // expose panel context
    } else {
        viewTransliteration.classList.add('hidden'); // hide row cleanly
    }

    const isWordAssamese = /[\u0980-\u09FF]/.test(item.word || ''); // validate unicode typography limits
    viewWord.className = `text-3xl font-bold text-teal-950 tracking-wide ${isWordAssamese ? 'font-as' : 'font-en'}`; // inject font rules dynamically

    const meaningTarget = document.getElementById('view-meaning'); // locate synonym area
    if (meaningTarget) {
        meaningTarget.innerHTML = ''; // wipe historical arrays cleanly
        if (item.meaning) {
            const cleanMeaningsArray = item.meaning.split(/[,;]\s*/); // partition entry text
            const badgeContainer = document.createElement('div'); // build item alignment arrays
            badgeContainer.className = "flex flex-wrap gap-2 mt-1 mb-2 justify-start"; // declare grid rules

            cleanMeaningsArray.forEach(meaningWord => {
                if (meaningWord.trim() !== "") {
                    const badge = document.createElement('button'); // build unique asset items
                    badge.innerText = meaningWord.trim(); // assign string metrics
                    
                    const isBadgeAssamese = /[\u0980-\u09FF]/.test(meaningWord); // test script boundaries
                    badge.className = `px-3 py-1.5 text-xs font-semibold bg-slate-50 hover:bg-teal-600 hover:text-white text-slate-700 rounded-lg border border-slate-200 transition-all duration-150 cursor-pointer active:scale-95 ${isBadgeAssamese ? 'font-as' : 'font-en'}`; // bind styles
                    
                    badge.onclick = async () => {
                        const targetTerm = meaningWord.trim().toLowerCase(); // clean keys
                        if (searchInput) searchInput.value = targetTerm; // bind tags
                        hideAutocompleteDropdown(); // clear display elements 

                        try {
                            const response = await fetch(`${EDGE_API_URL}/word/${encodeURIComponent(targetTerm)}`);
                            if (response.ok) {
                                const data = await response.json();
                                data.word = targetTerm; // ensure label mapping
                                displayDefinition(data); // display content canvas
                            } else {
                                fetchWordsFromCloud(targetTerm); // try to drop back to list queries safely
                            }
                        } catch (err) {
                            console.error("Direct badge query failed:", err); // trap runtime anomalies
                        }
                    };
                    badgeContainer.appendChild(badge); // bind items to frame layout
                }
            });
            meaningTarget.appendChild(badgeContainer); // anchor item collection arrays into interface view grids
        }
    }

    viewDefAssamese.innerText = item.assamese_definition || 'সংজ্ঞা পৰীক্ষা কৰা হৈছে...'; // map principal definition script text strings
    viewDefEnglish.innerText = item.english_definition || 'Conceptual definition lookup available.'; // bind complementary English translation descriptors

    if (item.context_example && item.context_example.trim() !== "" && item.context_example !== "Context lookup available online.") {
        exampleBox.classList.remove('hidden'); // toggle presentation borders
        viewExample.innerText = item.context_example; // map example context models
    } else if (item.example && item.example.trim() !== "") {
        exampleBox.classList.remove('hidden'); // fallback parsing visibility parameters
        viewExample.innerText = item.example; // mount raw example strings
    } else {
        exampleBox.classList.add('hidden'); // suppress empty parameters cleanly
    }
}

// ==========================================
// MODULE 4: BOOKMARKS / FAVORITES SYSTEM
// ==========================================
function loadSavedBookmarksFromStorage() {
    const storageData = localStorage.getItem('asomiya_lexicon_bookmarks'); // retrieve saved bookmark payload
    if (storageData) {
        try { savedBookmarksArray = JSON.parse(storageData); } catch(e) { savedBookmarksArray = []; } // process structural objects
    }
    renderFavoritesListUI(); // draw collection panel items
}

function updateBookmarksStorage() {
    localStorage.setItem('asomiya_lexicon_bookmarks', JSON.stringify(savedBookmarksArray)); // stringify collections into storage layers
    renderFavoritesListUI(); // render panel views
}

function renderFavoritesListUI() {
    const scrollList = document.getElementById('favorites-scroll-list'); // pinpoint layout targets
    const counterLabel = document.getElementById('fav-counter-label'); // target identity tracking tags
    
    if (counterLabel) counterLabel.textContent = `Favorites (${savedBookmarksArray.length})`; // update numerical tracker layouts
    if (!scrollList) return;
    
    scrollList.innerHTML = ''; // clear historical listing layouts

    if (savedBookmarksArray.length === 0) {
        scrollList.innerHTML = `<p class="text-xs text-slate-400 py-8 text-center italic">No bookmarked terms saved.</p>`; // fallback notification
        return;
    }

    savedBookmarksArray.forEach(item => {
        const rowDiv = document.createElement('div'); // initialize list alignment frames
        rowDiv.className = "flex justify-between items-center bg-slate-50 border border-slate-200/60 p-2.5 rounded-xl text-sm font-medium"; // apply layout properties
        
        const labelBtn = document.createElement('button'); // link activation button mechanisms
        labelBtn.textContent = item.word; // pass entry value indicators
        labelBtn.className = "text-left font-as text-slate-800 hover:text-teal-700 truncate flex-1 cursor-pointer"; // map typographic setups
        labelBtn.onclick = () => {
            displayDefinition(item); // mount target row properties into view frames
            searchInput.value = item.word; // append search text values
            toggleFavoritesSidebar(); // collapse utility navigation bars
        };

        const deleteBtn = document.createElement('button'); // build clear items utility button
        deleteBtn.innerHTML = "🗑️"; // apply graphic characters
        deleteBtn.className = "text-xs px-2 py-1 opacity-60 hover:opacity-100 cursor-pointer transition-all"; // mount styling classes
        deleteBtn.onclick = (e) => {
            e.stopPropagation(); // insulate event chains
            removeBookmarkRecord(item.word); // wipe elements via unique keys
        };

        rowDiv.appendChild(labelBtn); // stitch components together
        rowDiv.appendChild(deleteBtn); // merge control actions
        scrollList.appendChild(rowDiv); // print items onto interface canvas
    });
}

// Toggle or remove active selection markers
function toggleActiveBookmarkState() {
    if (!activeSelectedWordObj) return;
    const isAlreadyBookmarked = savedBookmarksArray.some(x => x.word === activeSelectedWordObj.word); // parse state markers safely
    
    if (isAlreadyBookmarked) {
        removeBookmarkRecord(activeSelectedWordObj.word); // disconnect values
    } else {
        savedBookmarksArray.push(activeSelectedWordObj); // inject selection records into state array models
        updateBookmarksStorage(); // serialize modifications
        updateBookmarkStarUI(true); // switch star highlight indicators
    }
}

function removeBookmarkRecord(wordKey) {
    savedBookmarksArray = savedBookmarksArray.filter(x => x.word !== wordKey); // drop matching indicators out of array models
    updateBookmarksStorage(); // commit storage changes
    if (activeSelectedWordObj && activeSelectedWordObj.word === wordKey) {
        updateBookmarkStarUI(false); // dim layout highlights if viewing record
    }
}

function updateBookmarkStarUI(isFav) {
    const starBtn = document.getElementById('bookmark-toggle-btn'); // hook control buttons
    if (!starBtn) return;
    if (isFav) {
        starBtn.className = "p-2 bg-amber-50 text-amber-500 rounded-xl border border-amber-200 shadow-3xs cursor-pointer transition-all"; // highlighted color properties
    } else {
        starBtn.className = "p-2 bg-slate-50 hover:bg-amber-50 text-slate-400 hover:text-amber-500 rounded-xl border border-slate-200/60 shadow-3xs cursor-pointer transition-all"; // base inactive color styles
    }
}

function clearAllSavedFavorites() {
    if (confirm("Clear all bookmarked items?")) {
        savedBookmarksArray = []; // drop active state structural dimensions cleanly
        updateBookmarksStorage(); // commit baseline resets
        updateBookmarkStarUI(false); // shut down layout indicators
    }
}

function toggleFavoritesSidebar() {
    const sidebar = document.getElementById('favorites-sidebar'); // hook sidebar canvas
    const overlay = document.getElementById('sidebar-overlay'); // pinpoint blur backing panels
    if (!sidebar || !overlay) return;

    if (sidebar.classList.contains('translate-x-full')) {
        sidebar.classList.remove('translate-x-full'); // animate menu layers inwards
        overlay.classList.remove('hidden'); // expose overlay paneling context
    } else {
        sidebar.classList.add('translate-x-full'); // fold workspace channels outward
        overlay.classList.add('hidden'); // secure structural spaces cleanly
    }
}

// ==========================================
// MODULE 5: CORRECTION SUBMISSIONS
// ==========================================
function openCorrectionForm() {
    if (!activeSelectedWordObj) return;
    correctionWordDisplay.value = activeSelectedWordObj.word; // sync keyword labels into text containers
    correctionFeedback.value = ''; // clear previous text block values
    correctionType.selectedIndex = 0; // return selection indicators back to default status indexes
    if (correctionDrawer) {
        correctionDrawer.classList.remove('hidden'); // project context wrappers forward
        correctionDrawer.classList.add('flex'); // adjust alignment frameworks
    }
}

function closeCorrectionForm() {
    if (correctionDrawer) {
        correctionDrawer.classList.add('hidden'); // mask drawing layers
        correctionDrawer.classList.remove('flex'); // strip alignment rules
    }
}

async function submitCorrectionToCloud() {
    const feedbackText = correctionFeedback.value.trim(); // strip text gaps safely
    if (!feedbackText) return alert("Please provide feedback details."); // mandate input text parameter entries
    
    console.log("Logged Correction Submission:", {
        word: activeSelectedWordObj.word,
        issue_type: correctionType.value,
        feedback: feedbackText
    });
    
    alert("ধন্যবাদ! Correction suggestion logged safely."); // output confirmation response panel dialogs
    closeCorrectionForm(); // fold interaction blocks
}

function copyWordToClipboard() {
    const wordText = viewWord.innerText; // parse index character configurations
    navigator.clipboard.writeText(wordText).then(() => {
        const copyBtn = document.getElementById('copy-toast-btn'); // hook confirmation action controls
        if (copyBtn) {
            copyBtn.innerText = "✓ Copied!"; // write state changes
            setTimeout(() => { copyBtn.innerText = "📋 Copy Word"; }, 1500); // cycle back to standard labels after interval triggers
        }
    });
}

function resetDefinitionView() {
    if (emptyState) emptyState.classList.remove('hidden'); // pull core landing boards forward
    if (meaningContent) meaningContent.classList.add('hidden'); // suppress specific definition layout blocks
    activeSelectedWordObj = null; // drop core model tracking markers safely
}

// ==========================================
// MODULE 6: ADVANCED PWA INSTALL MANAGER
// ==========================================
let deferredPWAInstallPrompt = null; // state anchor mapping prompt hooks

const isIOSDevice = () => {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream; // parse architecture signatures
};

const isRunningStandalone = () => {
    return (window.matchMedia('(display-mode: standalone)').matches) || (window.navigator.standalone === true); // verify native frame states
};

window.addEventListener('DOMContentLoaded', () => {
    const installBanner = document.getElementById('pwa-install-banner'); // hook tracking ribbons
    
    if (isIOSDevice() && !isRunningStandalone() && installBanner) {
        const bannerTitle = installBanner.querySelector('h4'); // harvest label structures
        const bannerDesc = installBanner.querySelector('p'); // isolate description rows
        const bannerBtn = installBanner.querySelector('button'); // anchor targeting buttons
        
        if (bannerTitle) bannerTitle.textContent = "Add to iPhone Home Screen"; // format titles for Apple ecosystems
        if (bannerDesc) bannerDesc.textContent = "Tap Safari's 'Share' icon below, then select 'Add to Home Screen'! 🍏"; // specify routing directions
        
        if (bannerBtn) {
            bannerBtn.textContent = "How to Install"; // write actionable items
            bannerBtn.onclick = () => {
                alert("To install on iOS:\n\n1. Click the 'Share' button at the bottom of Safari (the square box with an up arrow).\n2. Scroll down the menu options.\n3. Tap 'Add to Home Screen'."); // provide manual instruction dialog windows
            };
        }
        
        installBanner.classList.remove('hidden'); // display guidance elements
        installBanner.classList.add('flex'); // force structural parameters
    }
});

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // contain immediate deployment prompts safely
    deferredPWAInstallPrompt = e; // warehouse active hook properties
    
    const installBanner = document.getElementById('pwa-install-banner'); // pull installation containers
    if (installBanner && !isIOSDevice()) {
        installBanner.classList.remove('hidden'); // strip out hidden state markers
        installBanner.classList.add('flex'); // apply formatting layouts
    }
});

async function triggerNativePWAInstallation() {
    if (!deferredPWAInstallPrompt) return;
    
    deferredPWAInstallPrompt.prompt(); // prompt explicit installation windows forward
    const { outcome } = await deferredPWAInstallPrompt.userChoice; // analyze user selection data vectors
    
    deferredPWAInstallPrompt = null; // flush tracking references
    
    const installBanner = document.getElementById('pwa-install-banner'); // target display frameworks
    if (installBanner) {
        installBanner.classList.add('hidden'); // fold dashboard containers
        installBanner.classList.remove('flex'); // drop active styling dimensions
    }
}

// Function to manually dismiss the PWA install banner
function closePwaBanner() {
    const installBanner = document.getElementById('pwa-install-banner');
    if (installBanner) {
        installBanner.classList.add('hidden');
        installBanner.classList.remove('flex');
    }
}

window.addEventListener('appinstalled', () => {
    deferredPWAInstallPrompt = null; // drop tracking references upon verification completion
    const installBanner = document.getElementById('pwa-install-banner'); // parse tracking rows
    if (installBanner) {
        installBanner.classList.add('hidden'); // clear ribbons away instantly
        installBanner.classList.remove('flex'); // remove display dimensions
    }
});

// ==========================================
// MODULE 7: CREDITS MODAL CONTROLLER
// ==========================================
function toggleCreditsModal() {
    const modal = document.getElementById('credits-modal'); // hook structural layout modals
    if (!modal) return;
    
    if (modal.classList.contains('hidden')) {
        modal.classList.remove('hidden'); // draw modal frames forward
        modal.classList.add('flex'); // adjust center layer structures
    } else {
        modal.classList.add('hidden'); // clamp display configurations
        modal.classList.remove('flex'); // clear formatting contexts
    }
}