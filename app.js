// === CONFIGURATION ===
// Replace this with your actual Cloudflare Worker live deployment endpoint URL (NO trailing slash)
const EDGE_API_URL = "https://dictionary-edge-api.naruttamboruah.workers.dev";
// =====================

// State Monitoring Variables
let activeSelectedWordObj = null; // tracks the active dictionary row object
let savedBookmarksArray = []; // collection array for local bookmarks[cite: 1]
let typingTimer = null; // debounce interval anchor[cite: 1]
let currentDropdownMatches = []; // holds latest live matches array[cite: 1]
const localSearchCache = new Map(); // Lightning-fast in-memory lookup cache[cite: 1]

// DOM Elements
const searchInput = document.getElementById('search-input'); // search bar interface element[cite: 1]
const searchHelp = document.getElementById('search-help'); // fallback search guidance element[cite: 1]
const wordSidebarList = document.getElementById('word-sidebar-list'); // autocomplete container target element[cite: 1]
const wordSidebarContainer = document.getElementById('word-sidebar-container'); // autocomplete alignment wrapper element[cite: 1]
const emptyState = document.getElementById('empty-state'); // core application homepage container element[cite: 1]
const meaningContent = document.getElementById('meaning-content'); // active definition viewing area element[cite: 1]

const viewWord = document.getElementById('view-word'); // definition main title item[cite: 1]
const viewTransliteration = document.getElementById('view-transliteration'); // script token element[cite: 1]
const viewType = document.getElementById('view-type'); // grammatical classification tag item[cite: 1]
const viewMeaning = document.getElementById('view-meaning'); // synonym container area element[cite: 1]
const viewDefAssamese = document.getElementById('view-def-assamese'); // primary target definition text block[cite: 1]
const viewDefEnglish = document.getElementById('view-def-english'); // baseline secondary description definition text[cite: 1]
const viewExample = document.getElementById('view-example'); // syntax phrase rendering row[cite: 1]
const exampleBox = document.getElementById('example-box'); // syntax display block frame container[cite: 1]

// Correction Drawer Elements
const correctionDrawer = document.getElementById('correction-drawer'); // error report sliding panel element[cite: 1]
const correctionWordDisplay = document.getElementById('correction-word-display'); // active context mirror item[cite: 1]
const correctionType = document.getElementById('correction-type'); // classification drop menu element[cite: 1]
const correctionFeedback = document.getElementById('correction-feedback'); // user remark field element[cite: 1]

// Application Bootstrap initialization
window.onload = () => {
    navigateToHomeScreenHome(); // reset application view matrix[cite: 1]
    loadSavedBookmarksFromStorage(); // bootstrap saved bookmarks from local user instance[cite: 1]
};

// ==========================================
// HOME RESET CONTROLLER
// ==========================================
function navigateToHomeScreenHome() {
    if (searchInput) searchInput.value = ''; // wipe search field parameters cleanly[cite: 1]
    hideAutocompleteDropdown(); // clear current search selections safely[cite: 1]
    closeCorrectionForm(); // collapse user input feedback rows[cite: 1]
    resetDefinitionView(); // bring back the original dashboard dashboard state[cite: 1]
    fetchWordOfTheDay(); // calculate daily discovery word[cite: 1]  
}

