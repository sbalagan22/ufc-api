import json
import requests
import argparse
from datetime import datetime
import os
import re
import collections

DATA_DIR = os.path.join(os.path.dirname(__file__), '../src/data')
UFC_EVENTS_FILE = os.path.join(DATA_DIR, 'ufc_events.json')
PREDICTIONS_FILE = os.path.join(DATA_DIR, 'predictions.json')
GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'
GEMINI_API_KEY = 'AIzaSyAT3-ILX3PnZXEkFID5YUaKhvn_9UC6nGM'

PROMPT = (
    "You are given comprehensive profiles for two UFC fighters.  For each fighter, you will receive:\n"
    "  • Identity: full name, nickname (if any), fight camp/affiliation.\n"
    "  • Physical stats: weight class, age, height, reach, leg reach, stance (orthodox, southpaw, switch).\n"
    "  • Career summary: total pro fights, record (W–L–D), finish rate (percentage of wins by KO/TKO and by Submission).\n"
    "  • Striking metrics: significant strikes landed per minute (SLpM), significant strike accuracy (%), significant strike defense (%), strikes absorbed per minute (SApM).\n"
    "  • Grappling metrics: takedowns landed per 15 minutes (TD A), takedown accuracy (%), takedown defense (%), submission attempts per 15 minutes.\n"
    "  • Recent activity: for each of the last 3 fights, provide opponent name, date, outcome (win/loss), method (KO/TKO, Submission, Decision), round and time, plus time off between fights.\n"
    "\n"
    "Based on these data, predict:\n"
    "  1. “winner”: the fighter most likely to win.\n"
    "  2. “method”: the most probable method of victory (choose exactly one of KO/TKO, Submission, or Decision).\n"
    "  3. “reasoning”: a concise, professional analysis in the following format:\n"
    "     Overall: [thesis]\n"
    "     - [stat/factor 1]\n"
    "     - [stat/factor 2]\n"
    "     - [stat/factor 3]\n"
    "     Conclusion: [final summary]\n"
    "     (Use 3-4 bullet points max. Be extremely concise, use short sentences, and only the most important stats/factors. The entire reasoning must fit in a modal, so keep it under 600 characters. Be descriptive but not verbose. Do not use bold text in the 'Overall' section.)\n"
    "  4. “moneyline_odds”: American moneyline odds for your predicted winner, formatted as a JSON object with the winner’s name as key and a string value (e.g. “-220” or “+150”).\n"
    "  5. “method_odds”: American odds for your predicted method of victory, formatted as a JSON object with the method as key and a string value (e.g. “-120” or “+200”).\n"
    "\n"
    "Output **strictly** the following JSON (no extra fields, no nulls, no blanks):\n"
    "{\n"
    "  \"winner\": \"<Full Fighter Name>\",\n"
    "  \"method\": \"KO/TKO|Submission|Decision\",\n"
    "  \"reasoning\": \"<Your concise analysis in the required format>\",\n"
    "  \"moneyline_odds\": { \"<Winner Name>\": \"<-### or +###>\" },\n"
    "  \"method_odds\": { \"<Method>\": \"<-### or +###>\" }\n"
    "}\n"
    "\n"
    "Important:\n"
    "- **Do not** leave any odds field blank. If you’re uncertain, make your best data-driven estimate.\n"
    "- Always present odds as strings, including the sign character.\n"
    "- Ensure the JSON is valid and parsable.\n"
    "- The 'reasoning' field MUST follow the format: Overall: ...\\n- ...\\n- ...\\nConclusion: ...\n"
    "- Keep the reasoning concise and under 600 characters.\n"
    "- Do not use bold text in the 'Overall' section.\n"
    "- The 'winner' field must always be present and match one of the fighter names.\n"
)

def load_events():
    with open(UFC_EVENTS_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)

def find_next_event(events):
    now = datetime.now()
    soonest = None
    soonest_date = None
    for event in events:
        date_str = event.get('event_date')
        if not date_str:
            continue
        # Try current year, then next year if in the past
        for year in [now.year, now.year + 1]:
            try:
                event_date = datetime.strptime(f"{date_str} {year}", "%b %d %Y")
            except ValueError:
                continue
            if event_date >= now:
                if soonest_date is None or event_date < soonest_date:
                    soonest = event
                    soonest_date = event_date
                break
    return soonest

def build_skeleton(event):
    skeleton = []
    for section in ['main_card', 'prelims']:
        for bout in event.get(section, []):
            fighters = [f['name'] for f in bout.get('fighters', [])]
            skeleton.append({
                'event_name': event['event_name'],
                'label': bout.get('label', ''),
                'fighters': fighters,
                'winner': '',
                'method': '',
                'reasoning': '',
                'moneyline_odds': {'winner': '', 'odds': ''},
                'method_odds': {'method': '', 'odds': ''}
            })
    return skeleton

