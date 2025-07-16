// Fetch and render UFC events from the real JSON file
let allEvents = [];
let currentEventIndex = 0;
let fightersData = {};
let rankingsData = [];
let octagonFightersData = {};
let predictionsData = [];

// Octagon API base URL
const OCTAGON_API_BASE = 'https://api.octagon-api.com';

// Refactor: Fetch all data with no cache
async function fetchAllData() {
  const [events, fighters, predictions] = await Promise.all([
    fetch('src/data/ufc_events.json', { cache: 'no-store' }).then(r => r.json()),
    fetch('src/data/fighter_profiles.json', { cache: 'no-store' }).then(r => r.json()),
    fetch('src/data/predictions.json', { cache: 'no-store' }).then(r => r.json()).catch(() => []),
  ]);
  return { events, fighters, predictions };
}

// Refactor: Refresh all data and re-render UI
async function refreshAllData() {
  try {
    const { events, fighters, predictions } = await fetchAllData();
    allEvents = events;
    fightersData = fighters;
    predictionsData = predictions;
    renderSidebar(allEvents);
    renderEvents(allEvents);
    setupModal();
    setupNav();
    // If on AI tab, re-render AI analysis
    const aiRoot = document.getElementById('ai-analysis-root');
    if (aiRoot && aiRoot.style.display !== 'none') {
      showAIAnalysisPage();
    }
  } catch (err) {
    document.getElementById('events-root').textContent = 'Failed to load event data.';
    console.error(err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  refreshAllData();
  // setInterval(refreshAllData, 60000); // Removed auto-refresh
});

async function loadFightersData() {
  try {
    // Load Octagon API fighters for rankings
    const octagonRes = await fetch(`${OCTAGON_API_BASE}/fighters`);
    octagonFightersData = await octagonRes.json();
    // Load local profile fighters for schedule/modal
    const profileRes = await fetch('src/data/fighter_profiles.json');
    fightersData = await profileRes.json();
    console.log('Loaded fighters data:', Object.keys(fightersData).length, 'profile fighters,', Object.keys(octagonFightersData).length, 'octagon fighters');
  } catch (error) {
    console.error('Failed to load fighters data:', error);
    fightersData = {};
    octagonFightersData = {};
  }
}

function findProfileFighterByName(fighterName) {
  if (!fighterName) return null;
  if (fightersData[fighterName]) return { name: fighterName, ...fightersData[fighterName] };
  for (const [name, data] of Object.entries(fightersData)) {
    if (name.toLowerCase() === fighterName.toLowerCase()) return { name, ...data };
  }
  for (const [name, data] of Object.entries(fightersData)) {
    if (name.toLowerCase().includes(fighterName.toLowerCase()) || fighterName.toLowerCase().includes(name.toLowerCase())) return { name, ...data };
  }
  return null;
}

function findOctagonFighterByName(fighterName) {
  if (!fighterName) return null;
  for (const [id, fighter] of Object.entries(octagonFightersData)) {
    if (fighter.name && fighter.name.toLowerCase() === fighterName.toLowerCase()) return { id, ...fighter };
  }
  for (const [id, fighter] of Object.entries(octagonFightersData)) {
    if (fighter.name && (fighter.name.toLowerCase().includes(fighterName.toLowerCase()) || fighterName.toLowerCase().includes(fighter.name.toLowerCase()))) return { id, ...fighter };
  }
  return null;
}

function getProfileFighterImageUrl(fighterData) {
  if (!fighterData) return null;
  if (fighterData.profile_image_url) return fighterData.profile_image_url;
  return null;
}

function getOctagonFighterImageUrl(fighterData) {
  if (!fighterData) return null;
  if (fighterData.imgUrl) return fighterData.imgUrl;
  return null;
}

// --- Fix: Always show Results/Schedule tabs, clicking sidebar event scrolls/highlights, never hides tabs/lists ---
function renderSidebar(events) {
  const sidebar = document.getElementById('events-sidebar');
  sidebar.innerHTML = '';
  const now = new Date();
  // Only show future events in sidebar, using same logic as above
  const futureEvents = events.filter(event => {
    const eventDate = parseUfcDate(event.event_date);
    return eventDate - now >= 0;
  });
  futureEvents.forEach((event) => {
    const link = document.createElement('div');
    link.className = 'event-link';
    // Detect if event is PPV (numbered UFC event)
    const isPPV = /^UFC \d+/.test(event.event_name);
    if (isPPV) {
      link.classList.add('event-ppv');
    } else {
      link.classList.add('event-fightnight');
    }
    // Show event name and date
    link.innerHTML = event.event_name;
    // Add date subhead
    const dateSpan = document.createElement('span');
    dateSpan.className = 'event-link-date';
    dateSpan.textContent = formatDate(event.event_date);
    link.appendChild(dateSpan);
    // Add side color tag
    const tag = document.createElement('div');
    tag.className = 'event-link-tag';
    if (isPPV) {
      tag.classList.add('gold');
    } else {
      tag.classList.add('red');
    }
    link.appendChild(tag);
    link.onclick = () => {
      // Scroll to the event card in the main list (Schedule tab)
      // Always show tabs/lists, just scroll/highlight
      const now = new Date();
      const futureEvents = allEvents.filter(e => {
        const eventDate = parseUfcDate(e.event_date);
        return eventDate - now >= 0;
      });
      // Find index in futureEvents
      const idx = futureEvents.findIndex(e => e.event_name === event.event_name && e.event_date === event.event_date);
      // Switch to Schedule tab if not already
      const scheduleTab = document.querySelector('.subtab-btn:last-child');
      if (scheduleTab && !scheduleTab.classList.contains('active')) scheduleTab.click();
      setTimeout(() => {
        const scheduleList = document.querySelector('.events-list.schedule-list');
        if (scheduleList) {
          const cards = scheduleList.querySelectorAll('.event-card');
          if (cards[idx]) {
            cards[idx].scrollIntoView({ behavior: 'smooth', block: 'start' });
            cards[idx].classList.add('highlighted');
            setTimeout(() => cards[idx].classList.remove('highlighted'), 2000);
          }
        }
      }, 100);
    };
    sidebar.appendChild(link);
  });
}

// --- Add highlight style for event-card ---
// ... existing code ...
// (add to CSS: .event-card.highlighted { box-shadow: 0 0 0 3px #e11d48, 0 2px 12px rgba(0,0,0,0.18); })

// --- Fix: Always show Results/Schedule tabs, never hide them ---
function showEvent(index) {
  // Instead of replacing the main area, just scroll/highlight in the list
  const event = allEvents[index];
  // Find if event is in future or past
  const now = new Date();
  const isFuture = parseUfcDate(event.event_date) >= now;
  // Switch to correct tab
  const tabBtn = document.querySelector('.subtab-btn' + (isFuture ? ':last-child' : ':first-child'));
  if (tabBtn && !tabBtn.classList.contains('active')) tabBtn.click();
  setTimeout(() => {
    const listClass = isFuture ? '.events-list.schedule-list' : '.events-list.results-list';
    const list = document.querySelector(listClass);
    if (list) {
      const cards = list.querySelectorAll('.event-card');
      // Find by event name/date
      const idx = Array.from(cards).findIndex(card => card.querySelector('.event-title')?.textContent === event.event_name);
      if (cards[idx]) {
        cards[idx].scrollIntoView({ behavior: 'smooth', block: 'center' });
        cards[idx].classList.add('highlighted');
        setTimeout(() => cards[idx].classList.remove('highlighted'), 2000);
      }
    }
  }, 100);
}

// --- Refactor renderBout for odds/records layout and results redesign ---
function renderBout(bout, isMainEvent = false, isPPV = false, isMainCard = false, isLatestEvent = false, resultData = null, isResultsPage = false) {
  const boutDiv = document.createElement('div');
  boutDiv.className = 'bout compact-bout';
  // Set width so names fit on one line (estimate 660px)
  boutDiv.style.maxWidth = isResultsPage ? '660px' : '';
  boutDiv.style.minWidth = isResultsPage ? '660px' : '';
  boutDiv.style.width = isResultsPage ? '660px' : '';
  boutDiv.style.margin = isResultsPage ? '0.5em auto' : '';
  // Add data attribute for bout identification
  const boutId = generateBoutId(bout);
  boutDiv.setAttribute('data-bout-id', boutId);
  if (isMainEvent) {
    boutDiv.classList.add('main-event');
    if (isPPV) {
      boutDiv.classList.add('championship-bout');
    }
  }
  if (isMainCard) {
    boutDiv.classList.add('main-card-bout');
  }
  // Only make clickable if not results page
  if (!isResultsPage) {
    boutDiv.onclick = () => showFighterDetails(bout);
  }
  // Fighters
  let fighterNames = 'TBD vs TBD';
  let leftHeadshot = null;
  let rightHeadshot = null;
  let winnerIdx = -1;
  let method = '', round = '', time = '', winnerName = '';
  if (resultData && resultData.fighters && resultData.fighters.length === 2) {
    winnerName = resultData.winner;
    if (bout.fighters[0].name === winnerName) winnerIdx = 0;
    else if (bout.fighters[1].name === winnerName) winnerIdx = 1;
    method = expandMethod(resultData.method);
    round = resultData.round;
    time = resultData.time;
  }
  if (bout.fighters && bout.fighters.length === 2) {
    const f1 = bout.fighters[0];
    const f2 = bout.fighters[1];
    fighterNames = `${f1.name || 'TBD'} vs ${f2.name || 'TBD'}`;
    const f1Data = findProfileFighterByName(f1.name);
    const f2Data = findProfileFighterByName(f2.name);
    const f1Img = getProfileFighterImageUrl(f1Data);
    const f2Img = getProfileFighterImageUrl(f2Data);
    leftHeadshot = f1Img ? document.createElement('img') : blankHeadshotSVG(40);
    if (f1Img) {
      leftHeadshot.src = f1Img;
      leftHeadshot.alt = f1.name;
      leftHeadshot.className = 'bout-headshot';
      leftHeadshot.onerror = () => {
        leftHeadshot.replaceWith(blankHeadshotSVG(40));
      };
    } else {
      leftHeadshot.className = 'bout-headshot nopfp';
    }
    rightHeadshot = f2Img ? document.createElement('img') : blankHeadshotSVG(40);
    if (f2Img) {
      rightHeadshot.src = f2Img;
      rightHeadshot.alt = f2.name;
      rightHeadshot.className = 'bout-headshot';
      rightHeadshot.onerror = () => {
        rightHeadshot.replaceWith(blankHeadshotSVG(40));
      };
    } else {
      rightHeadshot.className = 'bout-headshot nopfp';
    }
    // Highlight winner's headshot in green (for results)
    if (winnerIdx === 0) leftHeadshot.style.border = '3px solid #22c55e';
    if (winnerIdx === 1) rightHeadshot.style.border = '3px solid #22c55e';
  }
  // --- Compact layout: headshots, names, records, odds, winner ---
  const main = document.createElement('div');
  main.className = 'bout-main';
  main.style.display = 'flex';
  main.style.alignItems = 'center';
  main.style.justifyContent = 'space-between';
  // Left fighter
  const leftCol = document.createElement('div');
  leftCol.style.display = 'flex';
  leftCol.style.flexDirection = 'column';
  leftCol.style.alignItems = 'center';
  if (leftHeadshot) leftCol.appendChild(leftHeadshot);
  // Odds under headshot
  if (bout.fighters && bout.fighters[0].odds) {
    const oddsDiv = document.createElement('div');
    oddsDiv.className = 'bout-odds';
    oddsDiv.style.fontWeight = 'bold';
    oddsDiv.style.fontSize = '0.95rem';
    oddsDiv.style.color = '#fff';
    oddsDiv.style.marginTop = '0.1em';
    oddsDiv.textContent = bout.fighters[0].odds;
    leftCol.appendChild(oddsDiv);
  }
  main.appendChild(leftCol);
  // Center: records and names
  const centerCol = document.createElement('div');
  centerCol.style.display = 'flex';
  centerCol.style.flexDirection = 'column';
  centerCol.style.alignItems = 'center';
  // Names (no vertical dash/separator)
  const namesSpan = document.createElement('span');
  namesSpan.textContent = fighterNames;
  centerCol.appendChild(namesSpan);
  // Only show records if not results page
  if (!isResultsPage && bout.fighters && bout.fighters.length === 2) {
    const recs = document.createElement('div');
    recs.className = 'bout-records';
    recs.style.textAlign = 'center';
    recs.style.color = '#fff';
    recs.style.fontSize = '0.95rem';
    recs.textContent = `${bout.fighters[0].record || ''}  |  ${bout.fighters[1].record || ''}`;
    centerCol.appendChild(recs);
  }
  // Winner (explicit, only once, results page)
  let winnerDiv = null;
  if (isResultsPage && winnerName) {
    winnerDiv = document.createElement('div');
    winnerDiv.className = 'bout-winner';
    winnerDiv.style.color = '#22c55e';
    winnerDiv.style.fontSize = '0.97rem';
    winnerDiv.style.margin = '0';
    winnerDiv.style.padding = '0';
    winnerDiv.style.lineHeight = '1';
    winnerDiv.innerHTML = `<b>Winner:</b> ${winnerName}`;
    centerCol.appendChild(winnerDiv);
  }
  main.appendChild(centerCol);
  // Right fighter
  const rightCol = document.createElement('div');
  rightCol.style.display = 'flex';
  rightCol.style.flexDirection = 'column';
  rightCol.style.alignItems = 'center';
  if (rightHeadshot) rightCol.appendChild(rightHeadshot);
  // Odds under headshot
  if (bout.fighters && bout.fighters[1].odds) {
    const oddsDiv = document.createElement('div');
    oddsDiv.className = 'bout-odds';
    oddsDiv.style.fontWeight = 'bold';
    oddsDiv.style.fontSize = '0.95rem';
    oddsDiv.style.color = '#fff';
    oddsDiv.style.marginTop = '0.1em';
    oddsDiv.textContent = bout.fighters[1].odds;
    rightCol.appendChild(oddsDiv);
  }
  main.appendChild(rightCol);
  boutDiv.appendChild(main);
  // --- RESULTS: Show method/round/time on its own line below winner ---
  if (isResultsPage && resultData && (method || round || time)) {
    const resultDiv = document.createElement('div');
    resultDiv.className = 'bout-result-details';
    resultDiv.style.margin = '0';
    resultDiv.style.padding = '0';
    resultDiv.style.fontSize = '0.97rem';
    resultDiv.style.color = '#facc15';
    resultDiv.style.lineHeight = '1';
    resultDiv.style.fontWeight = 'normal';
    let resultText = '';
    if (method) resultText += method;
    if (round || time) {
      resultText += `${method ? ' ' : ''}`;
      if (round) {
        // Fix double R issue - check if round already has R prefix
        const roundText = round.toString().startsWith('R') ? round : `R${round}`;
        resultText += roundText;
      }
      if (time) {
        resultText += ` ${time}`;
      }
    }
    resultDiv.textContent = resultText.trim();
    // Append directly after winnerDiv if present, else to centerCol
    if (winnerDiv) {
      centerCol.appendChild(resultDiv);
    } else {
      centerCol.appendChild(resultDiv);
    }
  }
  // Add voting container for all main card bouts (main event, co-main, featured, etc.)
  // Only show voting for the latest event
  if (isMainCard && isLatestEvent && bout.fighters && bout.fighters.length === 2 && !isResultsPage) {
    const votingContainer = createVotingContainer(bout, boutId);
    boutDiv.appendChild(votingContainer);
  }
  return boutDiv;
}

// --- Redesign Results page to use new layout and info from ufc_results.json ---
function renderEvents(events) {
  const root = document.getElementById('events-root');
  root.innerHTML = '';
  // Sub-tab UI
  const tabs = document.createElement('div');
  tabs.className = 'events-subtabs';
  const resultsTab = document.createElement('button');
  resultsTab.className = 'subtab-btn'; // not active by default
  resultsTab.innerHTML = '<img src="src/assets/icons/results.png" alt="Results Icon" style="width:18px;height:18px;margin-right:6px;vertical-align:middle;" /> <span>Results</span>';
  const scheduleTab = document.createElement('button');
  scheduleTab.className = 'subtab-btn active'; // active by default
  scheduleTab.innerHTML = '<img src="src/assets/icons/schedule.png" alt="Schedule Icon" style="width:18px;height:18px;margin-right:6px;vertical-align:middle;" /> <span>Schedule</span>';
  tabs.appendChild(resultsTab);
  tabs.appendChild(scheduleTab);
  root.appendChild(tabs);
  // Event list containers
  const resultsList = document.createElement('div');
  resultsList.className = 'events-list results-list';
  const scheduleList = document.createElement('div');
  scheduleList.className = 'events-list schedule-list';
  scheduleList.style.display = '';
  resultsList.style.display = 'none';
  // Always show latest results from ufc_results.json
  fetch('src/data/ufc_results.json', { cache: 'no-store' }).then(r => r.json()).then(resultsJson => {
    if (resultsJson && resultsJson.bouts) {
      // Show event header
      const eventHeader = document.createElement('div');
      eventHeader.className = 'event-header';
      eventHeader.innerHTML = `<div class='event-title'>${resultsJson.event_name || ''}</div><div class='event-meta'>${resultsJson.event_date_str || ''}${resultsJson.event_location ? ' | ' + resultsJson.event_location : ''}</div>`;
      resultsList.appendChild(eventHeader);
      // Show all bouts
      resultsJson.bouts.forEach(bout => {
        resultsList.appendChild(renderBout({
          fighters: [
            { name: bout.fighters[0], odds: '', record: '' },
            { name: bout.fighters[1], odds: '', record: '' }
          ],
          label: bout.label
        }, false, false, false, false, bout, true));
      });
    } else {
      resultsList.innerHTML = '<div class="loading">No results available.</div>';
    }
    // Render future events (Schedule, right tab)
    const now = new Date();
    const futureEvents = events.filter(e => {
      const eventDate = parseUfcDate(e.event_date);
      return eventDate - now >= 0;
    });
    futureEvents.forEach(event => {
      scheduleList.appendChild(createEventCard(event));
    });
    root.appendChild(resultsList);
    root.appendChild(scheduleList);
    // Tab switching logic
    resultsTab.onclick = () => {
      resultsTab.classList.add('active');
      scheduleTab.classList.remove('active');
      resultsList.style.display = '';
      scheduleList.style.display = 'none';
    };
    scheduleTab.onclick = () => {
      scheduleTab.classList.add('active');
      resultsTab.classList.remove('active');
      resultsList.style.display = 'none';
      scheduleList.style.display = '';
    };
  });
}

function createEventCard(event, resultsData = {}) {
  const eventCard = document.createElement('div');
  eventCard.className = 'event-card';
  // Detect if event is PPV (numbered UFC event)
  const isPPV = /^UFC \d+/.test(event.event_name);
  if (isPPV) {
    eventCard.classList.add('event-ppv');
  } else {
    eventCard.classList.add('event-fightnight');
  }

  // Event header
  const header = document.createElement('div');
  header.className = 'event-header';

  const title = document.createElement('div');
  title.className = 'event-title';
  title.textContent = event.event_name || 'Unnamed Event';

  const meta = document.createElement('div');
  meta.className = 'event-meta';
  meta.textContent = `${formatDate(event.event_date)}${event.location ? ' | ' + event.location : ''}`;

  header.appendChild(title);
  header.appendChild(meta);
  eventCard.appendChild(header);

  // Check if this is the latest event (most recent date)
  const isLatestEvent = isLatestEventInList(event);

  // Main Card
  if (event.main_card && event.main_card.length > 0) {
    const mainCard = document.createElement('div');
    mainCard.className = 'fight-card';
    const mainLabel = document.createElement('div');
    mainLabel.style.fontWeight = 'bold';
    mainLabel.style.marginBottom = '0.3rem';
    mainLabel.textContent = 'Main Card';
    mainCard.appendChild(mainLabel);
    for (let i = 0; i < event.main_card.length; i++) {
      const bout = event.main_card[i];
      const isMainEvent = i === 0;
      let resultData = null;
      if (resultsData && bout.fighters && bout.fighters.length === 2) {
        const key = `${bout.fighters[0].name} vs ${bout.fighters[1].name}|${bout.label}`;
        resultData = resultsData[key];
      }
      mainCard.appendChild(renderBout(bout, isMainEvent, isPPV, true, isLatestEvent, resultData));
    }
    eventCard.appendChild(mainCard);
  }
  // Prelims
  if (event.prelims && event.prelims.length > 0) {
    const prelimCard = document.createElement('div');
    prelimCard.className = 'fight-card';
    const prelimLabel = document.createElement('div');
    prelimLabel.style.fontWeight = 'bold';
    prelimLabel.style.margin = '0.7rem 0 0.3rem 0';
    prelimLabel.textContent = 'Prelims';
    prelimCard.appendChild(prelimLabel);
    for (const bout of event.prelims) {
      let resultData = null;
      if (resultsData && bout.fighters && bout.fighters.length === 2) {
        const key = `${bout.fighters[0].name} vs ${bout.fighters[1].name}|${bout.label}`;
        resultData = resultsData[key];
      }
      prelimCard.appendChild(renderBout(bout, false, false, false, false, resultData));
    }
    eventCard.appendChild(prelimCard);
  }
  return eventCard;
}

// Helper function to parse UFC date format (e.g., "Jul 12", "Jul 19")
function parseUfcDate(dateStr) {
  // Parse as this year, but do NOT roll over to next year if already passed
  const now = new Date();
  let date = new Date(`${dateStr} ${now.getFullYear()}`);
  // If the parsed date is invalid, fallback to now
  if (isNaN(date)) return now;
  return date;
}



// Helper function to check if this is the next upcoming event with actual fighters
function isLatestEventInList(currentEvent) {
  if (!allEvents || allEvents.length === 0) return false;

  // Only consider events with actual fighters
  const eventsWithFighters = allEvents.filter(event =>
    event.main_card && event.main_card.some(bout =>
      bout.fighters && bout.fighters.length === 2 &&
      bout.fighters[0].name && bout.fighters[1].name &&
      bout.fighters[0].name !== 'TBA' && bout.fighters[1].name !== 'TBA' &&
      bout.fighters[0].name !== 'Opponent TBA' && bout.fighters[1].name !== 'Opponent TBA'
    )
  );

  // Find the event with the soonest future date (or most recent past if all are past)
  const now = new Date();
  let soonestEvent = null;
  let soonestTime = Infinity;
  for (const event of eventsWithFighters) {
    const eventDate = parseUfcDate(event.event_date);
    const timeDiff = eventDate - now;
    if (timeDiff >= 0 && timeDiff < soonestTime) {
      soonestTime = timeDiff;
      soonestEvent = event;
    }
  }
  // If all are in the past, pick the most recent past event
  if (!soonestEvent) {
    let latestPast = -Infinity;
    for (const event of eventsWithFighters) {
      const eventDate = parseUfcDate(event.event_date);
      const timeDiff = eventDate - now;
      if (timeDiff < 0 && timeDiff > latestPast) {
        latestPast = timeDiff;
        soonestEvent = event;
      }
    }
  }
  return currentEvent === soonestEvent;
}

function showFighterDetails(bout) {
  const modal = document.getElementById('fighter-modal');
  const details = document.getElementById('fighter-details');
  details.innerHTML = '<div class="loading">Loading fighter details...</div>';
  modal.style.display = 'block';
  if (bout.fighters && bout.fighters.length === 2) {
    const fighter1 = bout.fighters[0];
    const fighter2 = bout.fighters[1];
    const fighter1Data = findProfileFighterByName(fighter1.name);
    const fighter2Data = findProfileFighterByName(fighter2.name);
    // Create a container for side-by-side cards
    const container = document.createElement('div');
    container.className = 'fighter-details'; // restore original class
    // Fighter 1
    const fighter1Card = createFighterCard(fighter1Data, fighter1.name, fighter1);
    // Fighter 2
    const fighter2Card = createFighterCard(fighter2Data, fighter2.name, fighter2);
    container.appendChild(fighter1Card);
    container.appendChild(fighter2Card);
    details.innerHTML = '';
    details.appendChild(container);
  }
}

function createFighterCard(fighterData, originalName, boutFighterObj) {
  const card = document.createElement('div');
  card.className = 'fighter-card scrollable';
  // Fighter photo (pfp) at the very top, large and centered
  const photo = document.createElement('div');
  photo.className = 'fighter-photo prominent';
  const imgUrl = getProfileFighterImageUrl(fighterData);
  if (imgUrl) {
    const img = document.createElement('img');
    img.src = imgUrl;
    img.alt = originalName;
    img.onerror = () => {
      photo.innerHTML = blankHeadshotSVG(120).outerHTML;
    };
    photo.appendChild(img);
  } else {
    photo.innerHTML = blankHeadshotSVG(120).outerHTML;
  }
  card.appendChild(photo);
  // Header: Name, nickname, record, age
  const name = document.createElement('div');
  name.className = 'fighter-name';
  let nickname = fighterData?.nickname ? `"${fighterData.nickname}" ` : '';
  if (boutFighterObj && boutFighterObj.nickname) nickname = `"${boutFighterObj.nickname}" `;
  name.textContent = `${originalName} ${nickname}`.trim();
  card.appendChild(name);
  const recordAge = document.createElement('div');
  recordAge.className = 'fighter-record-age';
  let record = (boutFighterObj && boutFighterObj.record) ? boutFighterObj.record : (fighterData?.record || 'N/A');
  let age = fighterData?.physical_stats?.age || 'N/A';
  recordAge.textContent = `${record} • ${age} years old`;
  card.appendChild(recordAge);
  // Section: Physical Stats
  const physical = document.createElement('div');
  physical.className = 'stats-section';
  physical.innerHTML = `<div class=\"stats-title\">Physical</div>
    <div class=\"stat-row\"><span>Height:</span><span>${fighterData?.physical_stats?.height ? `${Math.floor(Number(fighterData.physical_stats.height)/12)}'${Number(fighterData.physical_stats.height)%12}\"` : 'N/A'}</span></div>
    <div class=\"stat-row\"><span>Weight:</span><span>${fighterData?.physical_stats?.weight ? `${fighterData.physical_stats.weight} lbs` : 'N/A'}</span></div>
    <div class=\"stat-row\"><span>Reach:</span><span>${fighterData?.physical_stats?.reach ? `${fighterData.physical_stats.reach}\"` : 'N/A'}</span></div>`;
  card.appendChild(physical);
  // Section: Combat Stats (all 8 categories)
  const cs = fighterData?.combat_stats || {};
  const combat = document.createElement('div');
  combat.className = 'stats-section';
  combat.innerHTML = `<div class=\"stats-title\">Combat Stats</div>
    <div class=\"stat-row\"><span>Strikes Landed/Min:</span><span>${cs.sig_str_landed_per_min || 'N/A'}</span></div>
    <div class=\"stat-row\"><span>Strikes Absorbed/Min:</span><span>${cs.sig_str_absorbed_per_min || 'N/A'}</span></div>
    <div class=\"stat-row\"><span>Striking Defense %:</span><span>${cs.sig_str_defense_pct || 'N/A'}</span></div>
    <div class=\"stat-row\"><span>Takedown Avg/15min:</span><span>${cs.takedown_avg_per_15min || 'N/A'}</span></div>
    <div class=\"stat-row\"><span>Takedown Defense %:</span><span>${cs.takedown_defense_pct || 'N/A'}</span></div>
    <div class=\"stat-row\"><span>Submission Avg/15min:</span><span>${cs.submission_avg_per_15min || 'N/A'}</span></div>
    <div class=\"stat-row\"><span>Knockdown Avg:</span><span>${cs.knockdown_avg || 'N/A'}</span></div>
    <div class=\"stat-row\"><span>Avg Fight Time:</span><span>${cs.avg_fight_time || 'N/A'}</span></div>`;
  card.appendChild(combat);
  // Section: Finish Stats
  const finish = fighterData?.finish_stats || {};
  const finishSection = document.createElement('div');
  finishSection.className = 'stats-section';
  finishSection.innerHTML = `<div class=\"stats-title\">Finish Stats</div>
    <div class=\"stat-row\"><span>Wins by KO/TKO:</span><span>${finish.wins_by_ko || 'N/A'}</span></div>
    <div class=\"stat-row\"><span>Wins by Submission:</span><span>${finish.wins_by_sub || 'N/A'}</span></div>
    <div class=\"stat-row\"><span>First Round Finishes:</span><span>${finish.first_round_finishes || 'N/A'}</span></div>`;
  card.appendChild(finishSection);
  // Section: Recent Fights
  const last5 = document.createElement('div');
  last5.className = 'stats-section';
  last5.innerHTML = `<div class=\"stats-title\">Recent Fights</div>`;
  if (fighterData && Array.isArray(fighterData.last_5_fights) && fighterData.last_5_fights.length > 0) {
    for (const fight of fighterData.last_5_fights) {
      // First row: result, opponent (left), date (right)
      const row1 = document.createElement('div');
      row1.className = 'stat-row recent-row1';
      const wl = document.createElement('span');
      wl.textContent = fight.result || '';
      wl.className = fight.result === 'WIN' ? 'wl-win' : (fight.result === 'LOSS' ? 'wl-loss' : '');
      const opp = document.createElement('span');
      opp.textContent = fight.opponent || '';
      const left1 = document.createElement('span');
      left1.appendChild(wl);
      left1.appendChild(document.createTextNode(' '));
      left1.appendChild(opp);
      left1.className = 'recent-left';
      const right1 = document.createElement('span');
      right1.textContent = fight.date || '';
      right1.className = 'recent-right';
      row1.appendChild(left1);
      row1.appendChild(right1);
      // Second row: method (left), round/time (right)
      const row2 = document.createElement('div');
      row2.className = 'stat-row recent-row2';
      const method = document.createElement('span');
      method.textContent = fight.method || '';
      method.className = 'recent-left';
      const round = document.createElement('span');
      round.textContent = `R${fight.round || ''} ${fight.time || ''}`;
      round.className = 'recent-right';
      row2.appendChild(method);
      row2.appendChild(round);
      // Separator
      const sep = document.createElement('div');
      sep.className = 'recent-separator';
      last5.appendChild(row1);
      last5.appendChild(row2);
      last5.appendChild(sep);
    }
  } else {
    last5.innerHTML += `<div class=\"stat-row\"><span>Status:</span><span>Data not available</span></div>`;
  }
  card.appendChild(last5);
  return card;
}

function switchTab(card, tabName) {
  // Update tab buttons
  const tabs = card.querySelectorAll('.tab');
  tabs.forEach(tab => tab.classList.remove('active'));
  
  if (tabName === 'physical') {
    tabs[0].classList.add('active');
  } else if (tabName === 'combat') {
    tabs[1].classList.add('active');
  } else if (tabName === 'last5') {
    tabs[2].classList.add('active');
  }
  
  // Update tab content
  const contents = card.querySelectorAll('.tab-content');
  contents.forEach(content => content.classList.remove('active'));
  
  const activeContent = card.querySelector(`#${tabName}`);
  if (activeContent) {
    activeContent.classList.add('active');
  }
}

function setupModal() {
  const modal = document.getElementById('fighter-modal');
  const closeBtn = document.querySelector('.close');
  
  closeBtn.onclick = () => {
    modal.style.display = 'none';
  };
  
  window.onclick = (event) => {
    if (event.target === modal) {
      modal.style.display = 'none';
    }
  };
}

function formatLabel(label) {
  // Convert snake_case to readable
  return label.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  // If dateStr is like 'Jul 12', add the correct year
  const now = new Date();
  const currentYear = now.getFullYear();
  let dateWithYear = `${dateStr} ${currentYear}`;
  let d = new Date(dateWithYear);
  // If the date has already passed this year, use next year
  if (!isNaN(d) && d < now) {
    dateWithYear = `${dateStr} ${currentYear + 1}`;
    d = new Date(dateWithYear);
  }
  if (!isNaN(d)) {
    // Only show month and day, no year
    return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
  }
  return dateStr;
}

function setupNav() {
  const navEvents = document.getElementById('nav-events');
  const navRankings = document.getElementById('nav-rankings');
  const navAI = document.getElementById('nav-ai-analysis');
  const navChatroom = document.getElementById('nav-chatroom');
  const eventsRoot = document.getElementById('events-root');
  const rankingsRoot = document.getElementById('rankings-root');
  const aiRoot = document.getElementById('ai-analysis-root');
  const chatroomRoot = document.getElementById('chatroom-root');
  const sidebar = document.querySelector('.sidebar');

  navEvents.onclick = () => {
    navEvents.classList.add('active');
    navRankings.classList.remove('active');
    navAI.classList.remove('active');
    navChatroom.classList.remove('active');
    eventsRoot.style.display = '';
    rankingsRoot.style.display = 'none';
    aiRoot.style.display = 'none';
    chatroomRoot.style.display = 'none';
    if (sidebar) sidebar.style.display = '';
    renderEvents(allEvents);
  };

  navRankings.onclick = () => {
    navEvents.classList.remove('active');
    navRankings.classList.add('active');
    navAI.classList.remove('active');
    navChatroom.classList.remove('active');
    eventsRoot.style.display = 'none';
    rankingsRoot.style.display = '';
    aiRoot.style.display = 'none';
    chatroomRoot.style.display = 'none';
    if (sidebar) sidebar.style.display = 'none';
    renderRankings();
  };

  navAI.onclick = () => {
    navEvents.classList.remove('active');
    navRankings.classList.remove('active');
    navAI.classList.add('active');
    navChatroom.classList.remove('active');
    eventsRoot.style.display = 'none';
    rankingsRoot.style.display = 'none';
    aiRoot.style.display = '';
    chatroomRoot.style.display = 'none';
    if (sidebar) sidebar.style.display = 'none';
    showAIAnalysisPage();
  };

  navChatroom.onclick = () => {
    navEvents.classList.remove('active');
    navRankings.classList.remove('active');
    navAI.classList.remove('active');
    navChatroom.classList.add('active');
    eventsRoot.style.display = 'none';
    rankingsRoot.style.display = 'none';
    aiRoot.style.display = 'none';
    chatroomRoot.style.display = '';
    if (sidebar) sidebar.style.display = 'none';
    showChatroomPage();
  };
}

async function renderRankings() {
  const rankingsRoot = document.getElementById('rankings-root');
  rankingsRoot.innerHTML = '<div class="loading">Loading rankings...</div>';
  try {
    // Ensure octagonFightersData is loaded
    if (!octagonFightersData || Object.keys(octagonFightersData).length === 0) {
      await loadFightersData();
    }
    if (!rankingsData || rankingsData.length === 0) {
      const response = await fetch(`${OCTAGON_API_BASE}/rankings`);
      rankingsData = await response.json();
    }
    rankingsRoot.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'rankings-grid';
    for (const division of rankingsData) {
      const tile = document.createElement('div');
      tile.className = 'rankings-tile';
      // Left: Category name
      const title = document.createElement('div');
      title.className = 'rankings-tile-title';
      let catName = division.categoryName;
      if (/pound[- ]?for[- ]?pound|pfp/i.test(catName)) {
        if (/women|female/i.test(catName)) {
          catName = "Women's P4P Ranking";
        } else {
          catName = "Men's P4P Ranking";
        }
      }
      title.textContent = catName;
      tile.appendChild(title);
      // Determine if PFP
      const isPFP = /pound[- ]?for[- ]?pound|pfp/i.test(division.categoryName);
      let champName = document.createElement('div');
      champName.className = 'rankings-tile-champ-name';
      let champBlock = document.createElement('div');
      champBlock.className = 'rankings-tile-champ';
      if (isPFP && division.fighters && division.fighters.length > 0) {
        // Use #1 ranked fighter for PFP
        const topFighter = division.fighters[0];
        champName.textContent = topFighter.name;
        const champHeadshot = renderRankingsFighterImage(topFighter.name);
        champHeadshot.classList.add('big-headshot');
        champHeadshot.style.width = '80px';
        champHeadshot.style.height = '80px';
        champBlock.appendChild(champHeadshot);
      } else if (division.champion && division.champion.championName) {
        champName.textContent = division.champion.championName;
        const champHeadshot = renderRankingsFighterImage(division.champion.championName);
        champHeadshot.classList.add('big-headshot');
        champHeadshot.style.width = '80px';
        champHeadshot.style.height = '80px';
        champBlock.appendChild(champHeadshot);
      } else {
        champName.textContent = '';
      }
      tile.appendChild(champName);
      tile.appendChild(champBlock);
      // Click to open modal
      tile.onclick = () => showRankingsModal(division);
      grid.appendChild(tile);
    }
    rankingsRoot.appendChild(grid);
    setupRankingsModal();
  } catch (e) {
    rankingsRoot.innerHTML = '<div class="loading">Failed to load rankings.</div>';
  }
}

function setupRankingsModal() {
  const modal = document.getElementById('rankings-modal');
  const closeBtn = document.querySelector('.rankings-modal-close');
  closeBtn.onclick = () => {
    modal.style.display = 'none';
  };
  window.onclick = (event) => {
    if (event.target === modal) {
      modal.style.display = 'none';
    }
  };
}

// Patch showRankingsModal to use fuzzy matching for faces
function showRankingsModal(division) {
  const modal = document.getElementById('rankings-modal');
  const body = document.getElementById('rankings-modal-body');
  body.innerHTML = '';
  // Title
  const title = document.createElement('div');
  title.className = 'rankings-division-title';
  title.textContent = division.categoryName;
  body.appendChild(title);
  // Determine if PFP
  const isPFP = /pound[- ]?for[- ]?pound|pfp/i.test(division.categoryName);
  // Champion (not for PFP)
  if (!isPFP && division.champion && division.champion.championName) {
    const champRow = document.createElement('div');
    champRow.className = 'rankings-row';
    const champRank = document.createElement('span');
    champRank.className = 'rankings-rank';
    champRank.textContent = 'C';
    const champHeadshot = renderRankingsFighterImage(division.champion.championName);
    const champName = document.createElement('span');
    champName.className = 'rankings-name';
    champName.textContent = division.champion.championName;
    champRow.appendChild(champRank);
    champRow.appendChild(champHeadshot);
    champRow.appendChild(champName);
    body.appendChild(champRow);
  }
  // Ranked fighters
  if (division.fighters && division.fighters.length > 0) {
    division.fighters.forEach((fighter, idx) => {
      const row = document.createElement('div');
      row.className = 'rankings-row';
      const rank = document.createElement('span');
      rank.className = 'rankings-rank';
      rank.textContent = `#${idx + 1}`;
      const headshot = renderRankingsFighterImage(fighter.name);
      const name = document.createElement('span');
      name.className = 'rankings-name';
      name.textContent = fighter.name;
      row.appendChild(rank);
      row.appendChild(headshot);
      row.appendChild(name);
      body.appendChild(row);
    });
  }
  modal.style.display = 'block';
}

// Helper for blank SVG headshot
function blankHeadshotSVG(size = 32, className = '') {
  const span = document.createElement('span');
  span.className = className ? className + ' nopfp' : 'nopfp';
  span.innerHTML = `<svg width='${size}' height='${size}' viewBox='0 0 32 32' fill='none' xmlns='http://www.w3.org/2000/svg'><circle cx='16' cy='16' r='16' fill='#444'/><path d='M16 17c3.3 0 6 2.7 6 6v1H10v-1c0-3.3 2.7-6 6-6zm0-2a4 4 0 100-8 4 4 0 000 8z' fill='#888'/></svg>`;
  return span;
}

// --- Gemini API integration ---
async function getGeminiApiKey() {
  // Try window.GEMINI_API_KEY (for local dev)
  if (window.GEMINI_API_KEY) return window.GEMINI_API_KEY;
  // Try from environment (Node, not browser)
  if (typeof process !== 'undefined' && process.env && process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  // Prompt user (local dev fallback)
  let key = window.localStorage.getItem('GEMINI_API_KEY');
  if (!key) {
    key = window.prompt('Enter your Gemini API key:');
    if (key) window.localStorage.setItem('GEMINI_API_KEY', key);
  }
  window.GEMINI_API_KEY = key;
  return key;
}

async function predictFight(fighterA, fighterB) {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');
  const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=' + encodeURIComponent(apiKey);
  // Compose prompt and content
  const prompt = `Given the following two UFC fighters' stats and recent fight history, predict who is more likely to win, the most likely method of victory, and provide a concise rationale. Respond in JSON: { "winner": "Name", "method": "KO/TKO|Submission|Decision", "reasoning": "..." }`;
  const content = {
    contents: [
      {
        parts: [
          { text: prompt },
          { text: `Fighter A: ${JSON.stringify(fighterA, null, 2)}` },
          { text: `Fighter B: ${JSON.stringify(fighterB, null, 2)}` }
        ]
      }
    ]
  };
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(content)
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Gemini API error: ${resp.status} – ${err}`);
  }
  const data = await resp.json();
  // Parse Gemini's response for JSON
  let text = '';
  try {
    text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join(' ') || '';
    // Try to extract JSON from the response
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    // Fallback: try to parse whole text
    return JSON.parse(text);
  } catch (e) {
    throw new Error('Failed to parse Gemini response: ' + text);
  }
}

// In showAIAnalysisPage, use predictionsData if available, else fetch
function showAIAnalysisPage() {
  const aiRoot = document.getElementById('ai-analysis-root');
  aiRoot.innerHTML = '';
  // Find the first upcoming event (soonest future date)
  if (!allEvents || allEvents.length === 0) {
    aiRoot.innerHTML = '<div class="loading">No events found.</div>';
    return;
  }
  const now = new Date();
  let upcomingEvent = null;
  let minDiff = Infinity;
  for (const event of allEvents) {
    if (!event.event_date) continue;
    let eventDate = new Date(`${event.event_date} ${now.getFullYear()}`);
    if (!isNaN(eventDate) && eventDate < now) {
      eventDate = new Date(`${event.event_date} ${now.getFullYear() + 1}`);
    }
    if (isNaN(eventDate)) continue;
    if (eventDate >= now && eventDate - now < minDiff) {
      minDiff = eventDate - now;
      upcomingEvent = event;
    }
  }
  if (!upcomingEvent) {
    aiRoot.innerHTML = '<div class="loading">No upcoming events found.</div>';
    return;
  }
  const event = upcomingEvent;
  const title = document.createElement('h2');
  title.textContent = `AI Analysis: ${event.event_name}`;
  aiRoot.appendChild(title);
  if (!event.main_card || event.main_card.length === 0) {
    aiRoot.innerHTML += '<div class="loading">No main card bouts found.</div>';
    return;
  }
  // Container for all bout tiles
  const boutsContainer = document.createElement('div');
  boutsContainer.className = 'ai-bouts-container';
  // Use predictionsData if loaded, else fetch
  const predictionsPromise = predictionsData && predictionsData.length > 0
    ? Promise.resolve(predictionsData)
    : fetch('src/data/predictions.json', { cache: 'no-store' }).then(r => r.json()).catch(() => []);
  predictionsPromise.then(predictions => {
    event.main_card.concat(event.prelims || []).forEach((bout) => {
      const boutDiv = document.createElement('div');
      boutDiv.className = 'ai-bout';
      if (bout.fighters && bout.fighters.length === 2) {
        const f1 = bout.fighters[0];
        const f2 = bout.fighters[1];
        const f1Data = findProfileFighterByName(f1.name);
        const f2Data = findProfileFighterByName(f2.name);
        const f1Img = getProfileFighterImageUrl(f1Data);
        const f2Img = getProfileFighterImageUrl(f2Data);
        const main = document.createElement('div');
        main.className = 'bout-main';
        // Find prediction for this bout
        const pred = predictions.find(p => p.event_name === event.event_name && p.label === bout.label && p.fighters[0] === f1.name && p.fighters[1] === f2.name);
        let winnerName = pred ? pred.winner : '';
        let method = pred ? pred.method : '';
        let reasoning = pred ? pred.reasoning : '';
        let moneyline = pred && pred.moneyline_odds && Object.keys(pred.moneyline_odds).length > 0 ? Object.entries(pred.moneyline_odds)[0] : null;
        let methodOdds = pred && pred.method_odds && Object.keys(pred.method_odds).length > 0 ? Object.entries(pred.method_odds)[0] : null;
        // Left headshot
        const leftHeadshot = f1Img ? document.createElement('img') : blankHeadshotSVG(32);
        if (f1Img) {
          leftHeadshot.src = f1Img;
          leftHeadshot.alt = f1.name;
          leftHeadshot.className = 'bout-headshot';
          leftHeadshot.onerror = () => {
            leftHeadshot.replaceWith(blankHeadshotSVG(32));
          };
          leftHeadshot.style.objectFit = 'cover';
          leftHeadshot.style.objectPosition = 'top center';
          if (winnerName === f1.name) leftHeadshot.classList.add('winner-headshot');
        } else {
          leftHeadshot.className = 'bout-headshot nopfp';
        }
        main.appendChild(leftHeadshot);
        // Names
        const namesSpan = document.createElement('span');
        namesSpan.textContent = `${f1.name} vs ${f2.name}`;
        main.appendChild(namesSpan);
        // Right headshot
        const rightHeadshot = f2Img ? document.createElement('img') : blankHeadshotSVG(32);
        if (f2Img) {
          rightHeadshot.src = f2Img;
          rightHeadshot.alt = f2.name;
          rightHeadshot.className = 'bout-headshot';
          rightHeadshot.onerror = () => {
            rightHeadshot.replaceWith(blankHeadshotSVG(32));
          };
          rightHeadshot.style.objectFit = 'cover';
          rightHeadshot.style.objectPosition = 'top center';
          if (winnerName === f2.name) rightHeadshot.classList.add('winner-headshot');
        } else {
          rightHeadshot.className = 'bout-headshot nopfp';
        }
        main.appendChild(rightHeadshot);
        boutDiv.appendChild(main);
        // Winner/odds/method row (winner and method bold, odds not bold, method on new line)
        const infoRow = document.createElement('div');
        infoRow.className = 'ai-bout-info-row';
        let infoHtml = '';
        if (winnerName && moneyline) {
          infoHtml += `<b>Winner:</b> ${winnerName} <span class='ai-bout-odds'>| AI Odds: ${moneyline[1]}</span>`;
        }
        if (method && methodOdds) {
          infoHtml += `<br/><b>Method of Victory:</b> ${method} <span class='ai-bout-odds'>| AI Odds: ${methodOdds[1]}</span>`;
        }
        infoRow.innerHTML = infoHtml;
        boutDiv.appendChild(infoRow);
        // Click to open custom summary modal
        // Add thumbs up/down functionality
        const thumbsContainer = document.createElement('div');
        thumbsContainer.className = 'ai-bout-thumbs';
        
        const thumbsUpContainer = document.createElement('div');
        thumbsUpContainer.className = 'thumbs-up-container';
        
        const thumbsUpBtn = document.createElement('button');
        thumbsUpBtn.className = 'thumbs-btn thumbs-up';
        thumbsUpBtn.innerHTML = `<img class="thumbs-img" src="src/assets/icons/upvote.png" alt="Upvote" width="22" height="22">`;
        thumbsUpBtn.onclick = (e) => {
          e.stopPropagation();
          handleThumbsVote(boutDiv, 'up');
        };
        
        const thumbsUpCount = document.createElement('div');
        thumbsUpCount.className = 'thumbs-up-count';
        thumbsUpCount.textContent = '0';
        
        thumbsUpContainer.appendChild(thumbsUpBtn);
        thumbsUpContainer.appendChild(thumbsUpCount);
        
        const thumbsDownContainer = document.createElement('div');
        thumbsDownContainer.className = 'thumbs-down-container';
        
        const thumbsDownBtn = document.createElement('button');
        thumbsDownBtn.className = 'thumbs-btn thumbs-down';
        thumbsDownBtn.innerHTML = `<img class="thumbs-img" src="src/assets/icons/downvote.png" alt="Downvote" width="22" height="22">`;
        thumbsDownBtn.onclick = (e) => {
          e.stopPropagation();
          handleThumbsVote(boutDiv, 'down');
        };
        
        const thumbsDownCount = document.createElement('div');
        thumbsDownCount.className = 'thumbs-down-count';
        thumbsDownCount.textContent = '0';
        
        thumbsDownContainer.appendChild(thumbsDownBtn);
        thumbsDownContainer.appendChild(thumbsDownCount);
        
        thumbsContainer.appendChild(thumbsUpContainer);
        thumbsContainer.appendChild(thumbsDownContainer);
        boutDiv.appendChild(thumbsContainer);
        
        // Load existing thumbs votes
        loadThumbsVotes(boutDiv);
        
        boutDiv.onclick = () => showAISummaryModal({
          f1, f2, f1Img, f2Img, winnerName, method, moneyline, methodOdds, reasoning
        });
      }
      boutsContainer.appendChild(boutDiv);
    });
    aiRoot.appendChild(boutsContainer);
  }).catch(() => {
    boutsContainer.innerHTML = '<div class="loading">Failed to load predictions."</div>';
    aiRoot.appendChild(boutsContainer);
  });
}

// Helper to format AI reasoning string into neat HTML
function formatAIReasoning(reasoning) {
  if (!reasoning) return '';
  // Truncate if too long
  const maxLen = 400;
  let truncated = reasoning;
  if (reasoning.length > maxLen) {
    truncated = reasoning.slice(0, maxLen) + '...';
  }
  // Try to parse the format: Overall: ...\n- ...\n- ...\nConclusion: ...
  const lines = truncated.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let html = '';
  let inBullets = false;
  let bulletCount = 0;
  for (let i = 0; i < lines.length; ++i) {
    const line = lines[i];
    if (/^Overall:/i.test(line)) {
      html += `<div class='ai-reasoning-overall'>${line.replace(/^Overall:/i, 'Overall:')}</div>`;
      inBullets = false;
    } else if (/^Conclusion:/i.test(line)) {
      html += `<div class='ai-reasoning-conclusion'><b>${line.replace(/^Conclusion:/i, 'Conclusion:')}</b></div>`;
      inBullets = false;
    } else if (/^- /.test(line) && bulletCount < 3) {
      if (!inBullets) {
        html += '<ul class="ai-reasoning-bullets">';
        inBullets = true;
      }
      html += `<li>${line.replace(/^- /, '')}</li>`;
      bulletCount++;
      // If next line is not a bullet or max reached, close ul
      if (bulletCount >= 3 || i + 1 >= lines.length || !/^- /.test(lines[i + 1])) {
        html += '</ul>';
        inBullets = false;
      }
    } else if (bulletCount < 3) {
      html += `<div>${line}</div>`;
    }
    if (bulletCount >= 3) break;
  }
  return html;
}

// Update showAISummaryModal to use formatted reasoning
function showAISummaryModal({f1, f2, f1Img, f2Img, winnerName, method, moneyline, methodOdds, reasoning}) {
  let modal = document.getElementById('ai-summary-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'ai-summary-modal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content ai-summary-modal-content">
        <span class="close" id="ai-summary-modal-close">&times;</span>
        <div id="ai-summary-modal-body"></div>
      </div>
    `;
    document.body.appendChild(modal);
  }
  const body = modal.querySelector('#ai-summary-modal-body');
  // Build summary content
  let html = `<div class='ai-bout-modal-main'>`;
  // Headshots and names
  html += `<div class='ai-bout-modal-heads'>`;
  html += f1Img ? `<img src='${f1Img}' alt='${f1.name}' class='bout-headshot${winnerName === f1.name ? ' winner-headshot' : ''}' style='width:56px;height:56px;'>` : blankHeadshotSVG(56).outerHTML;
  html += `<span class='ai-bout-modal-names'>${f1.name} vs ${f2.name}</span>`;
  html += f2Img ? `<img src='${f2Img}' alt='${f2.name}' class='bout-headshot${winnerName === f2.name ? ' winner-headshot' : ''}' style='width:56px;height:56px;'>` : blankHeadshotSVG(56).outerHTML;
  html += `</div>`;
  // Winner/odds/method summary
  html += `<div class='ai-bout-modal-summary'>`;
  if (winnerName && moneyline) {
    html += `<b>Winner:</b> ${winnerName} <span class='ai-bout-odds'>| AI Odds: ${moneyline[1]}</span>`;
  }
  if (method && methodOdds) {
    html += `<br/><b>Method of Victory:</b> ${method} <span class='ai-bout-odds'>| AI Odds: ${methodOdds[1]}</span>`;
  }
  html += `</div>`;
  // Reasoning
  if (reasoning) {
    html += `<div class='ai-bout-modal-reasoning'><b>AI Reasoning:</b><br>${formatAIReasoning(reasoning)}</div>`;
  }
  html += `</div>`;
  body.innerHTML = html;
  modal.style.display = 'block';
  // Close logic
  modal.querySelector('#ai-summary-modal-close').onclick = () => {
    modal.style.display = 'none';
  };
  window.onclick = (event) => {
    if (event.target === modal) {
      modal.style.display = 'none';
    }
  };
}

// Generate unique bout ID
function generateBoutId(bout) {
  if (!bout.fighters || bout.fighters.length < 2) return 'unknown';
  const fighter1 = bout.fighters[0].name || 'unknown1';
  const fighter2 = bout.fighters[1].name || 'unknown2';
  const label = bout.label || 'unknown';
  return `${fighter1}_vs_${fighter2}_${label}`.replace(/\s+/g, '_').toLowerCase();
}

// Create voting container
function createVotingContainer(bout, boutId) {
  
  const container = document.createElement('div');
  container.className = 'voting-container';
  
  // Voting bars - clickable and longer
  const barsContainer = document.createElement('div');
  barsContainer.className = 'voting-bars';
  barsContainer.style.height = '30px'; // Shorter height
  barsContainer.style.width = '100%'; // Full width
  barsContainer.style.cursor = 'pointer';
  
  const fighter1Bar = document.createElement('div');
  fighter1Bar.className = 'fighter1-bar';
  fighter1Bar.style.width = '50%';
  fighter1Bar.style.height = '100%';
  fighter1Bar.style.display = 'flex';
  fighter1Bar.style.alignItems = 'center';
  fighter1Bar.style.justifyContent = 'center';
  fighter1Bar.style.cursor = 'pointer';
  fighter1Bar.textContent = bout.fighters[0].name;
  fighter1Bar.setAttribute('data-fighter-name', bout.fighters[0].name);
  fighter1Bar.onclick = (e) => {
    e.stopPropagation();
    console.log('Voting for fighter 1 in bout:', boutId);
    voteForFighter(boutId, 0);
  };
  barsContainer.appendChild(fighter1Bar);
  
  const fighter2Bar = document.createElement('div');
  fighter2Bar.className = 'fighter2-bar';
  fighter2Bar.style.width = '50%';
  fighter2Bar.style.height = '100%';
  fighter2Bar.style.display = 'flex';
  fighter2Bar.style.alignItems = 'center';
  fighter2Bar.style.justifyContent = 'center';
  fighter2Bar.style.cursor = 'pointer';
  fighter2Bar.textContent = bout.fighters[1].name;
  fighter2Bar.setAttribute('data-fighter-name', bout.fighters[1].name);
  fighter2Bar.onclick = (e) => {
    e.stopPropagation();
    console.log('Voting for fighter 2 in bout:', boutId);
    voteForFighter(boutId, 1);
  };
  barsContainer.appendChild(fighter2Bar);
  
  container.appendChild(barsContainer);
  
  // Vote count
  const voteCount = document.createElement('div');
  voteCount.className = 'vote-count';
  voteCount.textContent = '0 votes';
  container.appendChild(voteCount);
  
  // Don't load initial voting results - only show after someone votes
  return container;
}

// Authentication handler functions
function showAuthModal(type = 'login') {
  const modal = document.getElementById('auth-modal');
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  
  if (type === 'signup') {
    loginForm.style.display = 'none';
    signupForm.style.display = 'block';
  } else {
    signupForm.style.display = 'none';
    loginForm.style.display = 'block';
  }
  
  modal.style.display = 'block';
  
  // Close modal when clicking X or outside
  const closeBtn = document.getElementById('auth-modal-close');
  closeBtn.onclick = () => {
    modal.style.display = 'none';
  };
  
  window.onclick = (event) => {
    if (event.target === modal) {
      modal.style.display = 'none';
    }
  };
}

function switchAuthForm(type) {
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  
  if (type === 'signup') {
    loginForm.style.display = 'none';
    signupForm.style.display = 'block';
  } else {
    signupForm.style.display = 'none';
    loginForm.style.display = 'block';
  }
}

async function handleLogin() {
  console.log('Login attempt...');
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  
  console.log('Email:', email);
  console.log('Password length:', password.length);
  
  if (!email || !password) {
    showNotification('Please enter both email and password', 'error');
    return;
  }
  
  try {
    console.log('Calling signIn...');
    await signIn(email, password);
    console.log('Login successful!');
    showNotification('Login successful!', 'success');
    // Close the auth modal
    document.getElementById('auth-modal').style.display = 'none';
  } catch (error) {
    console.error('Login failed:', error);
    showNotification('Login failed: ' + error.message, 'error');
  }
}

async function handleSignup() {
  const username = document.getElementById('signup-username').value.trim();
  const email = document.getElementById('signup-email').value;
  const password = document.getElementById('signup-password').value;

  // Username validation
  if (!/^[a-zA-Z0-9]{5,}$/.test(username)) {
    showNotification('Username must be at least 5 characters and only contain letters and numbers.', 'error');
    return;
  }

  // Password validation
  if (password.length < 6 || !/[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    showNotification('Password must be at least 6 characters and contain at least one number or symbol.', 'error');
    return;
  }

  if (!email || !password || !username) {
    showNotification('Please fill out all fields.', 'error');
    return;
  }

  // Check username uniqueness
  try {
    const { data: existing, error: userError } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .single();
    if (existing) {
      showNotification('Username is already taken.', 'error');
      return;
    }
  } catch (err) {
    // If error is not row not found, show error
    if (!err.message.includes('No rows')) {
      showNotification('Error checking username: ' + err.message, 'error');
      return;
    }
  }

  try {
    // Sign up user
    const { data, error } = await supabase.auth.signUp({
      email: email,
      password: password,
    });
    
    if (error) {
      if (error.message.includes('already registered')) {
        showNotification('Email is already in use. Please use a different email or try logging in.', 'error');
      } else {
        throw error;
      }
      return;
    }
    
    // Insert username into profiles table
    const userId = data.user?.id;
    if (userId) {
      const { error: profileError } = await supabase
        .from('profiles')
        .insert([{ id: userId, username }]);
      if (profileError) {
        showNotification('Error saving username: ' + profileError.message, 'error');
        return;
      }
    }
    showNotification('Account created successfully! Please check your email to verify your account.', 'success');
    document.getElementById('auth-modal').style.display = 'none';
  } catch (error) {
    showNotification('Signup failed: ' + error.message, 'error');
  }
}

// Notification System
function showNotification(message, type = 'info') {
  const container = document.getElementById('notification-container');
  
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  
  // Create message
  const messageEl = document.createElement('div');
  messageEl.className = 'notification-message';
  messageEl.textContent = message;
  
  // Create close button
  const closeBtn = document.createElement('button');
  closeBtn.className = 'notification-close';
  closeBtn.innerHTML = '×';
  closeBtn.onclick = () => removeNotification(notification);
  
  // Assemble notification
  notification.appendChild(messageEl);
  notification.appendChild(closeBtn);
  container.appendChild(notification);
  
  // Show notification with animation
  setTimeout(() => {
    notification.classList.add('show');
  }, 10);
  
  // Auto-remove after 5 seconds
  setTimeout(() => {
    removeNotification(notification);
  }, 5000);
  
  return notification;
}

function removeNotification(notification) {
  notification.classList.add('hide');
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 300);
}

// Chatroom Page
function showChatroomPage() {
  const chatroomRoot = document.getElementById('chatroom-root');
  chatroomRoot.innerHTML = `
    <div class="chatroom-container fullpage">
      <div class="chatroom-header">
        <span class="users-online-indicator"><span class="green-dot"></span> <span id="users-online-count">0</span> users online</span>
      </div>
      <div class="chat-messages" id="chat-messages">
        <div class="welcome-message">
          <p>Welcome to the UFC Chatroom! Start the conversation...</p>
        </div>
      </div>
      <div class="chat-input-container fullpage" style="display:flex;align-items:center;gap:0.5rem;">
        <div style="display:flex;flex-direction:row;gap:0.3rem;align-items:center;">
          <button id="sticker-gif-picker-btn" class="send-btn fullpage" title="Send Sticker or GIF" style="width:36px;height:52px;display:flex;align-items:center;justify-content:center;background:#e11d48;border-radius:8px;border:none;box-shadow:0 2px 8px #e11d4888;"><img src="src/assets/icons/stickers.png" alt="Stickers/GIFs" style="width:30px;height:38px;object-fit:contain;"></button>
          <button id="emote-picker-btn" class="send-btn fullpage" title="Send Emote" style="width:36px;height:52px;display:flex;align-items:center;justify-content:center;background:#e11d48;border-radius:8px;border:none;box-shadow:0 2px 8px #e11d4888;"><img src="src/assets/icons/emotes.png" alt="Emotes" style="width:30px;height:38px;object-fit:contain;"></button>
        </div>
        <div class="chat-input-wrapper fullpage" style="flex:1;display:flex;flex-direction:column;">
          <textarea 
            id="chat-input" 
            placeholder="Type your message here..." 
            maxlength="280"
            rows="2"
            style="height:52px;min-height:52px;max-height:120px;resize:vertical;"
          ></textarea>
          <div class="char-counter fullpage">
            <span id="char-count">0</span>/280
          </div>
        </div>
        <button id="send-message-btn" class="send-btn fullpage" disabled style="height:52px;align-self:flex-end;display:flex;align-items:center;">Send</button>
      </div>
    </div>
    <div id="gif-sticker-modal" class="modal" style="display:none;z-index:2000;">
      <div class="modal-content" id="gif-sticker-modal-content"></div>
    </div>
  `;
  setupChat();
  fetchAndDisplayUsersOnline();
  setupGifStickerPickers();
}

function setupGifStickerPickers() {
  const stickerGifBtn = document.getElementById('sticker-gif-picker-btn');
  const emoteBtn = document.getElementById('emote-picker-btn');
  const modal = document.getElementById('gif-sticker-modal');
  const modalContent = document.getElementById('gif-sticker-modal-content');
  stickerGifBtn.onclick = () => showGifStickerModal('gif'); // Default to GIFs tab
  modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
  if (emoteBtn) {
    emoteBtn.onclick = () => showEmoteModal();
  }
}

function showEmoteModal() {
  const modal = document.getElementById('gif-sticker-modal');
  const modalContent = document.getElementById('gif-sticker-modal-content');
  // Dynamically list all emote PNG files in src/assets/emotes
  const emotes = [
    'src/assets/emotes/17970-sadnick.png',
    'src/assets/emotes/1952-trolleyesconor.png',
    'src/assets/emotes/4056-omg.png',
    'src/assets/emotes/4247-removehat.png',
    'src/assets/emotes/4884-whoa.png',
    'src/assets/emotes/5686-explaining.png',
    'src/assets/emotes/6334-iseeisee.png',
    'src/assets/emotes/8726-pointing.png',
    'src/assets/emotes/8726-uhoh.png',
    'src/assets/emotes/8841-coolhand.png',
    'src/assets/emotes/8841-wtf.png',
    'src/assets/emotes/9632-oho.png',
    'src/assets/emotes/9632-small.png',
    'src/assets/emotes/99068-ufcw3000.png',
    'src/assets/emotes/9915-mock.png',
    'src/assets/emotes/9935-thinking.png',
    'src/assets/emotes/1927-lazyeye.png',
    'src/assets/emotes/2394-laughing.png',
    'src/assets/emotes/3207-eek.png',
    'src/assets/emotes/3266-cry.png',
    'src/assets/emotes/3712-huh.png',
    'src/assets/emotes/3829-thumbsdown.png',
    'src/assets/emotes/4044-glad.png',
    'src/assets/emotes/5133-shush.png',
    'src/assets/emotes/5691-scream.png',
    'src/assets/emotes/6521-chestpound.png',
    'src/assets/emotes/6945-whatdidyousay.png',
    'src/assets/emotes/7273-flex.png',
    'src/assets/emotes/7334-commentatorrogan.png',
    'src/assets/emotes/8544-crying.png',
    'src/assets/emotes/9541-isee.png',
    'src/assets/emotes/21863-jonjonespog.png',
    'src/assets/emotes/23921-ddppog.png',
    'src/assets/emotes/5531-punch.png',
    'src/assets/emotes/9214-bruh.png',
  ];
  modalContent.innerHTML = `
    <div style="position:absolute;top:0;left:0;width:100%;z-index:2;background:#181818;text-align:center;padding:0.7rem 0 0.3rem 0;font-weight:600;font-size:1.1rem;color:#fff;">Emotes</div>
    <div style="height:2.5rem;"></div>
    <div id="emote-grid"></div>
  `;
  const grid = document.getElementById('emote-grid');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(9,1fr)';
  grid.style.gap = '0.5rem';
  grid.style.maxHeight = '60vh';
  grid.style.overflowY = 'auto';
  grid.style.width = '100%';
  grid.style.padding = '0.5rem 1rem 0 1rem'; // More left/right padding
  grid.innerHTML = emotes.map(f => `<img src="${f}" data-file="${f}" style="width:60px;height:60px;object-fit:contain;cursor:pointer;border-radius:8px;background:#222;">`).join('');
  grid.querySelectorAll('img').forEach(img => {
    img.onclick = () => {
      insertEmoteToChat(img.getAttribute('data-file'));
      modal.style.display = 'none';
    };
  });
  modal.style.display = 'block';
}

function insertEmoteToChat(file) {
  const chatInput = document.getElementById('chat-input');
  if (!chatInput) return;
  // Insert a special token for the emote (e.g., :emote:filename.png:)
  const token = `:emote:${file.split('/').pop()}:`;
  // Count emotes as 1 char for char counter, but store the token in the input
  // Insert at cursor position
  const start = chatInput.selectionStart;
  const end = chatInput.selectionEnd;
  const before = chatInput.value.substring(0, start);
  const after = chatInput.value.substring(end);
  let newValue = before + token + after;
  // Count emotes as 1 char for char counter
  const charCount = countChatInputChars(newValue);
  if (charCount > 280) return; // Don't insert if over limit
  chatInput.value = newValue;
  // Move cursor after inserted emote
  chatInput.selectionStart = chatInput.selectionEnd = start + token.length;
  updateChatCharCount();
}

function countChatInputChars(val) {
  // Each :emote:filename.png: counts as 1 char
  return (val.match(/:emote:[^:]+:/g) || []).length + val.replace(/:emote:[^:]+:/g, '').length;
}

function updateChatCharCount() {
  const chatInput = document.getElementById('chat-input');
  const charCount = document.getElementById('char-count');
  if (!chatInput || !charCount) return;
  charCount.textContent = countChatInputChars(chatInput.value);
  // Enable/disable send button
  const sendBtn = document.getElementById('send-message-btn');
  if (sendBtn) {
    sendBtn.disabled = countChatInputChars(chatInput.value) === 0 || countChatInputChars(chatInput.value) > 280;
  }
}

// Overlay for rendering emotes in chat input
function renderChatInputOverlay() {
  const chatInput = document.getElementById('chat-input');
  if (!chatInput) return;
  // Ensure parent is .chat-input-wrapper
  const wrapper = chatInput.closest('.chat-input-wrapper');
  if (!wrapper) return;
  // Set wrapper to relative positioning for overlay
  wrapper.style.position = 'relative';
  let overlay = document.getElementById('chat-input-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'chat-input-overlay';
    overlay.style.position = 'absolute';
    overlay.style.left = chatInput.offsetLeft + 'px';
    overlay.style.top = chatInput.offsetTop + 'px';
    overlay.style.width = chatInput.offsetWidth + 'px';
    overlay.style.height = chatInput.offsetHeight + 'px';
    overlay.style.pointerEvents = 'none';
    overlay.style.color = '#fff';
    overlay.style.fontFamily = chatInput.style.fontFamily || 'inherit';
    overlay.style.fontSize = chatInput.style.fontSize || 'inherit';
    overlay.style.lineHeight = chatInput.style.lineHeight || 'inherit';
    overlay.style.padding = chatInput.style.padding || 'inherit';
    overlay.style.background = 'transparent';
    overlay.style.whiteSpace = 'pre-wrap';
    overlay.style.overflow = 'hidden';
    overlay.style.zIndex = '2';
    wrapper.appendChild(overlay);
    // Make textarea text transparent and caret visible
    chatInput.style.color = 'transparent';
    chatInput.style.caretColor = '#e11d48'; // Red caret
    chatInput.style.background = 'transparent';
    chatInput.style.position = 'relative';
  }
  // Render value with emotes
  let html = escapeHtml(chatInput.value).replace(/:emote:([^:]+):/g, (m, fname) => `<img src='src/assets/emotes/${fname}' alt='emote' style='width:28px;height:28px;vertical-align:middle;'>`);
  overlay.innerHTML = html + '<span style="opacity:0;">.</span>';
  // Sync overlay position/size
  overlay.style.left = chatInput.offsetLeft + 'px';
  overlay.style.top = chatInput.offsetTop + 'px';
  overlay.style.width = chatInput.offsetWidth + 'px';
  overlay.style.height = chatInput.offsetHeight + 'px';
}

// Patch chat input event listeners to update overlay
async function setupChat() {
  const chatInput = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-message-btn');
  const charCount = document.getElementById('char-count');
  const messagesContainer = document.getElementById('chat-messages');
  if (!chatInput || !sendBtn) return;
  // Character counter
  chatInput.addEventListener('input', () => { updateChatCharCount(); });
  // Send message
  sendBtn.addEventListener('click', () => {
    sendChatMessage();
  });
  // Send on Enter (but allow Shift+Enter for new lines)
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });
  // Load existing messages
  loadChatMessages();
  // --- Real-time chat subscription ---
  if (window._chatSubscription) {
    window._chatSubscription.unsubscribe();
    window._chatSubscription = null;
  }
  try {
    window._chatSubscription = await supabase
      .channel('chat_messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, payload => {
        loadChatMessages();
      })
      .subscribe();
    if (window._chatSubscription && window._chatSubscription.error) {
      console.error('Supabase chat subscription error:', window._chatSubscription.error);
    }
  } catch (err) {
    console.error('Failed to subscribe to chat_messages:', err);
  }
  // --- End real-time chat subscription ---
  // Update last_active every 30s if logged in
  if (currentUser) {
    updateLastActive();
    if (!window._lastActiveInterval) {
      window._lastActiveInterval = setInterval(updateLastActive, 30000);
    }
  }
  // Refresh users online every 30s
  if (!window._usersOnlineInterval) {
    window._usersOnlineInterval = setInterval(fetchAndDisplayUsersOnline, 30000);
  }
  updateChatCharCount();
  // Restore textarea color and caret to default
  chatInput.style.color = '';
  chatInput.style.caretColor = '';
  chatInput.style.background = '';
  chatInput.style.position = '';
}
// --- Clean up chat subscription when leaving chatroom ---
function cleanupChatSubscription() {
  if (window._chatSubscription) {
    window._chatSubscription.unsubscribe();
    window._chatSubscription = null;
  }
}

