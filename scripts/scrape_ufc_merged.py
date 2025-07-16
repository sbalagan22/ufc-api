import asyncio
import json
import datetime
import os
import re
from playwright.async_api import async_playwright

SCHEDULE_URL = "https://www.espn.com/mma/schedule/_/league/ufc"
DATA_DIR = os.path.join(os.path.dirname(__file__), '../src/data')
UFC_EVENTS_PATH = os.path.join(DATA_DIR, 'ufc_events.json')
UFC_RESULTS_PATH = os.path.join(DATA_DIR, 'ufc_results.json')

def normalize_event_name(name):
    return re.sub(r'[^a-z0-9 ]', '', name.lower()).replace('  ', ' ').strip()

def normalize_event_date(date_str):
    try:
        dt = datetime.datetime.strptime(date_str, '%b %d')
        return dt.strftime('%b %d')
    except Exception:
        try:
            dt = datetime.datetime.strptime(date_str, '%B %d')
            return dt.strftime('%b %d')
        except Exception:
            return date_str.strip()

async def scrape_ufc_schedule(page):
    await page.set_extra_http_headers({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    })
    await page.goto(SCHEDULE_URL, timeout=60000)
    events = []
    rows = await page.query_selector_all('table tbody tr')
    for row in rows:
        cols = await row.query_selector_all('td')
        if len(cols) < 5:
            continue
        date = (await cols[0].inner_text()).strip()
        event_link_el = await cols[3].query_selector('a')
        if not event_link_el:
            continue
        event_name = (await event_link_el.inner_text()).strip()
        event_link = await event_link_el.get_attribute('href')
        if not event_link.startswith('http'):
            event_link = 'https://www.espn.com' + event_link
        location = (await cols[4].inner_text()).strip()
        if "contender series" in event_name.lower():
            continue
        events.append({
            'event_name': event_name,
            'event_date': date,
            'event_link': event_link,
            'location': location
        })
    return events

async def scrape_event_fightcard(page, event_url):
    await page.goto(event_url)
    try:
        await page.wait_for_selector('section.Card.MMAFightCard', timeout=15000)
    except Exception:
        print(f"[WARN] Fight card selector not found for {event_url}")
        return [], []
    card_sections = await page.query_selector_all('section.Card.MMAFightCard')
    card_data = {}
    for section in card_sections:
        title_el = await section.query_selector('.Card__Header__Title')
        card_title = (await title_el.inner_text()).strip() if title_el else 'Unknown Card'
        fights = []
        gamestrips = await section.query_selector_all('.MMAFightCard__Gamestrip')
        for gamestrip in gamestrips:
            bout_type_el = await gamestrip.query_selector('.MMAFightCard__GameNote')
            bout_type = (await bout_type_el.inner_text()).strip() if bout_type_el else ''
            competitors = await gamestrip.query_selector_all('.MMACompetitor__Detail')
            fight = {'bout_type': bout_type, 'fighters': []}
            for competitor in competitors:
                name_el = await competitor.query_selector('h2 span')
                name = (await name_el.inner_text()).strip() if name_el else ''
                record_el = await competitor.query_selector('div.flex.items-center')
                record = (await record_el.inner_text()).strip() if record_el else ''
                fight['fighters'].append({'name': name, 'record': record})
            # --- ODDS EXTRACTION ---
            odds = {'awayOdds': None, 'homeOdds': None}
            odds_bar = await gamestrip.query_selector('div[data-testid="MMAGameStripBarOdds"]')
            if odds_bar:
                away_odds_el = await odds_bar.query_selector('#awayOdds')
                home_odds_el = await odds_bar.query_selector('#homeOdds')
                if away_odds_el:
                    odds['awayOdds'] = (await away_odds_el.inner_text()).strip()
                if home_odds_el:
                    odds['homeOdds'] = (await home_odds_el.inner_text()).strip()
            # Assign odds directly to fighters if present
            if len(fight['fighters']) >= 2:
                fight['fighters'][0]['odds'] = odds['awayOdds']
                fight['fighters'][1]['odds'] = odds['homeOdds']
            fights.append(fight)
        card_data[card_title] = fights
    main_card = card_data.get('Main Card', [])
    prelims = []
    for k, v in card_data.items():
        if 'prelim' in k.lower():
            prelims.extend(v)
    return main_card, prelims

def label_card_bouts(bouts, card_type='main'):
    labeled = []
    for idx, bout in enumerate(bouts):
        if card_type == 'main':
            if idx == 0:
                label = "main_event"
            elif idx == 1:
                label = "co_main"
            elif idx == 2:
                label = "featured_bout"
            else:
                label = f"main_card_bout_{idx+1}"
        else:
            label = f"prelim_card_bout_{idx+1}"
        # Only keep name, record, and odds for each fighter
        fighters = [{k: v for k, v in f.items() if k in ("name", "record", "odds")} for f in bout["fighters"]]
        bout_out = {"label": label, "fighters": fighters}
        labeled.append(bout_out)
    return labeled

