import asyncio
from playwright.async_api import async_playwright
import json
import unicodedata
import os

UFC_PROFILE_BASE = "https://www.ufc.com/athlete/"

DATA_DIR = os.path.join(os.path.dirname(__file__), '../src/data')
FIGHTER_NAMES_PATH = os.path.join(DATA_DIR, 'fighter_names.txt')
UFC_EVENTS_PATH = os.path.join(DATA_DIR, 'ufc_events.json')
FIGHTER_PROFILES_PATH = os.path.join(DATA_DIR, 'fighter_profiles.json')

def fighter_name_to_url(name):
    url_name = (
        name.lower()
        .replace("'", "")
        .replace("'", "")
        .replace(" ", "-")
        .replace(".", "")
    )
    return UFC_PROFILE_BASE + url_name

def normalize_name(name):
    # Lowercase, remove accents, punctuation, and extra spaces
    name = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode('ascii')
    name = name.lower().replace("'", "").replace("'", "").replace(".", "").strip()
    return name

def get_last_name(name):
    return normalize_name(name.split()[-1])

async def scrape_fighter_profile(page, fighter_name):
    url = fighter_name_to_url(fighter_name)
    await page.goto(url, wait_until='networkidle')
    await page.wait_for_timeout(2000)  # Wait 2 seconds for JS to load
    # --- Profile Image ---
    profile_image_url = ""
    img_wrap = await page.query_selector('.hero-profile__image-wrap img.hero-profile__image')
    if img_wrap:
        profile_image_url = await img_wrap.get_attribute('src')
    # --- Finish Stats ---
    finish_stats = {}
    finish_stat_blocks = await page.query_selector_all('.hero-profile__stat')
    for stat in finish_stat_blocks:
        num_el = await stat.query_selector('.hero-profile__stat-numb')
        text_el = await stat.query_selector('.hero-profile__stat-text')
        if num_el and text_el:
            num = (await num_el.inner_text()).strip()
            text = (await text_el.inner_text()).strip().lower()
            if 'knockout' in text:
                finish_stats['wins_by_ko'] = num
            elif 'submission' in text:
                finish_stats['wins_by_sub'] = num
            elif 'first round' in text:
                finish_stats['first_round_finishes'] = num
    # --- Physical Stats ---
    physical_stats = {}
    bio_fields = await page.query_selector_all('.c-bio__field')
    for field in bio_fields:
        label_el = await field.query_selector('.c-bio__label')
        value_el = await field.query_selector('.c-bio__text')
        if label_el and value_el:
            label = (await label_el.inner_text()).strip().lower()
            # Age may be nested
            if label == 'age':
                age_div = await value_el.query_selector('.field--name-age')
                if age_div:
                    value = (await age_div.inner_text()).strip()
                else:
                    value = (await value_el.inner_text()).strip()
                physical_stats['age'] = value
            elif label == 'height':
                value = (await value_el.inner_text()).strip()
                physical_stats['height'] = value
            elif label == 'weight':
                value = (await value_el.inner_text()).strip()
                physical_stats['weight'] = value
            elif label == 'reach':
                value = (await value_el.inner_text()).strip()
                physical_stats['reach'] = value
    # --- Combat Stats ---
    combat_stats = {}
    try:
        await page.wait_for_selector('.c-stat-compare__group', timeout=10000)
    except Exception as e:
        print(f"[DEBUG] Timeout waiting for combat stats for {fighter_name}: {e}")
    stat_groups = await page.query_selector_all('.c-stat-compare__group')
    print(f"[DEBUG] Found {len(stat_groups)} combat stat groups for {fighter_name}")
    for group in stat_groups:
        label_el = await group.query_selector('.c-stat-compare__label')
        value_el = await group.query_selector('.c-stat-compare__number')
        percent_el = await group.query_selector('.c-stat-compare__percent')
        if label_el and value_el:
            label_text = (await label_el.inner_text()).strip().lower()
            value_text = (await value_el.inner_text()).strip()
            if percent_el:
                percent_text = (await percent_el.inner_text()).strip()
                value_text = value_text.replace(percent_text, '').strip() + percent_text
            print(f"[DEBUG] Combat stat label: '{label_text}', value: '{value_text}' for {fighter_name}")
            # Normalize label for mapping
            if 'sig. str. landed' in label_text:
                combat_stats['sig_str_landed_per_min'] = value_text
            elif 'takedown avg' in label_text:
                combat_stats['takedown_avg_per_15min'] = value_text
            elif 'takedown defense' in label_text:
                combat_stats['takedown_defense_pct'] = value_text
            elif 'average fight time' in label_text:
                combat_stats['avg_fight_time'] = value_text
            elif 'sig. str. absorbed' in label_text:
                combat_stats['sig_str_absorbed_per_min'] = value_text
            elif 'submission avg' in label_text:
                combat_stats['submission_avg_per_15min'] = value_text
            elif 'sig. str. defense' in label_text:
                combat_stats['sig_str_defense_pct'] = value_text
            elif 'knockdown avg' in label_text:
                combat_stats['knockdown_avg'] = value_text
    # --- Last 5 Fights ---
    last_5_fights = []
    fight_articles = await page.query_selector_all('section.l-listing--stacked ul.l-listing__group > li.l-listing__item article.c-card-event--athlete-results')
    for article in fight_articles[:5]:
        info = await article.query_selector('.c-card-event--athlete-results__info')
        if not info:
            continue
        # Opponent
        headline = await info.query_selector('.c-card-event--athlete-results__headline')
        opponent = ""
        if headline:
            links = await headline.query_selector_all('a')
            names = [await l.inner_text() for l in links]
            norm_fighter = normalize_name(fighter_name)
            norm_last = get_last_name(fighter_name)
            filtered = [n for n in names if normalize_name(n) != norm_fighter and normalize_name(n) != norm_last]
            if filtered:
                opponent = filtered[0]
            else:
                opponent = next((n for n in names if normalize_name(n) != ''), '')
        # Date
        date_el = await info.query_selector('.c-card-event--athlete-results__date')
        date = (await date_el.inner_text()).strip() if date_el else ""
        # Results
        results = await info.query_selector_all('.c-card-event--athlete-results__result')
        round_, time, method = "", "", ""
        for r in results:
            label = await r.query_selector('.c-card-event--athlete-results__result-label')
            val = await r.query_selector('.c-card-event--athlete-results__result-text')
            if not label or not val:
                continue
            label_text = (await label.inner_text()).strip()
            val_text = (await val.inner_text()).strip()
            if label_text == "Round":
                round_ = val_text
            elif label_text == "Time":
                time = val_text
            elif label_text == "Method":
                method = val_text
        # Win/Loss
        # Determine win/loss for the current fighter
        result = ""
        win_imgs = await article.query_selector_all('.c-card-event--athlete-results__image.win')
        is_win = False
        for win_img in win_imgs:
            a_tag = await win_img.query_selector('a')
            if a_tag:
                href = await a_tag.get_attribute('href')
                if href and fighter_name_to_url(fighter_name).endswith(href.strip('/').split('/')[-1]):
                    is_win = True
                    break
        result = "WIN" if is_win else "LOSS"
        last_5_fights.append({
            "opponent": opponent,
            "date": date,
            "round": round_,
            "time": time,
            "method": method,
            "result": result
        })

    return {
        "ufc_profile_url": url,
        "profile_image_url": profile_image_url,
        "finish_stats": finish_stats,
        "physical_stats": physical_stats,
        "combat_stats": combat_stats,
        "last_5_fights": last_5_fights
    }