// When sending a message, replace emote tokens with <img> tags for display
function displayChatMessages(messages) {
  console.log('Loaded messages:', messages);
  const messagesContainer = document.getElementById('chat-messages');
  if (!messagesContainer) return;
  messagesContainer.innerHTML = '';
  if (messages.length === 0) {
    messagesContainer.innerHTML = `
      <div class="welcome-message">
        <p>Welcome to the UFC Chatroom! Start the conversation...</p>
      </div>
    `;
    return;
  }
  messages.forEach(msg => {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message';
    const isCurrentUser = currentUser && msg.user_id === currentUser.id;
    messageDiv.classList.add(isCurrentUser ? 'own-message' : 'other-message');
    messageDiv.style.alignSelf = isCurrentUser ? 'flex-end' : 'flex-start';
    messageDiv.style.textAlign = isCurrentUser ? 'right' : 'left';
    const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    let contentHtml = '';
    if (msg.type === 'gif' || msg.type === 'sticker') {
      contentHtml = `<img src="${msg.file}" alt="${msg.type}" style="max-width:180px;max-height:180px;border-radius:10px;">`;
    } else {
      // Replace emote tokens with <img> tags
      let htmlMsg = escapeHtml(msg.message).replace(/:emote:([^:]+):/g, (m, fname) => `<img src='src/assets/emotes/${fname}' alt='emote' style='width:28px;height:28px;vertical-align:middle;'>`);
      contentHtml = `<div class="message-content">${htmlMsg}</div>`;
    }
    messageDiv.innerHTML = `
      <div class="message-header-row">
        <span class="message-username">${msg.username}&nbsp;</span>
        <span class="message-time">${time}</span>
      </div>
      ${contentHtml}
    `;
    messagesContainer.appendChild(messageDiv);
  });
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function fetchAndDisplayUsersOnline() {
  // Count users with last_active within last 5 minutes, always include current user if logged in
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, last_active')
    .gte('last_active', fiveMinAgo);
  let count = data ? data.length : 0;
  if (currentUser && (!data || !data.some(u => u.id === currentUser.id))) count++;
  const countEl = document.getElementById('users-online-count');
  if (countEl) countEl.textContent = count;
}

function showProfileModal() {
  const modal = document.getElementById('profile-modal');
  const closeBtn = document.getElementById('profile-modal-close');
  const usernameDiv = document.getElementById('profile-username');
  modal.style.display = 'block';

  // Close modal logic
  closeBtn.onclick = () => { modal.style.display = 'none'; };

  // Fetch username from Supabase
  if (currentUser) {
    supabase
      .from('profiles')
      .select('username')
      .eq('id', currentUser.id)
      .single()
      .then(({ data, error }) => {
        if (data && data.username) {
          usernameDiv.textContent = 'Username: ' + data.username;
        } else {
          usernameDiv.textContent = 'Username: (not set)';
        }
      });
  }
}

// Global modal close handler
if (!window._modalClickHandlerAdded) {
  window._modalClickHandlerAdded = true;
  window.addEventListener('click', function(event) {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
      if (event.target === modal) {
        modal.style.display = 'none';
      }
    });
  });
}