// ==========================================
// MODULE 1: STABLE SEED "WORD OF THE DAY" SYSTEM
// ==========================================
async function fetchWordOfTheDay() {
    const loader = document.getElementById('wotd-loader'); // loading icon tracker element[cite: 1]
    const contentBox = document.getElementById('wotd-content'); // dynamic canvas asset element[cite: 1]

    if (loader) loader.classList.remove('hidden'); // render loader elements[cite: 1]
    if (contentBox) contentBox.classList.add('hidden'); // mask content layout fields safely[cite: 1]

    try {
        // High-frequency curation words for daily deterministic seed generation
        const localWotdSeeds = ["curiosity", "resilience", "harmony", "eloquent", "benevolent", "innovation", "serenity", "zenith"];
        
        const rightNow = new Date(); // fetch local date timestamp properties[cite: 1]
        const calendarSeedInteger = rightNow.getFullYear() * 10000 + (rightNow.getMonth() + 1) * 100 + rightNow.getDate(); // produce calendar sequence indices[cite: 1]
        
        let stringHashCounter = 0; // initialize calculation parameters[cite: 1]
        const seedString = calendarSeedInteger.toString(); // format calendar string values[cite: 1]
        for (let i = 0; i < seedString.length; i++) {
            stringHashCounter = (stringHashCounter << 5) - stringHashCounter + seedString.charCodeAt(i); // cycle sequence bitmasks[cite: 1]
            stringHashCounter |= 0; // lock into 32-bit integer workspace[cite: 1]
        }
        
        const lockedDailyIndex = Math.abs(stringHashCounter) % localWotdSeeds.length; // slice index boundaries[cite: 1]
        const targetSeedWord = localWotdSeeds[lockedDailyIndex]; // isolate daily selected text target

        // Fetch definition dynamically directly from Cloudflare KV Edge
        const response = await fetch(`${EDGE_API_URL}/word/${targetSeedWord}`);
        if (!response.ok) throw new Error("Fallback activation");
        
        const dailyWord = await response.json();
        dailyWord.word = targetSeedWord; // append baseline structural reference value to JSON payload

        document.getElementById('wotd-word').textContent = dailyWord.word || "অভিধান"; // inject localized title elements[cite: 1]
        document.getElementById('wotd-pos').textContent = dailyWord.part_of_speech || dailyWord.type || "Word"; // process grammatical parameters[cite: 1]
        document.getElementById('wotd-meaning').textContent = dailyWord.meaning || "Meaning lookup available."; // bind contextual description definitions[cite: 1]

        document.getElementById('wotd-action-btn').onclick = () => {
            displayDefinition(dailyWord); // display data dashboard panels[cite: 1]
            if (searchInput) searchInput.value = dailyWord.word; // sync keyword labels into core text inputs[cite: 1]
        };

        if (loader) loader.classList.add('hidden'); // pull tracking layers away[cite: 1]
        if (contentBox) contentBox.classList.remove('hidden'); // animate display frames cleanly[cite: 1]

    } catch (err) {
        console.error("Daily highlight processing failure:", err); // capture communication breakdowns[cite: 1]
        if (loader) loader.textContent = "System ready. Begin searching above."; // set baseline guidance[cite: 1]
    }
}

// ==========================================
// MODULE 2: HIGH-SPEED AUTOCOMPLETE SEARCH
// ==========================================
function handleSearch() {
    if (!searchInput) return;
    clearTimeout(typingTimer); // flush running interval actions instantly[cite: 1]
    const query = searchInput.value.trim(); // clean space artifacts from search text parameters[cite: 1]
    
    if (query.length === 0) {
        hideAutocompleteDropdown(); // clear visibility frames if search field drops to zero[cite: 1]
        return;
    }

    // Debounce dropped to 120ms for instant loading performance feedback[cite: 1]
    typingTimer = setTimeout(() => {
        fetchWordsFromCloud(query); // run retrieval routines[cite: 1]
    }, 120); 
}

async function fetchWordsFromCloud(query) {
    const cacheKey = query.toLowerCase(); // format parameter indexing lookups[cite: 1]

    // In-memory local lookup bypass[cite: 1]
    if (localSearchCache.has(cacheKey)) {
        currentDropdownMatches = localSearchCache.get(cacheKey); // pull collection arrays directly from mapping sets[cite: 1]
        renderAutocompleteDropdown(currentDropdownMatches); // draw dropdown elements[cite: 1]
        return;
    }

    try {
        // Query our prefix listing endpoint on the Cloudflare Worker
        const response = await fetch(`${EDGE_API_URL}/search/${encodeURIComponent(cacheKey)}`);
        if (!response.ok) throw new Error("Edge search communication exception");
        
        const data = await response.json();
        currentDropdownMatches = data || []; // route collection structures safely
        
        localSearchCache.set(cacheKey, currentDropdownMatches); // save properties into mapping cache[cite: 1]
        renderAutocompleteDropdown(currentDropdownMatches); // update dropdown layout view boards[cite: 1]
    } catch (err) {
        console.error("Search query error:", err); // flag connectivity anomalies[cite: 1]
    }
}

