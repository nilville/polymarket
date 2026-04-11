# ⚡ PolyPulse | High-Confidence Market Scanner

**PolyPulse** is a high-performance web dashboard for scanning [Polymarket](https://polymarket.com) using the Gamma API. It identifies high-confidence outcomes by filtering through volume, probability, and search depth in real-time.

![License](https://img.shields.io/badge/license-MIT-blue)
![Python](https://img.shields.io/badge/python-3.8%2B-blue)
![Flask](https://img.shields.io/badge/flask-3.0-green)

---

## 🚀 Key Features

- **Parallel Scanning:** Backend uses `ThreadPoolExecutor` to fetch and analyze hundreds of markets simultaneously (up to 10x faster than sequential scanning).
- **Smart Filtering:** Filter markets by minimum probability (e.g., >90%) and minimum volume (USDC) to find only the most reliable bets.
- **Dynamic Sorting:** Sort results by Volume, Probability, or End Date.
- **Urgency Awareness:** Color-coded relative time labels (e.g., "Ending Now", "Today") help you catch fast-closing markets.
- **Modern UI/UX:**
  - ✨ Elegant **Dark & Light Mode** (system-aware with persistent toggle).
  - 📱 Fully **Responsive Design** (converts from tables to card-view on mobile).
  - ⚡ **AJAX-Powered** (no full-page reloads when scanning or resetting).
- **Automatic Cleanup:** Expired markets are automatically filtered out to keep your data relevant.
- **API Optimization:** Integrated server-side caching (60s TTL) to stay within API limits.

---

## 🛠️ Tech Stack

- **Backend:** [Python](https://www.python.org/) + [Flask](https://flask.palletsprojects.com/)
- **Frontend:** Vanilla JS (ES6+), CSS3 Variables, Semantic HTML5
- **Icons:** Custom-coded SVG "Pulse" and Lucide-style theme icons
- **API:** Polymarket Gamma API

---

## 🏗️ Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/polypulse.git
   cd polypulse
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Run the application:**
   ```bash
   python polymarketScanner.py
   ```

4. **Access the dashboard:**
   Open your browser and navigate to `http://127.0.0.1:5000`

---

## 📂 Project Structure

```text
polypulse/
├── static/
│   ├── css/
│   │   └── style.css      # Custom variables, dark theme & responsive layouts
│   └── js/
│       └── app.js         # Theme logic & AJAX rendering
├── templates/
│   └── index.html         # Main dashboard skeleton
├── polymarketScanner.py   # Parallel fetching, filtering & Flask routes
├── requirements.txt       # Project dependencies
└── README.md              # Documentation
```

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---

## ⚠️ Disclaimer

PolyPulse is a data tool designed for market analysis. Prediction market probabilities are not financial advice. Always perform your own research before trading.