async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    showNotification('Error signing out: ' + error.message, 'error');
    return;
  }
  currentUser = null;
  updateAuthUI();
  // Close the profile modal if open
  const modal = document.getElementById('profile-modal');
  if (modal) modal.style.display = 'none';
}

// Update authentication UI
function updateAuthUI() {
  const authContainer = document.getElementById('auth-container');
  const loginBtn = authContainer.querySelector('button[onclick="showAuthModal()"]');
  const signupBtn = authContainer.querySelector('button[onclick*="signup"]');
  const profileBtn = document.getElementById('profile-btn');

  if (currentUser) {
    if (loginBtn) loginBtn.style.display = 'none';
    if (signupBtn) signupBtn.style.display = 'none';
    if (profileBtn) profileBtn.style.display = 'inline-block';
    
    // Refresh voting displays when user logs in
    refreshAllVotingDisplays();
  } else {
    if (loginBtn) loginBtn.style.display = 'inline-block';
    if (signupBtn) signupBtn.style.display = 'inline-block';
    if (profileBtn) profileBtn.style.display = 'none';
  }
} 

async function updateLastActive() {
  if (!currentUser) return;
  await supabase.from('profiles').update({ last_active: new Date().toISOString() }).eq('id', currentUser.id);
}

// Chat moderation - filter bad words
function filterBadWords(message) {
  const badWords = [
    'fuck', 'fucker', 'fucking', 'fucks',
    'shit', 'shitter', 'shitting', 'shits',
    'bitch', 'bitches', 'bitching',
    'ass', 'asses', 'asshole',
    'dick', 'dicks', 'dicking',
    'cock', 'cocks', 'cocking',
    'pussy', 'pussies',
    'cunt', 'cunts',
    'whore', 'whores',
    'slut', 'sluts',
    'nigger', 'niggers', 'nigga', 'niggas',
    'faggot', 'faggots', 'fag', 'fags',
    'retard', 'retards',
    'bastard', 'bastards',
    'damn', 'damned',
    'hell',
    'goddamn', 'goddamned',
    'jesus', 'christ'
  ];
  const leetMap = {
    '0': 'o', '1': 'i', '2': 'z', '3': 'e', '4': 'a', '5': 's', '6': 'g', '7': 't', '8': 'b', '9': 'g',
    '|': 'i', '!': 'i', '$': 's', '@': 'a', '+': 't', '?': 'q', '(': 'c', ')': 'c', '{': 'c', '}': 'c', '[': 'c', ']': 'c'
  };
  function normalize(str) {
    return str
      .toLowerCase()
      .replace(/[0-9|!$@+?(){}\[\]]/g, c => leetMap[c] || c)
      .replace(/[\s\*\-\._]/g, '');
  }
  // Split message into words, preserve original for replacement
  return message.replace(/\b\w+\b/g, (word) => {
    const norm = normalize(word);
    if (badWords.includes(norm)) {
      return '*'.repeat(word.length);
    }
    return word;
  });
}

