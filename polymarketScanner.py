import json
import time
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor
from flask import Flask, render_template, request, jsonify
import requests

app = Flask(__name__)

GAMMA_API = "https://gamma-api.polymarket.com"
CACHE = {}
CACHE_TTL = 60  # 1 minute cache

def fetch_page(session, page, page_size):
    offset = page * page_size
    url = (
        f"{GAMMA_API}/markets"
        f"?active=true&closed=false"
        f"&limit={page_size}&offset={offset}"
        f"&order=volume&ascending=false"
    )
    try:
        resp = session.get(url, timeout=10)
        resp.raise_for_status()
        return resp.json()
    except Exception:
        return []

def fetch_markets_parallel(pages=10, page_size=50):
    cache_key = f"markets_{pages}_{page_size}"
    now = time.time()
    
    if cache_key in CACHE:
        data, timestamp = CACHE[cache_key]
        if now - timestamp < CACHE_TTL:
            return data

    markets = []
    session = requests.Session()
    
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(fetch_page, session, p, page_size) for p in range(pages)]
        for future in futures:
            batch = future.result()
            if batch:
                markets.extend(batch)
    
    CACHE[cache_key] = (markets, now)
    return markets

def parse_prices(s):
    try:
        return [float(p) for p in json.loads(s)]
    except Exception:
        return []

def parse_outcomes(s):
    try:
        return json.loads(s)
    except Exception:
        return []

def days_until(date_str):
    if not date_str:
        return None
    for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%d"):
        try:
            end = datetime.strptime(date_str, fmt).replace(tzinfo=timezone.utc)
            delta = end - datetime.now(timezone.utc)
            return round(delta.total_seconds() / 86400, 1)
        except ValueError:
            continue
    return None

def analyze(markets, min_prob=0.90, min_volume=1000, sort_by="volume"):
    results = []
    for m in markets:
        prices   = parse_prices(m.get("outcomePrices", "[]"))
        outcomes = parse_outcomes(m.get("outcomes", "[]"))
        if not prices:
            continue
        
        lead_idx   = prices.index(max(prices))
        lead_prob  = prices[lead_idx]
        lead_label = outcomes[lead_idx] if lead_idx < len(outcomes) else "?"
        
        try:
            volume = float(m.get("volume") or 0)
        except (ValueError, TypeError):
            volume = 0.0
            
        if lead_prob < min_prob or volume < min_volume:
            continue
            
        days = days_until(m.get("endDate"))
        
        # Filter out expired markets
        if days is not None and days < 0:
            continue
            
        # Create a human-readable time label
        if days is None:
            time_label = "—"
        elif days < 0:
            time_label = "Expired"
        elif days < 0.04: # Less than 1 hour
            time_label = "Ending Now"
        elif days < 1:
            time_label = "Today"
        elif days < 2:
            time_label = "Tomorrow"
        elif days < 7:
            time_label = f"{int(days)} days"
        else:
            time_label = f"{int(days // 7)} weeks"

        results.append({
            "question":     m.get("question") or m.get("title") or "—",
            "slug":         m.get("slug", ""),
            "lead_label":   lead_label,
            "lead_prob":    round(lead_prob * 100, 1),
            "volume":       volume,
            "volume_fmt":   f"${volume:,.0f}",
            "end_date":     (m.get("endDate") or "")[:10],
            "days_left":    days,
            "time_label":   time_label,
            "url":          f"https://polymarket.com/market/{m.get('slug', '')}",
        })
        
    if sort_by == "end_date":
        results.sort(key=lambda x: (x["days_left"] is None, x["days_left"] or 99999))
    elif sort_by == "prob":
        results.sort(key=lambda x: x["lead_prob"], reverse=True)
    else:
        results.sort(key=lambda x: x["volume"], reverse=True)
    return results

@app.route("/", methods=["GET"])
def index():
    return render_template("index.html")

@app.route("/api/scan", methods=["GET"])
def api_scan():
    try:
        min_prob   = float(request.args.get("min_prob",   90)) / 100
        min_volume = float(request.args.get("min_volume", 1000))
        sort_by    = request.args.get("sort_by", "volume")
        pages      = min(int(request.args.get("pages", 10)), 50) # Cap at 50 pages

        raw = fetch_markets_parallel(pages=pages)
        results = analyze(raw, min_prob=min_prob, min_volume=min_volume, sort_by=sort_by)
        
        return jsonify({
            "status": "success",
            "total": len(results),
            "results": results,
            "params": {
                "min_prob": int(min_prob * 100),
                "min_volume": int(min_volume),
                "sort_by": sort_by,
                "pages": pages
            }
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True, port=5000)
