import asyncio
import json
from playwright.async_api import async_playwright

SCHEDULE_URL = "https://www.espn.com/mma/schedule/_/league/ufc"

async def scrape_ufc_schedule(page):
    await page.goto(SCHEDULE_URL)
    await page.wait_for_selector('table')
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
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        events = await scrape_ufc_schedule(page)
        all_event_data = []
        for idx, event in enumerate(events):
            print(f"Scraping event: {event['event_name']} ({event['event_date']})")
            debug_html = (idx == 0)  # Only save HTML for the first event
            main_card, prelims = await scrape_event_fightcard(page, event['event_link'], debug_html=debug_html)
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

async def main():
    all_event_data = await get_ufc_events()
    print(json.dumps(all_event_data, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    asyncio.run(main()) 