async def main():
    with open(FIGHTER_NAMES_PATH, 'r', encoding='utf-8') as f:
        all_fighters = [line.strip() for line in f if line.strip()]
    all_fighters = sorted(set(all_fighters), key=lambda x: x.lower())
    # Load existing fighter_profiles.json if it exists
    fighter_data = {}
    if os.path.exists(FIGHTER_PROFILES_PATH):
        with open(FIGHTER_PROFILES_PATH, 'r', encoding='utf-8') as f:
            fighter_data = json.load(f)
    # Normalize keys for case-insensitive lookup
    fighter_data_keys = {k.strip().lower(): k for k in fighter_data}
    # Find fighters in the most recent completed event
    import datetime
    most_recent_event_fighters = set()
    if os.path.exists(UFC_EVENTS_PATH):
        with open(UFC_EVENTS_PATH, 'r', encoding='utf-8') as f:
            events = json.load(f)
        now = datetime.datetime.now()
        most_recent_past = None
        most_recent_past_date = None
        for event in events:
            try:
                event_dt = datetime.datetime.strptime(f"{event['event_date']} {now.year}", "%b %d %Y")
            except Exception:
                continue
            if event_dt < now:
                if (most_recent_past_date is None) or (event_dt > most_recent_past_date):
                    most_recent_past = event
                    most_recent_past_date = event_dt
        if most_recent_past:
            for card in (most_recent_past.get('main_card', []) + most_recent_past.get('prelims', [])):
                for fighter in card['fighters']:
                    if fighter['name']:
                        most_recent_event_fighters.add(fighter['name'].strip().lower())
    # Only scrape if (a) not in fighter_data, or (b) in most recent event
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        for name in all_fighters:
            norm_name = name.strip().lower()
            needs_update = (norm_name not in fighter_data_keys) or (norm_name in most_recent_event_fighters)
            if not needs_update:
                print(f"Skipping {name} (already up to date)")
                continue
            print(f"Scraping UFC.com profile for {name} ...")
            try:
                fighter_data[name] = await scrape_fighter_profile(page, name)
            except Exception as e:
                print(f"Failed for {name}: {e}")
        await browser.close()
    with open(FIGHTER_PROFILES_PATH, 'w', encoding='utf-8') as f:
        json.dump(fighter_data, f, indent=2, ensure_ascii=False)
    print(f"Saved fighter profile data to {FIGHTER_PROFILES_PATH}")

if __name__ == "__main__":
    asyncio.run(main()) 