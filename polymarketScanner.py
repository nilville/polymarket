import json
import threading
import time
import queue
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import requests
from flask import Flask, jsonify, render_template, request, Response

app = Flask(__name__)

GAMMA_API = "https://gamma-api.polymarket.com"
CACHE = {}
CACHE_TTL = 60  # 1 minute cache
CACHE_LOCK = threading.Lock()

# Global session for connection pooling
SESSION = requests.Session()

# SSE logic
listeners = []
listeners_lock = threading.Lock()

def fetch_page(page, page_size):
    offset = page * page_size
    url = (
        f"{GAMMA_API}/markets"
        f"?active=true&closed=false"
        f"&limit={page_size}&offset={offset}"
        f"&order=volume&ascending=false"
    )
    try:
        resp = SESSION.get(url, timeout=10)
        resp.raise_for_status()
        return resp.json()
    except (requests.exceptions.RequestException, ValueError):
        return []


def fetch_markets_parallel(pages=10, page_size=50):
    cache_key = f"markets_{pages}_{page_size}"
    now = time.time()

    with CACHE_LOCK:
        if cache_key in CACHE:
            data, timestamp = CACHE[cache_key]
            if now - timestamp < CACHE_TTL:
                return data

    unique_markets = {}
    with ThreadPoolExecutor(max_workers=20) as executor:
        futures = [
            executor.submit(fetch_page, p, page_size) for p in range(pages)
        ]
        for future in futures:
            try:
                batch = future.result(timeout=15)
                if batch:
                    for m in batch:
                        m_id = m.get("id")
                        if m_id and m_id not in unique_markets:
                            unique_markets[m_id] = m
            except Exception:
                continue

    markets = list(unique_markets.values())
    with CACHE_LOCK:
        CACHE[cache_key] = (markets, now)
    return markets


def parse_prices(s):
    try:
        if isinstance(s, list):
            return [float(p) for p in s]
        return [float(p) for p in json.loads(s)]
    except (ValueError, TypeError, json.JSONDecodeError):
        return []


def parse_outcomes(s):
    try:
        if isinstance(s, list):
            return s
        return json.loads(s)
    except (ValueError, TypeError, json.JSONDecodeError):
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


def analyze(markets, min_prob=0.90, max_prob=1.0, min_volume=1000, sort_by="volume", query=None):
    results = []
    query = query.lower() if query else None
    
    for m in markets:
        question = m.get("question") or m.get("title") or "—"
        
        # Keyword filtering
        if query and query not in question.lower():
            continue

        prices = parse_prices(m.get("outcomePrices", "[]"))
        outcomes = parse_outcomes(m.get("outcomes", "[]"))
        
        if not prices or not outcomes:
            continue

        try:
            max_price = max(prices)
            lead_idx = prices.index(max_price)
            lead_prob = prices[lead_idx]
            lead_label = outcomes[lead_idx] if lead_idx < len(outcomes) else "?"
        except (ValueError, IndexError):
            continue

        try:
            volume = float(m.get("volume") or 0)
        except (ValueError, TypeError):
            volume = 0.0

        if lead_prob < min_prob or lead_prob > max_prob or volume < min_volume:
            continue

        days = days_until(m.get("endDate"))

        # Filter out expired markets
        if days is not None and days < 0:
            continue

        # Create a human-readable time label
        if days is None:
            time_label = "—"
        elif days < 0.04:  # Less than 1 hour
            time_label = "Ending Now"
        elif days < 1:
            time_label = "Today"
        elif days < 2:
            time_label = "Tomorrow"
        elif days < 7:
            time_label = f"{int(days)} days"
        else:
            time_label = f"{int(days // 7)} weeks"

        results.append(
            {
                "id": m.get("id"),
                "question": m.get("question") or m.get("title") or "—",
                "lead_label": lead_label,
                "lead_prob": round(lead_prob * 100, 1),
                "volume": volume,
                "volume_fmt": f"${volume:,.0f}",
                "end_date": (m.get("endDate") or "")[:10],
                "days_left": days,
                "time_label": time_label,
                "url": f"https://polymarket.com/market/{m.get('slug', '')}",
            }
        )

    if sort_by == "end_date":
        results.sort(
            key=lambda x: (
                x["days_left"] is None,
                x["days_left"] if x["days_left"] is not None else 99999,
            )
        )
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
        # Strict validation of input parameters
        try:
            min_prob = float(request.args.get("min_prob", 90)) / 100
            min_prob = max(0, min(1, min_prob))
        except (ValueError, TypeError):
            min_prob = 0.90

        try:
            max_prob = float(request.args.get("max_prob", 100)) / 100
            max_prob = max(0, min(1, max_prob))
        except (ValueError, TypeError):
            max_prob = 1.0

        try:
            min_volume = float(request.args.get("min_volume", 1000))
            min_volume = max(0, min_volume)
        except (ValueError, TypeError):
            min_volume = 1000.0

        sort_by = request.args.get("sort_by", "volume")
        if sort_by not in ["volume", "prob", "end_date"]:
            sort_by = "volume"

        try:
            pages = min(max(int(request.args.get("pages", 10)), 1), 50)
        except (ValueError, TypeError):
            pages = 10

        query = request.args.get("query", "")

        raw = fetch_markets_parallel(pages=pages)
        results = analyze(
            raw, min_prob=min_prob, max_prob=max_prob, min_volume=min_volume, sort_by=sort_by, query=query
        )

        return jsonify(
            {
                "status": "success",
                "total": len(results),
                "results": results
            }
        )
    except Exception as e:
        return jsonify({"status": "error", "message": "An internal error occurred"}), 500

@app.route("/api/stream")
def stream():
    def event_stream():
        q = queue.Queue()
        with listeners_lock:
            listeners.append(q)
        try:
            while True:
                data = q.get()
                yield f"data: {json.dumps(data)}\n\n"
        finally:
            with listeners_lock:
                listeners.remove(q)

    return Response(event_stream(), mimetype="text/event-stream")

def background_worker():
    """Periodically scans and broadcasts to all SSE listeners."""
    while True:
        try:
            # We use default Med settings for the background scan
            raw = fetch_markets_parallel(pages=10)
            # We don't know the client's filters here, so we send the raw-ish results 
            # and let the client filter OR we just send a 'refresh' signal.
            # To be efficient, let's just send a 'tick' with the current timestamp.
            # Actually, to make it 'auto-refresh' without AJAX polling, 
            # we should send the updated results.
            # But wait, every user has different filters.
            
            # Alternative: The client sends their filters via the SSE connection URL?
            # SSE doesn't support POST, but we can use query params.
            
            # Let's keep it simple: Broadcast that new data is available, 
            # and the client can choose to fetch if they want real-time.
            # OR better: The client just listens and the server sends a heartbeat.
            
            # Actually, the user wants "Auto-refresh without manual button press".
            # The most robust way is to have the client handle the timer, but they said "instead of AJAX polling".
            # So let's send a "update" event every 60 seconds.
            
            with listeners_lock:
                for q in listeners:
                    q.put({"type": "refresh", "time": time.time()})
                    
        except Exception as e:
            print(f"Background worker error: {e}")
        
        time.sleep(60) # Sync every minute

threading.Thread(target=background_worker, daemon=True).start()

if __name__ == "__main__":
    # Disable debug mode for production
    app.run(debug=False, port=5000)