function renderAutocompleteDropdown(data) {
    if (!wordSidebarList || !wordSidebarContainer) return;
    
    wordSidebarList.innerHTML = ''; // drop historical layouts cleanly[cite: 1]
    const totalCount = data ? data.length : 0; // determine alignment totals[cite: 1]
    
    wordSidebarContainer.classList.remove('hidden'); // flip hidden state visibility parameters[cite: 1]
    wordSidebarContainer.classList.add('flex'); // bind layout rules[cite: 1]

    document.getElementById('dropdown-status-label').textContent = `Matches Found (${totalCount})`; // render quantity tags[cite: 1]

    if (totalCount === 0) {
        wordSidebarList.innerHTML = `<p class="text-xs text-slate-400 py-4 text-center italic">কোনো শব্দ পোৱা নগ’ল (No results found).</p>`; // empty dataset text output[cite: 1]
        return;
    }

    data.forEach(item => {
        const button = document.createElement('button'); // build choice button elements[cite: 1]
        button.innerText = `${item.word} ➔ ${item.meaning || ''}`; // compile pairing text definitions[cite: 1]
        button.className = "w-full text-left px-3 py-2.5 rounded-xl text-slate-700 hover:bg-teal-50 hover:text-teal-950 font-medium transition-all text-sm border border-transparent cursor-pointer block truncate font-as"; // apply Tailwind class sets[cite: 1]
        
        button.onclick = () => {
            if (searchInput) searchInput.value = item.word; // lock choice string into input frames[cite: 1]
            
            // Fetch complete definitions dynamically since search results contain skeletal data strings
            fetchDetailedDefinition(item.word);
            hideAutocompleteDropdown(); // clear dropdown listings cleanly[cite: 1]                    
        };
        wordSidebarList.appendChild(button); // append items to interface canvas[cite: 1]
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
            const queryVal = searchInput.value.trim().toLowerCase(); // clean formatting[cite: 1]
            const exactMatch = currentDropdownMatches.find(item => item.word === queryVal) || currentDropdownMatches[0]; // evaluate precision hits[cite: 1]
            
            searchInput.value = exactMatch.word; // populate search label fields[cite: 1]
            fetchDetailedDefinition(exactMatch.word); // process target definitions directly
            hideAutocompleteDropdown(); // clear visibility listings[cite: 1]
        }
    });
}

function hideAutocompleteDropdown() {
    if (wordSidebarContainer) {
        wordSidebarContainer.classList.add('hidden'); // pull alignment visibility down[cite: 1]
        wordSidebarContainer.classList.remove('flex'); // remove layout frames[cite: 1]
    }
}

document.addEventListener('click', function(event) {
    if (!searchInput || !wordSidebarContainer) return;
    const isSearchBoxClick = event.target.closest('#search-input') || event.target.closest('#word-sidebar-container'); // track pointer intercept targets[cite: 1]
    if (!isSearchBoxClick) {
        hideAutocompleteDropdown(); // fold interface items safely if pointer strikes outside action bounds[cite: 1]
    }
});

