import requests
import json
import re
import time

API_KEY = "fc-9ecdefe82fab40d598a2bc0c6571701d"
FIRECRAWL_ENDPOINT = "https://api.firecrawl.dev/v1/scrape"
SCHEDULE_URL = "https://www.espn.com/mma/schedule/_/league/ufc"

HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

def firecrawl_scrape(url):
    payload = {"url": url}
    response = requests.post(FIRECRAWL_ENDPOINT, headers=HEADERS, json=payload)
    if response.status_code == 200:
        return response.json().get('data', {})
    else:
        print(f"Error scraping {url}: {response.status_code}")
        return None

def parse_schedule_table(markdown):
    events = []
    for line in markdown.split('\n'):
        if line.strip().startswith('|') and 'UFC' in line:
            # Split columns
            cols = [c.strip() for c in line.strip('|').split('|')]
            if len(cols) >= 5:
                date = cols[0]
                # Event name and link
                event_match = re.search(r'\[([^\]]+)\]\(([^)]+)\)', cols[3])
                if event_match:
                    event_name = event_match.group(1)
                    event_link = event_match.group(2)
                else:
                    event_name = cols[3]
                    event_link = ''
                location = cols[4]
                # Filter out Dana White's Contender Series
                if "contender series" not in event_name.lower():
                    events.append({
                        'date': date,
                        'name': event_name,
                        'link': event_link,
                        'location': location
                    })
    return events

def parse_event_fightcard(markdown):
    lines = markdown.split('\n')
    main_card = []
    prelim_card = []
    current_section = 'main'
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        # Use 'Prelims' line as section marker
        if line.lower() == 'prelims':
            current_section = 'prelim'
            i += 1
            continue
        if line.startswith('[Fightcenter]('):
            bout = {'fighters': []}
            i += 1
            # Skip blank lines
            while i < len(lines) and lines[i].strip() == '':
                i += 1
            # Skip date line if present
            if i < len(lines) and re.match(r'^(Sat|Sun|Fri|Thu|Wed|Tue|Mon),', lines[i].strip()):
                i += 1
            # Skip blank lines and TV info
            while i < len(lines) and (lines[i].strip() == '' or 'ESPN' in lines[i] or 'UFC Fight Pass' in lines[i]):
                i += 1
            # Extract up to two fighters and their records
            for _ in range(2):
                while i < len(lines) and lines[i].strip() == '':
                    i += 1
                fighter_name = ''
                if i < len(lines):
                    m = re.search(r'\*\*(.*?)\*\*', lines[i])
                    if m:
                        fighter_name = m.group(1).strip()
                        i += 1
                while i < len(lines) and lines[i].strip() == '':
                    i += 1
                fighter_record = ''
                if i < len(lines) and re.match(r'^[0-9]+-[0-9]+-[0-9]+$', lines[i].strip()):
                    fighter_record = lines[i].strip()
                    i += 1
                if fighter_name:
                    bout['fighters'].append({'name': fighter_name, 'record': fighter_record})
            # Only add if both fighters are present
            if len(bout['fighters']) == 2:
                if current_section == 'main':
                    main_card.append(bout)
                else:
                    prelim_card.append(bout)
        else:
            i += 1
    return main_card, prelim_card

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

def scrape_ufc_events_and_fightcards():
    print("Scraping ESPN UFC schedule page...")
    schedule_data = firecrawl_scrape(SCHEDULE_URL)
    if not schedule_data:
        print("Failed to get schedule page.")
        return
    markdown = schedule_data.get('markdown', '')
    events = parse_schedule_table(markdown)
    print(f"Found {len(events)} UFC events.")
    all_event_data = []
    for event in events:
        print(f"Scraping event: {event['name']} ({event['date']})")
        event_data = {
            'event_name': event['name'],
            'event_date': event['date'],
            'location': event['location'],
            'main_card': [],
            'prelims': []
        }
        if event['link']:
            event_page = firecrawl_scrape(event['link'])
            if event_page:
                event_markdown = event_page.get('markdown', '')
                # Print first 20 lines of event markdown for debugging
                print(f"--- {event['name']} ({event['date']}) markdown preview ---")
                for idx, line in enumerate(event_markdown.split('\n')):
                    if idx >= 20:
                        break
                    print(f"{idx+1:02}: {line}")
                print(f"--- End of {event['name']} preview ---\n")
                main_card, prelim_card = parse_event_fightcard(event_markdown)
                event_data['main_card'] = label_card_bouts(main_card, 'main')
                event_data['prelims'] = label_card_bouts(prelim_card, 'prelim')
                time.sleep(1)  # Be polite to the API
        # Only add events with at least one fight
        if event_data['main_card'] or event_data['prelims']:
            all_event_data.append(event_data)
    print(json.dumps(all_event_data, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    scrape_ufc_events_and_fightcards() 