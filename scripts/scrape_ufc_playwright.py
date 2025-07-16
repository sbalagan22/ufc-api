import asyncio
import json
import datetime
import os
from playwright.async_api import async_playwright
import re

SCHEDULE_URL = "https://www.espn.com/mma/schedule/_/league/ufc"

# Change all file paths to src/data/
DATA_DIR = os.path.join(os.path.dirname(__file__), '../src/data')
UFC_EVENTS_PATH = os.path.join(DATA_DIR, 'ufc_events.json')
UFC_RESULTS_PATH = os.path.join(DATA_DIR, 'ufc_results.json')

async def scrape_ufc_schedule(page):
    await page.set_extra_http_headers({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    })
    await page.goto(SCHEDULE_URL, timeout=60000)  # 60 seconds
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

async def scrape_event_fightcard(page, event_url, debug_html=False):
    await page.goto(event_url)
    # Wait for a fight card selector or timeout after 15s
    try:
        await page.wait_for_selector('section.Card.MMAFightCard', timeout=15000)
    except Exception:
        print("[WARN] Fight card selector not found after 15s.")
    if debug_html:
        html = await page.content()
        with open('event_debug.html', 'w', encoding='utf-8') as f:
            f.write(html)
        print("\n--- Saved full HTML for first event to event_debug.html ---\n")
    card_sections = await page.query_selector_all('section.Card.MMAFightCard')
    card_data = {}
    for section in card_sections:
        # Card title (e.g., Main Card, Prelims)
        title_el = await section.query_selector('.Card__Header__Title')
        card_title = (await title_el.inner_text()).strip() if title_el else 'Unknown Card'
        fights = []
        gamestrips = await section.query_selector_all('.MMAFightCard__Gamestrip')
        for gamestrip in gamestrips:
            # Bout type (e.g., Heavyweight - Main Event)
            bout_type_el = await gamestrip.query_selector('.MMAFightCard__GameNote')
            bout_type = (await bout_type_el.inner_text()).strip() if bout_type_el else ''
            competitors = await gamestrip.query_selector_all('.MMACompetitor__Detail')
            fight = {'bout_type': bout_type, 'fighters': []}
            for competitor in competitors:
                name_el = await competitor.query_selector('h2 span')
                name = (await name_el.inner_text()).strip() if name_el else ''
                # Record is in the next div.flex after h2
                record_el = await competitor.query_selector('div.flex.items-center')
                record = (await record_el.inner_text()).strip() if record_el else ''
                # Try to get country (look for closest .lqtkC span in parent MMACompetitor)
                country = ''
                parent = await competitor.evaluate_handle('node => node.closest(".MMACompetitor")')
                if parent:
                    country_span = await parent.query_selector('span.lqtkC')
                    if country_span:
                        country = (await country_span.inner_text()).strip()
                fight['fighters'].append({'name': name, 'record': record, 'country': country})
            fights.append(fight)
        card_data[card_title] = fights
    # Try to split into main_card and prelims by card title
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
        labeled.append({"label": label, "fighters": bout['fighters']})
    return labeled

async def get_ufc_events():
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            events = await scrape_ufc_schedule(page)
            all_event_data = []
            now = datetime.datetime.now()
            most_recent_past = None
            most_recent_past_date = None
            future_events = []
            for event in events:
                # Parse event_date as this year
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
            # Sort future events by date
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
            await browser.close()
            return all_event_data
    except Exception as e:
        return {"error": f"Failed to scrape UFC events: {str(e)}"}

async def scrape_past_event_results(page, event_name, event_date):
    # Go to ESPN schedule page and scroll to past events
    await page.goto(SCHEDULE_URL, timeout=60000)
    await page.wait_for_selector('table')
    rows = await page.query_selector_all('table tbody tr')
    found_row = None
    for row in rows:
        cols = await row.query_selector_all('td')
        if len(cols) < 5:
            continue
        date = (await cols[0].inner_text()).strip()
        name = (await cols[3].inner_text()).strip()
        if name.lower() == event_name.lower() and date.lower() == event_date.lower():
            found_row = row
            break
    if not found_row:
        print(f"[WARN] Could not find event {event_name} ({event_date}) in ESPN past events table.")
        return None
    # Find link to event details
    event_link_el = await found_row.query_selector('a')
    if not event_link_el:
        print(f"[WARN] No link for event {event_name} ({event_date})")
        return None
    event_link = await event_link_el.get_attribute('href')
    if not event_link.startswith('http'):
        event_link = 'https://www.espn.com' + event_link
    # Go to event page and extract results
    await page.goto(event_link)
    await page.wait_for_selector('section.Card.MMAFightCard', timeout=15000)
    card_sections = await page.query_selector_all('section.Card.MMAFightCard')
    results = []
    for section in card_sections:
        gamestrips = await section.query_selector_all('.MMAFightCard__Gamestrip')
        for gamestrip in gamestrips:
            # Winner
            winner_el = await gamestrip.query_selector('.MMAFightCard__Competitor--winner h2 span')
            winner = (await winner_el.inner_text()).strip() if winner_el else ''
            # Method
            method_el = await gamestrip.query_selector('.MMAFightCard__Result')
            method = (await method_el.inner_text()).strip() if method_el else ''
            # Round
            round_el = await gamestrip.query_selector('.MMAFightCard__Round')
            round_ = (await round_el.inner_text()).strip() if round_el else ''
            results.append({
                'winner': winner,
                'method': method,
                'round': round_
            })
    return results