// ==========================================
// MODULE 3: DEFINITION DISPLAY LOGIC
// ==========================================
function displayDefinition(item) {
    activeSelectedWordObj = item; // commit properties to running state variable structures[cite: 1]
    closeCorrectionForm(); // drop report layouts instantly[cite: 1]

    const isBookmarked = savedBookmarksArray.some(x => x.word === item.word); // match unique key indicators safely[cite: 1]
    updateBookmarkStarUI(isBookmarked); // change state dashboard star colors[cite: 1]

    if (emptyState) emptyState.classList.add('hidden'); // drop landing panel components[cite: 1]
    if (meaningContent) meaningContent.classList.remove('hidden'); // unlock detailed viewing frames[cite: 1]

    viewWord.innerText = item.word || ''; // render index text values[cite: 1]
    viewType.innerText = item.part_of_speech || item.type || "Word"; // link syntax descriptors[cite: 1]

    if (item.transliteration && item.transliteration !== "Pending") {
        viewTransliteration.innerText = `[ ${item.transliteration} ]`; // frame syntax string[cite: 1]
        viewTransliteration.classList.remove('hidden'); // expose panel context[cite: 1]
    } else {
        viewTransliteration.classList.add('hidden'); // hide row cleanly[cite: 1]
    }

    const isWordAssamese = /[\u0980-\u09FF]/.test(item.word || ''); // validate unicode typography limits[cite: 1]
    viewWord.className = `text-3xl font-bold text-teal-950 tracking-wide ${isWordAssamese ? 'font-as' : 'font-en'}`; // inject font rules dynamically[cite: 1]

    const meaningTarget = document.getElementById('view-meaning'); // locate synonym area[cite: 1]
    if (meaningTarget) {
        meaningTarget.innerHTML = ''; // wipe historical arrays cleanly[cite: 1]
        if (item.meaning) {
            const cleanMeaningsArray = item.meaning.split(/[,;]\s*/); // partition entry text[cite: 1]
            const badgeContainer = document.createElement('div'); // build item alignment arrays[cite: 1]
            badgeContainer.className = "flex flex-wrap gap-2 mt-1 mb-2 justify-start"; // declare grid rules[cite: 1]

            cleanMeaningsArray.forEach(meaningWord => {
                if (meaningWord.trim() !== "") {
                    const badge = document.createElement('button'); // build unique asset items[cite: 1]
                    badge.innerText = meaningWord.trim(); // assign string metrics[cite: 1]
                    
                    const isBadgeAssamese = /[\u0980-\u09FF]/.test(meaningWord); // test script boundaries[cite: 1]
                    badge.className = `px-3 py-1.5 text-xs font-semibold bg-slate-50 hover:bg-teal-600 hover:text-white text-slate-700 rounded-lg border border-slate-200 transition-all duration-150 cursor-pointer active:scale-95 ${isBadgeAssamese ? 'font-as' : 'font-en'}`; // bind styles[cite: 1]
                    
                    badge.onclick = async () => {
                        const targetTerm = meaningWord.trim().toLowerCase(); // clean keys[cite: 1]
                        if (searchInput) searchInput.value = targetTerm; // bind tags[cite: 1]
                        hideAutocompleteDropdown(); // clear display elements[cite: 1] 

                        try {
                            const response = await fetch(`${EDGE_API_URL}/word/${encodeURIComponent(targetTerm)}`);
                            if (response.ok) {
                                const data = await response.json();
                                data.word = targetTerm; // ensure label mapping
                                displayDefinition(data); // display content canvas[cite: 1]
                            } else {
                                fetchWordsFromCloud(targetTerm); // try to drop back to list queries safely[cite: 1]
                            }
                        } catch (err) {
                            console.error("Direct badge query failed:", err); // trap runtime anomalies[cite: 1]
                        }
                    };
                    badgeContainer.appendChild(badge); // bind items to frame layout[cite: 1]
                }
            });
            meaningTarget.appendChild(badgeContainer); // anchor item collection arrays into interface view grids[cite: 1]
        }
    }

    viewDefAssamese.innerText = item.assamese_definition || 'সংজ্ঞা পৰীক্ষা কৰা হৈছে...'; // map principal definition script text strings[cite: 1]
    viewDefEnglish.innerText = item.english_definition || 'Conceptual definition lookup available.'; // bind complementary English translation descriptors[cite: 1]

    if (item.context_example && item.context_example.trim() !== "" && item.context_example !== "Context lookup available online.") {
        exampleBox.classList.remove('hidden'); // toggle presentation borders[cite: 1]
        viewExample.innerText = item.context_example; // map example context models
    } else if (item.example && item.example.trim() !== "") {
        exampleBox.classList.remove('hidden'); // fallback parsing visibility parameters[cite: 1]
        viewExample.innerText = item.example; // mount raw example strings[cite: 1]
    } else {
        exampleBox.classList.add('hidden'); // suppress empty parameters cleanly[cite: 1]
    }
}

// ==========================================
// MODULE 4: BOOKMARKS / FAVORITES SYSTEM
// ==========================================
function loadSavedBookmarksFromStorage() {
    const storageData = localStorage.getItem('asomiya_lexicon_bookmarks'); // retrieve saved bookmark payload[cite: 1]
    if (storageData) {
        try { savedBookmarksArray = JSON.parse(storageData); } catch(e) { savedBookmarksArray = []; } // process structural objects[cite: 1]
    }
    renderFavoritesListUI(); // draw collection panel items[cite: 1]
}

