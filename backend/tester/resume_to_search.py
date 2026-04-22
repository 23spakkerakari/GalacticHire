"""Fetch Google search result URLs via the Custom Search JSON API."""

import os
import json
import requests
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "../.env"))  

API_KEY = os.environ.get("SERPER_API_KEY", "")

def zoominfo_scraper(query: str):
    url = "https://www.zoominfo.com/p/akella-rithvik/347863680"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
    response = requests.get(url, headers=headers)
    return response.text

def search_google(query: str, limit: int = 10):
    url = "https://google.serper.dev/search"
    payload = {
        "q" : query
    }
    headers = {
        "X-API-KEYb ": API_KEY,
        "Content-Type": "application/json"
    }

    response = requests.request("POST", url, json=payload, headers=headers)

    with open("./backend/tester/out.json", "w", encoding="utf-8") as f:
        json.dump(response.json(), f, ensure_ascii=False, indent=4)
    return response.text


def load_json(file_path: str):
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data


def main():
    query = "Rithvik Akella"
    results = search_google(query)
    print(results)

if __name__ == "__main__":
    main()