// --- Send GIF or Sticker message ---
async function sendGifStickerMessage(type, file) {
  if (!currentUser) {
    showNotification('Please log in to send messages', 'warning');
    return;
  }
  if (!file || (type !== 'gif' && type !== 'sticker')) return;
  try {
    // Get username
    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', currentUser.id)
      .single();
    const username = profile?.username || 'Anonymous';
    // Insert GIF/sticker message
    const { error } = await supabase
      .from('chat_messages')
      .insert([
        {
          user_id: currentUser.id,
          username: username,
          type: type,
          file: file,
          message: '',
          created_at: new Date().toISOString()
        }
      ]);
    if (error) throw error;
    // Immediately update chat UI
    loadChatMessages();
  } catch (error) {
    showNotification('Error sending GIF/sticker: ' + error.message, 'error');
  }
}

async function sendChatMessage() {
  if (!currentUser) {
    showNotification('Please log in to send messages', 'warning');
    return;
  }
  
  const chatInput = document.getElementById('chat-input');
  const message = chatInput.value.trim();
  
  if (!message || message.length > 280) {
    return;
  }
  
  try {
    // Get username
    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', currentUser.id)
      .single();
    
    const username = profile?.username || 'Anonymous';
    
    // Filter bad words from message
    const filteredMessage = filterBadWords(message);
    
    // Insert message into database
    const { error } = await supabase
      .from('chat_messages')
      .insert([
        {
          user_id: currentUser.id,
          username: username,
          message: filteredMessage,
          created_at: new Date().toISOString()
        }
      ]);
    
    if (error) {
      throw error;
    }
    
    // Clear input
    chatInput.value = '';
    document.getElementById('char-count').textContent = '0';
    document.getElementById('send-message-btn').disabled = true;
    
    // Reload messages
    loadChatMessages();
    
  } catch (error) {
    showNotification('Error sending message: ' + error.message, 'error');
  }
}