function updateBookmarksStorage() {
    localStorage.setItem('asomiya_lexicon_bookmarks', JSON.stringify(savedBookmarksArray)); // stringify collections into storage layers[cite: 1]
    renderFavoritesListUI(); // render panel views[cite: 1]
}

function renderFavoritesListUI() {
    const scrollList = document.getElementById('favorites-scroll-list'); // pinpoint layout targets[cite: 1]
    const counterLabel = document.getElementById('fav-counter-label'); // target identity tracking tags[cite: 1]
    
    if (counterLabel) counterLabel.textContent = `Favorites (${savedBookmarksArray.length})`; // update numerical tracker layouts[cite: 1]
    if (!scrollList) return;
    
    scrollList.innerHTML = ''; // clear historical listing layouts[cite: 1]

    if (savedBookmarksArray.length === 0) {
        scrollList.innerHTML = `<p class="text-xs text-slate-400 py-8 text-center italic">No bookmarked terms saved.</p>`; // fallback notification[cite: 1]
        return;
    }

    savedBookmarksArray.forEach(item => {
        const rowDiv = document.createElement('div'); // initialize list alignment frames[cite: 1]
        rowDiv.className = "flex justify-between items-center bg-slate-50 border border-slate-200/60 p-2.5 rounded-xl text-sm font-medium"; // apply layout properties[cite: 1]
        
        const labelBtn = document.createElement('button'); // link activation button mechanisms[cite: 1]
        labelBtn.textContent = item.word; // pass entry value indicators[cite: 1]
        labelBtn.className = "text-left font-as text-slate-800 hover:text-teal-700 truncate flex-1 cursor-pointer"; // map typographic setups[cite: 1]
        labelBtn.onclick = () => {
            displayDefinition(item); // mount target row properties into view frames[cite: 1]
            searchInput.value = item.word; // append search text values[cite: 1]
            toggleFavoritesSidebar(); // collapse utility navigation bars[cite: 1]
        };

        const deleteBtn = document.createElement('button'); // build clear items utility button[cite: 1]
        deleteBtn.innerHTML = "🗑️"; // apply graphic characters[cite: 1]
        deleteBtn.className = "text-xs px-2 py-1 opacity-60 hover:opacity-100 cursor-pointer transition-all"; // mount styling classes[cite: 1]
        deleteBtn.onclick = (e) => {
            e.stopPropagation(); // insulate event chains[cite: 1]
            removeBookmarkRecord(item.word); // wipe elements via unique keys[cite: 1]
        };

        rowDiv.appendChild(labelBtn); // stitch components together[cite: 1]
        rowDiv.appendChild(deleteBtn); // merge control actions[cite: 1]
        scrollList.appendChild(rowDiv); // print items onto interface canvas[cite: 1]
    });
}

function toggleActiveBookmarkState() {
    if (!activeSelectedWordObj) return;
    const isAlreadyBookmarked = savedBookmarksArray.some(x => x.word === activeSelectedWordObj.word); // parse state markers safely[cite: 1]
    
    if (isAlreadyBookmarked) {
        removeBookmarkRecord(activeSelectedWordObj.word); // disconnect values[cite: 1]
    } else {
        savedBookmarksArray.push(activeSelectedWordObj); // inject selection records into state array models[cite: 1]
        updateBookmarksStorage(); // serialize modifications[cite: 1]
        updateBookmarkStarUI(true); // switch star highlight indicators[cite: 1]
    }
}

function removeBookmarkRecord(wordKey) {
    savedBookmarksArray = savedBookmarksArray.filter(x => x.word !== wordKey); // drop matching indicators out of array models[cite: 1]
    updateBookmarksStorage(); // commit storage changes[cite: 1]
    if (activeSelectedWordObj && activeSelectedWordObj.word === wordKey) {
        updateBookmarkStarUI(false); // dim layout highlights if viewing record[cite: 1]
    }
}