async def scrape_latest_completed_event_results(page):
    await page.goto(SCHEDULE_URL, timeout=60000)
    await page.wait_for_selector('.Table__Title')
    titles = await page.query_selector_all('.Table__Title')
    past_table = None
    for title in titles:
        text = (await title.inner_text()).strip()
        if text.lower() == 'past results':
            past_table_handle = await title.evaluate_handle('el => { let n = el; while (n && n.nextSibling) { n = n.nextSibling; if (n.tagName === "TABLE") return n; if (n.querySelector && n.querySelector("table")) return n.querySelector("table"); } return null; }')
            past_table = past_table_handle.as_element() if past_table_handle else None
            break
    if not past_table:
        print('Could not find Past Results table.')
        return None
    rows = await past_table.query_selector_all('tbody tr')
    now = datetime.datetime.now()
    past_events = []
    for row in rows:
        cols = await row.query_selector_all('td')
        if len(cols) < 4:
            continue
        date = (await cols[0].inner_text()).strip()
        event_col = cols[1]
        name = (await event_col.inner_text()).strip()
        location = (await cols[2].inner_text()).strip()
        try:
            event_dt = datetime.datetime.strptime(f"{date} {now.year}", "%b %d %Y")
        except Exception:
            try:
                event_dt = datetime.datetime.strptime(f"{date} {now.year}", "%B %d %Y")
            except Exception:
                continue
        if event_dt < now:
            link_el = await event_col.query_selector('a')
            event_link = await link_el.get_attribute('href') if link_el else None
            if event_link and not event_link.startswith('http'):
                event_link = 'https://www.espn.com' + event_link
            past_events.append((event_dt, name, date, location, event_link))
    past_events.sort(reverse=True)
    if not past_events:
        print('No past events found.')
        return None
    latest = past_events[0]
    if not latest[4]:
        print('No event link found for most recent event.')
        return None
    await page.goto(latest[4], timeout=60000)
    await page.wait_for_selector('section.Card.MMAFightCard', timeout=15000)
    card_sections = await page.query_selector_all('section.Card.MMAFightCard')
    results = []
    for section in card_sections:
        gamestrips = await section.query_selector_all('.MMAFightCard__Gamestrip')
        for gamestrip in gamestrips:
            fighter_els = await gamestrip.query_selector_all('.MMACompetitor__Detail h2 span')
            fighters = [((await el.inner_text()).strip()) for el in fighter_els]
            winner = ''
            competitor_blocks = await gamestrip.query_selector_all('.MMACompetitor')
            for comp in competitor_blocks:
                arrow = await comp.query_selector('.MMACompetitor__arrow')
                if arrow:
                    winner_name_el = await comp.query_selector('.MMACompetitor__Detail h2 span')
                    if winner_name_el:
                        winner = (await winner_name_el.inner_text()).strip()
                        break
            method = ''
            round_ = ''
            time = ''
            time_wrapper = await gamestrip.query_selector('.Gamestrip__Time--wrapper .tc')
            if time_wrapper:
                h8s = await time_wrapper.query_selector_all('.h8')
                if len(h8s) >= 2:
                    method = (await h8s[1].inner_text()).strip()
                n9 = await time_wrapper.query_selector('.n9')
                if n9:
                    round_time = (await n9.inner_text()).strip()
                    if ',' in round_time:
                        round_, time = [s.strip() for s in round_time.split(',', 1)]
                    else:
                        round_ = round_time
            label_el = await gamestrip.query_selector('.MMAFightCard__GameNote')
            label = (await label_el.inner_text()).strip() if label_el else ''
            results.append({
                'fighters': fighters,
                'label': label,
                'winner': winner,
                'method': method,
                'round': round_,
                'time': time
            })
    event_data = {
        'event_date': latest[0].strftime('%Y-%m-%d'),
        'event_name': latest[1],
        'event_date_str': latest[2],
        'event_location': latest[3],
        'event_link': latest[4],
        'bouts': results
    }
    return event_data

async def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        # Scrape all events (future + most recent past)
        events = await scrape_ufc_schedule(page)
        all_event_data = []
        now = datetime.datetime.now()
        most_recent_past = None
        most_recent_past_date = None
        future_events = []
        for event in events:
            try:
                event_dt = datetime.datetime.strptime(f"{event['event_date']} {now.year}", "%b %d %Y")
            except Exception:
                continue
            if event_dt < now:
                if (most_recent_past_date is None) or (event_dt > most_recent_past_date):
                    most_recent_past = event
                    most_recent_past_date = event_dt
            else:
                future_events.append((event_dt, event))
        future_events.sort()
        # Scrape most recent past event (if any)
        if most_recent_past:
            print(f"Scraping most recent past event: {most_recent_past['event_name']} ({most_recent_past['event_date']})")
            main_card, prelims = await scrape_event_fightcard(page, most_recent_past['event_link'])
            event_data = {
                'event_name': most_recent_past['event_name'],
                'event_date': most_recent_past['event_date'],
                'location': most_recent_past['location'],
                'main_card': label_card_bouts(main_card, 'main'),
                'prelims': label_card_bouts(prelims, 'prelim')
            }
            if event_data['main_card'] or event_data['prelims']:
                all_event_data.append(event_data)
        # Scrape all future events
        for _, event in future_events:
            print(f"Scraping future event: {event['event_name']} ({event['event_date']})")
            main_card, prelims = await scrape_event_fightcard(page, event['event_link'])
            event_data = {
                'event_name': event['event_name'],
                'event_date': event['event_date'],
                'location': event['location'],
                'main_card': label_card_bouts(main_card, 'main'),
                'prelims': label_card_bouts(prelims, 'prelim')
            }
            if event_data['main_card'] or event_data['prelims']:
                all_event_data.append(event_data)
        # Save event schedule/fightcards
        with open(UFC_EVENTS_PATH, 'w', encoding='utf-8') as f:
            json.dump(all_event_data, f, indent=2, ensure_ascii=False)
        print(f"Saved scraped data to {UFC_EVENTS_PATH}")
        # Scrape and save latest completed event results
        latest_results = await scrape_latest_completed_event_results(page)
        if latest_results:
            with open(UFC_RESULTS_PATH, 'w', encoding='utf-8') as f:
                json.dump(latest_results, f, ensure_ascii=False, indent=2)
            print(f"Saved latest event results to {UFC_RESULTS_PATH}")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main()) 