async function loadChatMessages() {
  try {
    const { data: messages, error } = await supabase
      .from('chat_messages')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(50);
    
    if (error) {
      throw error;
    }
    
    displayChatMessages(messages || []);
    
  } catch (error) {
    console.error('Error loading messages:', error);
  }
}

function displayChatMessages(messages) {
  console.log('Loaded messages:', messages);
  const messagesContainer = document.getElementById('chat-messages');
  if (!messagesContainer) return;
  messagesContainer.innerHTML = '';
  if (messages.length === 0) {
    messagesContainer.innerHTML = `
      <div class="welcome-message">
        <p>Welcome to the UFC Chatroom! Start the conversation...</p>
      </div>
    `;
    return;
  }
  messages.forEach(msg => {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message';
    const isCurrentUser = currentUser && msg.user_id === currentUser.id;
    messageDiv.classList.add(isCurrentUser ? 'own-message' : 'other-message');
    messageDiv.style.alignSelf = isCurrentUser ? 'flex-end' : 'flex-start';
    messageDiv.style.textAlign = isCurrentUser ? 'right' : 'left';
    const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    let contentHtml = '';
    if (msg.type === 'gif' || msg.type === 'sticker') {
      contentHtml = `<img src="${msg.file}" alt="${msg.type}" style="max-width:180px;max-height:180px;border-radius:10px;">`;
    } else {
      // Replace emote tokens with <img> tags
      let htmlMsg = escapeHtml(msg.message).replace(/:emote:([^:]+):/g, (m, fname) => `<img src='src/assets/emotes/${fname}' alt='emote' style='width:28px;height:28px;vertical-align:middle;'>`);
      contentHtml = `<div class="message-content">${htmlMsg}</div>`;
    }
    messageDiv.innerHTML = `
      <div class="message-header-row">
        <span class="message-username">${msg.username}&nbsp;</span>
        <span class="message-time">${time}</span>
      </div>
      ${contentHtml}
    `;
    messagesContainer.appendChild(messageDiv);
  });
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Refresh all voting displays (used when user logs in)
async function refreshAllVotingDisplays() {
  const votingContainers = document.querySelectorAll('.voting-container');
  for (const container of votingContainers) {
    const boutElement = container.closest('[data-bout-id]');
    if (boutElement) {
      const boutId = boutElement.getAttribute('data-bout-id');
      await updateVotingDisplay(boutId);
    }
  }
}

// Thumbs up/down functionality for AI analysis
async function handleThumbsVote(boutDiv, voteType) {
  if (!currentUser) {
    showNotification('Please log in to vote', 'warning');
    return;
  }
  
  const boutId = generateBoutId({
    fighters: [
      { name: boutDiv.querySelector('.bout-main span').textContent.split(' vs ')[0] },
      { name: boutDiv.querySelector('.bout-main span').textContent.split(' vs ')[1] }
    ],
    label: 'ai_analysis'
  });
  
  try {
    // Check if user has already voted
    const { data: existingVote, error: checkError } = await supabase
      .from('thumbs_votes')
      .select('*')
      .eq('user_id', currentUser.id)
      .eq('bout_id', boutId)
      .single();
    
    if (checkError && checkError.code !== 'PGRST116') {
      throw checkError;
    }
    
    if (existingVote) {
      // Remove existing vote if same type, or change vote
      if (existingVote.vote_type === voteType) {
        // Remove vote
        await supabase
          .from('thumbs_votes')
          .delete()
          .eq('user_id', currentUser.id)
          .eq('bout_id', boutId);
      } else {
        // Change vote
        await supabase
          .from('thumbs_votes')
          .update({ vote_type: voteType })
          .eq('user_id', currentUser.id)
          .eq('bout_id', boutId);
      }
    } else {
      // Insert new vote
      await supabase
        .from('thumbs_votes')
        .insert([
          {
            user_id: currentUser.id,
            bout_id: boutId,
            vote_type: voteType,
            created_at: new Date().toISOString()
          }
        ]);
    }
    
    // Update display
    loadThumbsVotes(boutDiv);
    
  } catch (error) {
    console.error('Error handling thumbs vote:', error);
    showNotification('Error recording vote: ' + error.message, 'error');
  }
}

async function loadThumbsVotes(boutDiv) {
  const boutId = generateBoutId({
    fighters: [
      { name: boutDiv.querySelector('.bout-main span').textContent.split(' vs ')[0] },
      { name: boutDiv.querySelector('.bout-main span').textContent.split(' vs ')[1] }
    ],
    label: 'ai_analysis'
  });
  
  try {
    const { data: votes, error } = await supabase
      .from('thumbs_votes')
      .select('vote_type, user_id')
      .eq('bout_id', boutId);
    
    if (error) {
      throw error;
    }
    
    const thumbsUpCount = votes.filter(v => v.vote_type === 'up').length;
    const thumbsDownCount = votes.filter(v => v.vote_type === 'down').length;
    
    // Update counts
    const thumbsUpCountEl = boutDiv.querySelector('.thumbs-up-count');
    const thumbsDownCountEl = boutDiv.querySelector('.thumbs-down-count');
    if (thumbsUpCountEl) thumbsUpCountEl.textContent = thumbsUpCount;
    if (thumbsDownCountEl) thumbsDownCountEl.textContent = thumbsDownCount;
    
    // Update button states
    const thumbsUpBtn = boutDiv.querySelector('.thumbs-up');
    const thumbsDownBtn = boutDiv.querySelector('.thumbs-down');
    if (currentUser) {
      const userVote = votes.find(v => v.user_id === currentUser.id);
      if (userVote) {
        if (userVote.vote_type === 'up') {
          thumbsUpBtn.classList.add('active');
          thumbsDownBtn.classList.remove('active');
        } else {
          thumbsDownBtn.classList.add('active');
          thumbsUpBtn.classList.remove('active');
        }
      } else {
        thumbsUpBtn.classList.remove('active');
        thumbsDownBtn.classList.remove('active');
      }
    } else {
      thumbsUpBtn.classList.remove('active');
      thumbsDownBtn.classList.remove('active');
    }
    // Swap image src based on active state
    const thumbsUpImg = thumbsUpBtn.querySelector('img');
    const thumbsDownImg = thumbsDownBtn.querySelector('img');
    if (thumbsUpImg) {
      if (thumbsUpBtn.classList.contains('active')) {
        thumbsUpImg.src = 'src/assets/icons/selected_upvote.png';
      } else {
        thumbsUpImg.src = 'src/assets/icons/upvote.png';
      }
    }
    if (thumbsDownImg) {
      if (thumbsDownBtn.classList.contains('active')) {
        thumbsDownImg.src = 'src/assets/icons/selected_downvote.png';
      } else {
        thumbsDownImg.src = 'src/assets/icons/downvote.png';
      }
    }
    
  } catch (error) {
    console.error('Error loading thumbs votes:', error);
  }
}

window.showProfileModal = showProfileModal; 

// Helper to expand method abbreviations
function expandMethod(method) {
  if (!method) return '';
  if (/^S ?Dec$/i.test(method)) return 'Split Decision';
  if (/^U ?Dec$/i.test(method)) return 'Unanimous Decision';
  if (/^Sub$/i.test(method)) return 'Submission';
  return method;
}

// Helper: fuzzy match fighter name for octagonFightersData
function fuzzyFindOctagonFighter(name) {
  if (!octagonFightersData || !name) return null;
  if (octagonFightersData[name]) return octagonFightersData[name];
  // Try case-insensitive and partial match
  const lower = name.toLowerCase();
  let best = null, bestScore = 0;
  for (const key in octagonFightersData) {
    const keyLower = key.toLowerCase();
    if (keyLower === lower) return octagonFightersData[key];
    // Partial match: last name or first name
    if (keyLower.includes(lower) || lower.includes(keyLower)) {
      if (keyLower.length > bestScore) {
        best = octagonFightersData[key];
        bestScore = keyLower.length;
      }
    }
    // Try last name match
    const last = lower.split(' ').pop();
    if (keyLower.endsWith(last)) {
      if (keyLower.length > bestScore) {
        best = octagonFightersData[key];
        bestScore = keyLower.length;
      }
    }
  }
  return best;
}

// Patch: Use fuzzy matching for rankings faces
function renderRankingsFighterImage(name) {
  // Try fighter_profiles.json first
  let fighterData = fightersData && fightersData[name] ? fightersData[name] : null;
  let imgUrl = getProfileFighterImageUrl(fighterData);
  if (!imgUrl) {
    // Fallback to octagonFightersData (fuzzy match)
    fighterData = fuzzyFindOctagonFighter(name) || {};
    imgUrl = getOctagonFighterImageUrl(fighterData);
  }
  let headshot;
  if (imgUrl) {
    headshot = document.createElement('img');
    headshot.className = 'rankings-headshot';
    headshot.src = imgUrl;
    headshot.alt = name;
    headshot.onerror = () => {
      headshot.replaceWith(blankHeadshotSVG(32, 'rankings-headshot'));
    };
  } else {
    headshot = blankHeadshotSVG(32, 'rankings-headshot');
  }
  return headshot;
}

function showGifStickerModal(defaultTab) {
  const modal = document.getElementById('gif-sticker-modal');
  const modalContent = document.getElementById('gif-sticker-modal-content');
  let activeTab = defaultTab;
  function renderTabs() {
    modalContent.innerHTML = `
      <div style="position:absolute;top:0;left:0;width:100%;z-index:2;background:#181818;display:grid;grid-template-columns:1fr 1fr;align-items:center;text-align:center;">
        <button id="gif-tab-btn" style="padding:0.5rem 0;border-radius:0;border:none;background:${activeTab==='gif' ? '#e11d48' : '#222'};color:#fff;font-weight:600;cursor:pointer;font-size:1.1rem;width:100%;">GIFs</button>
        <button id="sticker-tab-btn" style="padding:0.5rem 0;border-radius:0;border:none;background:${activeTab==='sticker' ? '#e11d48' : '#222'};color:#fff;font-weight:600;cursor:pointer;font-size:1.1rem;width:100%;">Stickers</button>
      </div>
      <div style="height:2.5rem;"></div>
      <div id="gif-sticker-grid"></div>
    `;
    document.getElementById('gif-tab-btn').onclick = () => { activeTab = 'gif'; renderTabs(); };
    document.getElementById('sticker-tab-btn').onclick = () => { activeTab = 'sticker'; renderTabs(); };
    renderGrid();
  }
  function renderGrid() {
    let files = [];
    if (activeTab === 'gif') {
      files = [
        'src/assets/gifs/comm_shocked.gif',
        'src/assets/gifs/dana_idk.gif',
        'src/assets/gifs/goggins.gif',
        'src/assets/gifs/derrick.gif',
        'src/assets/gifs/jones_dancing.gif',
        'src/assets/gifs/alex_stare.gif',
        'src/assets/gifs/cory.gif',
        'src/assets/gifs/alex_daddy.gif',
        'src/assets/gifs/random_shocked.gif',
        'src/assets/gifs/alex.gif',
        'src/assets/gifs/alex_khaby.gif',
        'src/assets/gifs/hasbulla.gif',
        'src/assets/gifs/connor_cracked.gif',
        'src/assets/gifs/connor_money.gif',
        'src/assets/gifs/connor_rip.gif',
        'src/assets/gifs/connor_strut.gif',
        'src/assets/gifs/connor_icecream.gif',
        'src/assets/gifs/ddp_suit.gif',
        'src/assets/gifs/masvidal.gif',
        'src/assets/gifs/masvidal_knockout.gif',
        'src/assets/gifs/izzy_hump.gif',
        'src/assets/gifs/khabib_rizz.gif',
      ];
    } else if (activeTab === 'sticker') {
      files = [
        'src/assets/stickers/rogan_yelling.png',
        'src/assets/stickers/shocked.png',
        'src/assets/stickers/dana_evil.png',
        'src/assets/stickers/danapink.png',
        'src/assets/stickers/connor_vs_chandler.png',
        'src/assets/stickers/hood_strickland.png',
        'src/assets/stickers/rogan_shocked.png',
        'src/assets/stickers/hasbulla_shocked.png',
        'src/assets/stickers/usman_dead.png',
        'src/assets/stickers/holland.png',
        'src/assets/stickers/diaz.png',
        'src/assets/stickers/khamzat_stare.png',
        'src/assets/stickers/connor_sleep.png',
      ];
    }
    document.getElementById('gif-sticker-grid').innerHTML = `<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:1rem;max-height:60vh;overflow-y:auto;width:100%;padding-top:0.5rem;">${files.map(f => `<img src="${f}" data-file="${f}" style="width:100%;max-width:180px;max-height:180px;object-fit:cover;cursor:pointer;border-radius:8px;box-shadow:0 2px 8px #0002;background:#222;">`).join('')}</div>`;
    document.getElementById('gif-sticker-grid').querySelectorAll('img').forEach(img => {
      img.onclick = () => {
        sendGifStickerMessage(activeTab, img.getAttribute('data-file'));
        modal.style.display = 'none';
      };
    });
  }
  modal.style.display = 'block';
  renderTabs();
}