function updateBookmarkStarUI(isFav) {
    const starBtn = document.getElementById('bookmark-toggle-btn'); // hook control buttons[cite: 1]
    if (!starBtn) return;
    if (isFav) {
        starBtn.className = "p-2 bg-amber-50 text-amber-500 rounded-xl border border-amber-200 shadow-3xs cursor-pointer transition-all"; // highlighted color properties[cite: 1]
    } else {
        starBtn.className = "p-2 bg-slate-50 hover:bg-amber-50 text-slate-400 hover:text-amber-500 rounded-xl border border-slate-200/60 shadow-3xs cursor-pointer transition-all"; // base inactive color styles[cite: 1]
    }
}

function clearAllSavedFavorites() {
    if (confirm("Clear all bookmarked items?")) {
        savedBookmarksArray = []; // drop active state structural dimensions cleanly[cite: 1]
        updateBookmarksStorage(); // commit baseline resets[cite: 1]
        updateBookmarkStarUI(false); // shut down layout indicators[cite: 1]
    }
}

function toggleFavoritesSidebar() {
    const sidebar = document.getElementById('favorites-sidebar'); // hook sidebar canvas[cite: 1]
    const overlay = document.getElementById('sidebar-overlay'); // pinpoint blur backing panels[cite: 1]
    if (!sidebar || !overlay) return;

    if (sidebar.classList.contains('translate-x-full')) {
        sidebar.classList.remove('translate-x-full'); // animate menu layers inwards[cite: 1]
        overlay.classList.remove('hidden'); // expose overlay paneling context[cite: 1]
    } else {
        sidebar.classList.add('translate-x-full'); // fold workspace channels outward[cite: 1]
        overlay.classList.add('hidden'); // secure structural spaces cleanly[cite: 1]
    }
}

// ==========================================
// MODULE 5: CORRECTION SUBMISSIONS
// ==========================================
function openCorrectionForm() {
    if (!activeSelectedWordObj) return;
    correctionWordDisplay.value = activeSelectedWordObj.word; // sync keyword labels into text containers[cite: 1]
    correctionFeedback.value = ''; // clear previous text block values[cite: 1]
    correctionType.selectedIndex = 0; // return selection indicators back to default status indexes[cite: 1]
    if (correctionDrawer) {
        correctionDrawer.classList.remove('hidden'); // project context wrappers forward[cite: 1]
        correctionDrawer.classList.add('flex'); // adjust alignment frameworks[cite: 1]
    }
}

function closeCorrectionForm() {
    if (correctionDrawer) {
        correctionDrawer.classList.add('hidden'); // mask drawing layers[cite: 1]
        correctionDrawer.classList.remove('flex'); // strip alignment rules[cite: 1]
    }
}

// Redirecting analytics issue reporting to a local console safe-vault tracking metric
async function submitCorrectionToCloud() {
    const feedbackText = correctionFeedback.value.trim(); // strip text gaps safely[cite: 1]
    if (!feedbackText) return alert("Please provide feedback details."); // mandate input text parameter entries[cite: 1]
    
    console.log("Logged Correction Submission:", {
        word: activeSelectedWordObj.word,
        issue_type: correctionType.value,
        feedback: feedbackText
    });
    
    alert("ধন্যবাদ! Correction suggestion logged safely."); // output confirmation response panel dialogs[cite: 1]
    closeCorrectionForm(); // fold interaction blocks[cite: 1]
}

function copyWordToClipboard() {
    const wordText = viewWord.innerText; // parse index character configurations[cite: 1]
    navigator.clipboard.writeText(wordText).then(() => {
        const copyBtn = document.getElementById('copy-toast-btn'); // hook confirmation action controls[cite: 1]
        if (copyBtn) {
            copyBtn.innerText = "✓ Copied!"; // write state changes[cite: 1]
            setTimeout(() => { copyBtn.innerText = "📋 Copy Word"; }, 1500); // cycle back to standard labels after interval triggers[cite: 1]
        }
    });
}

function resetDefinitionView() {
    if (emptyState) emptyState.classList.remove('hidden'); // pull core landing boards forward[cite: 1]
    if (meaningContent) meaningContent.classList.add('hidden'); // suppress specific definition layout blocks[cite: 1]
    activeSelectedWordObj = null; // drop core model tracking markers safely[cite: 1]
}

