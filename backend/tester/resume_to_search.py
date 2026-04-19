"""Fetch Google search result URLs via the Custom Search JSON API."""

import os

import requests

# ---------------------------------------------------------------------------
# Set these via environment variables or replace the empty strings directly.
# Get them at: https://developers.google.com/custom-search/v1/introduction
# ---------------------------------------------------------------------------
API_KEY = os.environ.get("GOOGLE_API_KEY", "")
CSE_ID  = os.environ.get("GOOGLE_CSE_ID", "")


def search_google(query: str, limit: int = 10) -> list[str]:
    """Return up to `limit` result URLs from Google Custom Search JSON API.

    Requires GOOGLE_API_KEY and GOOGLE_CSE_ID to be set.
    Free tier: 100 queries / day  (https://programmablesearch.google.com)
    """
    if not API_KEY or not CSE_ID:
        raise EnvironmentError(
            "Set GOOGLE_API_KEY and GOOGLE_CSE_ID environment variables. "
            "See https://developers.google.com/custom-search/v1/introduction"
        )

    print("API Key Good")

    response = requests.get(
        "https://www.googleapis.com/customsearch/v1", 
        params={"key": API_KEY, "cx": CSE_ID, "q": query, "num":min(limit, 10)},
        timeout=15
    )
    
    response.raise_for_status()
    items = response.json().get('items') or []
    if not items: print("Results came up empty")
    print(f"\nITEMS:\n{items}\n\n")
    return [item["link"] for item in items if "link" in item]

    
def main():
    query = "Rithvik Akella"
    results = search_google(query)
    print(results)

if __name__ == "__main__":
    main()