def call_gemini(api_key, fighterA, fighterB):
    headers = {'Content-Type': 'application/json'}
    url = f"{GEMINI_ENDPOINT}?key={api_key}"
    content = {
        "contents": [
            {
                "parts": [
                    {"text": PROMPT},
                    {"text": f"Fighter A: {json.dumps(fighterA, ensure_ascii=False)}"},
                    {"text": f"Fighter B: {json.dumps(fighterB, ensure_ascii=False)}"}
                ]
            }
        ]
    }
    resp = requests.post(url, headers=headers, json=content)
    if not resp.ok:
        raise Exception(f"Gemini API error: {resp.status_code} – {resp.text}")
    data = resp.json()
    text = ''
    try:
        text = ' '.join([p['text'] for p in data['candidates'][0]['content']['parts']])
        # Remove code block markers and leading/trailing whitespace
        text = re.sub(r'^```[a-zA-Z]*', '', text).strip()
        text = re.sub(r'```$', '', text).strip()
        # Robustly extract the first valid JSON object (from first { to matching })
        def extract_first_json(s):
            start = s.find('{')
            if start == -1:
                return None
            depth = 0
            for i in range(start, len(s)):
                if s[i] == '{':
                    depth += 1
                elif s[i] == '}':
                    depth -= 1
                    if depth == 0:
                        return s[start:i+1]
            return None
        json_str = extract_first_json(text)
        if not json_str:
            raise Exception('No JSON object found in Gemini response')
        result = json.loads(json_str)
        return result
    except Exception as e:
        raise Exception(f"Failed to parse Gemini response: {text}")

def main():
    # parser = argparse.ArgumentParser(description='Generate AI predictions for the next UFC event.')
    # parser.add_argument('--api-key', type=str, help='Gemini API key')
    # args = parser.parse_args()
    # api_key = args.api_key or os.environ.get('GEMINI_API_KEY')
    api_key = GEMINI_API_KEY
    # if not api_key:
    #     api_key = input('Enter your Gemini API key: ').strip()
    events = load_events()
    event = find_next_event(events)
    if not event:
        print('No upcoming event found.')
        return
    print(f"Generating predictions for: {event['event_name']}")
    skeleton = build_skeleton(event)
    # Optionally, load fighter stats from another file if available
    fighter_profiles = {}
    FIGHTER_PROFILES_FILE = os.path.join(DATA_DIR, 'fighter_profiles.json')
    if os.path.exists(FIGHTER_PROFILES_FILE):
        with open(FIGHTER_PROFILES_FILE, 'r', encoding='utf-8') as f:
            fighter_profiles = json.load(f)
    for bout in skeleton:
        fighters = bout['fighters']
        if len(fighters) != 2:
            continue
        fighterA = fighter_profiles.get(fighters[0], {"name": fighters[0]})
        fighterB = fighter_profiles.get(fighters[1], {"name": fighters[1]})
        print(f"Predicting: {fighters[0]} vs {fighters[1]} ...", end=' ')
        try:
            result = call_gemini(api_key, fighterA, fighterB)
            bout['winner'] = result.get('winner', '')
            bout['method'] = result.get('method', '')
            bout['reasoning'] = result.get('reasoning', '')
            # Use Gemini's output for odds directly, no fallback
            ml = result.get('moneyline_odds', {})
            mo = result.get('method_odds', {})
            if isinstance(ml, dict) and 'winner' in ml and 'odds' in ml:
                bout['moneyline_odds'] = { ml['winner']: ml['odds'] }
            elif isinstance(ml, dict) and len(ml) == 1:
                bout['moneyline_odds'] = ml
            else:
                bout['moneyline_odds'] = {}
            if isinstance(mo, dict) and 'method' in mo and 'odds' in mo:
                bout['method_odds'] = { mo['method']: mo['odds'] }
            elif isinstance(mo, dict) and len(mo) == 1:
                bout['method_odds'] = mo
            else:
                bout['method_odds'] = {}
            print(f"Winner: {bout['winner']} ({bout['method']})")
        except Exception as e:
            print(f"Error: {e}")
    with open(PREDICTIONS_FILE, 'w', encoding='utf-8') as f:
        json.dump(skeleton, f, indent=2, ensure_ascii=False)
    print(f"Predictions written to {PREDICTIONS_FILE}")

if __name__ == '__main__':
    main() 