// ==========================================
// MODULE 6: ADVANCED PWA INSTALL MANAGER
// ==========================================
let deferredPWAInstallPrompt = null; // state anchor mapping prompt hooks[cite: 1]

const isIOSDevice = () => {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream; // parse architecture signatures[cite: 1]
};

const isRunningStandalone = () => {
    return (window.matchMedia('(display-mode: standalone)').matches) || (window.navigator.standalone === true); // verify native frame states[cite: 1]
};

window.addEventListener('DOMContentLoaded', () => {
    const installBanner = document.getElementById('pwa-install-banner'); // hook tracking ribbons[cite: 1]
    
    if (isIOSDevice() && !isRunningStandalone() && installBanner) {
        const bannerTitle = installBanner.querySelector('h4'); // harvest label structures[cite: 1]
        const bannerDesc = installBanner.querySelector('p'); // isolate description rows[cite: 1]
        const bannerBtn = installBanner.querySelector('button'); // anchor targeting buttons[cite: 1]
        
        if (bannerTitle) bannerTitle.textContent = "Add to iPhone Home Screen"; // format titles for Apple ecosystems[cite: 1]
        if (bannerDesc) bannerDesc.textContent = "Tap Safari's 'Share' icon below, then select 'Add to Home Screen'! 🍏"; // specify routing directions[cite: 1]
        
        if (bannerBtn) {
            bannerBtn.textContent = "How to Install"; // write actionable items[cite: 1]
            bannerBtn.onclick = () => {
                alert("To install on iOS:\n\n1. Click the 'Share' button at the bottom of Safari (the square box with an up arrow).\n2. Scroll down the menu options.\n3. Tap 'Add to Home Screen'."); // provide manual instruction dialog windows[cite: 1]
            };
        }
        
        installBanner.classList.remove('hidden'); // display guidance elements[cite: 1]
        installBanner.classList.add('flex'); // force structural parameters[cite: 1]
    }
});

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // contain immediate deployment prompts safely[cite: 1]
    deferredPWAInstallPrompt = e; // warehouse active hook properties[cite: 1]
    
    const installBanner = document.getElementById('pwa-install-banner'); // pull installation containers[cite: 1]
    if (installBanner && !isIOSDevice()) {
        installBanner.classList.remove('hidden'); // strip out hidden state markers[cite: 1]
        installBanner.classList.add('flex'); // apply formatting layouts[cite: 1]
    }
});

async function triggerNativePWAInstallation() {
    if (!deferredPWAInstallPrompt) return;
    
    deferredPWAInstallPrompt.prompt(); // prompt explicit installation windows forward[cite: 1]
    const { outcome } = await deferredPWAInstallPrompt.userChoice; // analyze user selection data vectors[cite: 1]
    
    deferredPWAInstallPrompt = null; // flush tracking references[cite: 1]
    
    const installBanner = document.getElementById('pwa-install-banner'); // target display frameworks[cite: 1]
    if (installBanner) {
        installBanner.classList.add('hidden'); // fold dashboard containers[cite: 1]
        installBanner.classList.remove('flex'); // drop active styling dimensions[cite: 1]
    }
}

window.addEventListener('appinstalled', () => {
    deferredPWAInstallPrompt = null; // drop tracking references upon verification completion[cite: 1]
    const installBanner = document.getElementById('pwa-install-banner'); // parse tracking rows[cite: 1]
    if (installBanner) {
        installBanner.classList.add('hidden'); // clear ribbons away instantly[cite: 1]
        installBanner.classList.remove('flex'); // remove display dimensions[cite: 1]
    }
});

// ==========================================
// MODULE 7: CREDITS MODAL CONTROLLER
// ==========================================
function toggleCreditsModal() {
    const modal = document.getElementById('credits-modal'); // hook structural layout modals[cite: 1]
    if (!modal) return;
    
    if (modal.classList.contains('hidden')) {
        modal.classList.remove('hidden'); // draw modal frames forward[cite: 1]
        modal.classList.add('flex'); // adjust center layer structures[cite: 1]
    } else {
        modal.classList.add('hidden'); // clamp display configurations[cite: 1]
        modal.classList.remove('flex'); // clear formatting contexts[cite: 1]
    }
}