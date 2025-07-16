import asyncio
import datetime
import re
import json
from playwright.async_api import async_playwright

SCHEDULE_URL = "https://www.espn.com/mma/schedule/_/league/ufc"

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

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.goto(SCHEDULE_URL, timeout=60000)
        await page.wait_for_selector('.Table__Title')
        # Find the 'Past Results' table
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
            await browser.close()
            return
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
            # Try to parse date as this year
            try:
                event_dt = datetime.datetime.strptime(f"{date} {now.year}", "%b %d %Y")
            except Exception:
                try:
                    event_dt = datetime.datetime.strptime(f"{date} {now.year}", "%B %d %Y")
                except Exception:
                    continue
            if event_dt < now:
                # Get event link
                link_el = await event_col.query_selector('a')
                event_link = await link_el.get_attribute('href') if link_el else None
                if event_link and not event_link.startswith('http'):
                    event_link = 'https://www.espn.com' + event_link
                past_events.append((event_dt, name, date, location, event_link))
        past_events.sort(reverse=True)
        if not past_events:
            print('No past events found.')
            await browser.close()
            return
        # Only process the most recent completed event
        latest = past_events[0]
        print(f"Most recent completed event: {latest[0].strftime('%Y-%m-%d')}: {latest[1]} ({latest[2]}) @ {latest[3]}")
        print(f"Event link: {latest[4]}")
        # Go to event page and scrape bout results
        if not latest[4]:
            print('No event link found for most recent event.')
            await browser.close()
            return
        await page.goto(latest[4], timeout=60000)
        await page.wait_for_selector('section.Card.MMAFightCard', timeout=15000)
        card_sections = await page.query_selector_all('section.Card.MMAFightCard')
        results = []
        for section in card_sections:
            gamestrips = await section.query_selector_all('.MMAFightCard__Gamestrip')
            for gamestrip in gamestrips:
                # Fighters
                fighter_els = await gamestrip.query_selector_all('.MMACompetitor__Detail h2 span')
                fighters = [((await el.inner_text()).strip()) for el in fighter_els]
                # Winner: find .MMACompetitor with .MMACompetitor__arrow svg
                winner = ''
                competitor_blocks = await gamestrip.query_selector_all('.MMACompetitor')
                for comp in competitor_blocks:
                    arrow = await comp.query_selector('.MMACompetitor__arrow')
                    if arrow:
                        winner_name_el = await comp.query_selector('.MMACompetitor__Detail h2 span')
                        if winner_name_el:
                            winner = (await winner_name_el.inner_text()).strip()
                            break
                # Method, round, time: from .Gamestrip__Time--wrapper .tc
                method = ''
                round_ = ''
                time = ''
                time_wrapper = await gamestrip.query_selector('.Gamestrip__Time--wrapper .tc')
                if time_wrapper:
                    h8s = await time_wrapper.query_selector_all('.h8')
                    if len(h8s) >= 2:
                        # h8[1] is method
                        method = (await h8s[1].inner_text()).strip()
                    n9 = await time_wrapper.query_selector('.n9')
                    if n9:
                        round_time = (await n9.inner_text()).strip()
                        # Usually like 'R1, 0:35'
                        if ',' in round_time:
                            round_, time = [s.strip() for s in round_time.split(',', 1)]
                        else:
                            round_ = round_time
                # Bout label (e.g., Main Event, Prelim, etc.)
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
        print("\nBout results for most recent event:")
        for bout in results:
            print(bout)
        # Save to src/data/ufc_results.json
        event_data = {
            'event_date': latest[0].strftime('%Y-%m-%d'),
            'event_name': latest[1],
            'event_date_str': latest[2],
            'event_location': latest[3],
            'event_link': latest[4],
            'bouts': results
        }
        with open('src/data/ufc_results.json', 'w', encoding='utf-8') as f:
            json.dump(event_data, f, ensure_ascii=False, indent=2)
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main()) 