async def get_completed_events_with_results():
    # Load local ufc_events.json
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(UFC_EVENTS_PATH, 'r', encoding='utf-8') as f:
        all_events = json.load(f)
    today = datetime.datetime.now()
    completed = []
    for event in all_events:
        # Parse event_date as this year
        try:
            event_dt = datetime.datetime.strptime(f"{event['event_date']} {today.year}", "%b %d %Y")
        except Exception:
            continue
        if event_dt < today:
            completed.append(event)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        all_results = []
        for event in completed:
            print(f"Scraping results for completed event: {event['event_name']} ({event['event_date']})")
            results = await scrape_past_event_results(page, event['event_name'], event['event_date'])
            all_results.append({
                'event_name': event['event_name'],
                'event_date': event['event_date'],
                'results': results or []
            })
        await browser.close()
    with open(UFC_RESULTS_PATH, 'w', encoding='utf-8') as f:
        json.dump(all_results, f, indent=2, ensure_ascii=False)
    print(f"Saved completed event results to {UFC_RESULTS_PATH}")

async def main():
    all_event_data = await get_ufc_events()
    # Save to JSON file for frontend use
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(UFC_EVENTS_PATH, 'w', encoding='utf-8') as f:
        json.dump(all_event_data, f, indent=2, ensure_ascii=False)
    print(f"Saved scraped data to {UFC_EVENTS_PATH}")
    # Output all unique fighter names to fighter_names.txt
    all_fighters = set()
    for event in all_event_data:
        for card in (event.get('main_card', []) + event.get('prelims', [])):
            for fighter in card['fighters']:
                if fighter['name']:
                    all_fighters.add(fighter['name'])
    with open(os.path.join(DATA_DIR, 'fighter_names.txt'), 'w', encoding='utf-8') as f:
        for name in sorted(all_fighters):
            f.write(name + '\n')
    print(f"Saved {len(all_fighters)} unique fighter names to fighter_names.txt")

def normalize_event_name(name):
    # Lowercase, remove punctuation, collapse spaces
    return re.sub(r'[^a-z0-9 ]', '', name.lower()).replace('  ', ' ').strip()

def normalize_event_date(date_str):
    # Try to parse and reformat as 'Jul 12'
    try:
        dt = datetime.datetime.strptime(date_str, '%b %d')
        return dt.strftime('%b %d')
    except Exception:
        try:
            dt = datetime.datetime.strptime(date_str, '%B %d')
            return dt.strftime('%b %d')
        except Exception:
            return date_str.strip()

async def test_print_latest_completed_event():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.goto(SCHEDULE_URL, timeout=60000)
        await page.wait_for_selector('table')
        rows = await page.query_selector_all('table tbody tr')
        now = datetime.datetime.now()
        past_events = []
        for row in rows:
            cols = await row.query_selector_all('td')
            if len(cols) < 5:
                continue
            date = (await cols[0].inner_text()).strip()
            name = (await cols[3].inner_text()).strip()
            # Try to parse date as this year
            try:
                event_dt = datetime.datetime.strptime(f"{date} {now.year}", "%b %d %Y")
            except Exception:
                try:
                    event_dt = datetime.datetime.strptime(f"{date} {now.year}", "%B %d %Y")
                except Exception:
                    continue
            if event_dt < now:
                past_events.append((event_dt, name, date))
        past_events.sort(reverse=True)
        print("All past events found on ESPN schedule:")
        for dt, name, date in past_events:
            print(f"  {dt.strftime('%Y-%m-%d')}: {name} ({date}) [normalized: {normalize_event_name(name)}]")
        if past_events:
            latest = past_events[0]
            print("\nMost recent completed event:")
            print(f"  {latest[0].strftime('%Y-%m-%d')}: {latest[1]} ({latest[2]}) [normalized: {normalize_event_name(latest[1])}]")
        else:
            print("No past events found.")
        await browser.close()

if __name__ == "__main__":
    # Comment out main scraping for test
    # asyncio.run(main())
    # asyncio.run(get_completed_events_with_results())
    asyncio.run(test_print_latest_completed_event()) 