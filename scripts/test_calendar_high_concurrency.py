import os
import time
import requests
from playwright.sync_api import sync_playwright

BASE_URL = "http://localhost:3000"
OUTPUT_DIR = os.path.abspath(".artifacts/browser/phase4")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Test target date
TEST_DATE = "2026-11-15"

def seed_high_concurrency_events():
    print(f"Seeding high-concurrency overlap test events for {TEST_DATE}...")
    try:
        res = requests.get(f"{BASE_URL}/api/calendar").json()
        for ev in res.get("events", []):
            title = ev.get("title", "")
            if any(title.startswith(prefix) for prefix in ["Six-Way", "Nested", "Twin", "Multi-Day", "Midnight Deployment", "Early Dawn"]):
                requests.delete(f"{BASE_URL}/api/calendar?id={ev['id']}")
    except Exception as e:
        print(f"API cleanup warning: {e}")

    import sqlite3
    con = sqlite3.connect('data/personal_os.db')
    con.execute('DELETE FROM calendar_events WHERE title LIKE "Six-Way%" OR title LIKE "Nested%" OR title LIKE "Twin%" OR title LIKE "Multi-Day%" OR title LIKE "Midnight Deployment%" OR title LIKE "Early Dawn%";')
    con.commit()
    con.close()
    
    events_to_create = [
        # 1. SIX SIMULTANEOUS OVERLAPPING EVENTS (10:00 - 11:30)
        {"title": "Six-Way Overlap 1: CEO Sync", "startTime": f"{TEST_DATE}T10:00:00", "endTime": f"{TEST_DATE}T11:30:00", "eventType": "meeting"},
        {"title": "Six-Way Overlap 2: Tech Design", "startTime": f"{TEST_DATE}T10:00:00", "endTime": f"{TEST_DATE}T11:30:00", "eventType": "time_block"},
        {"title": "Six-Way Overlap 3: Product Triage", "startTime": f"{TEST_DATE}T10:15:00", "endTime": f"{TEST_DATE}T11:15:00", "eventType": "daily_plan_block"},
        {"title": "Six-Way Overlap 4: Security Audit", "startTime": f"{TEST_DATE}T10:30:00", "endTime": f"{TEST_DATE}T11:30:00", "eventType": "time_block"},
        {"title": "Six-Way Overlap 5: Marketing Brief", "startTime": f"{TEST_DATE}T10:00:00", "endTime": f"{TEST_DATE}T11:00:00", "eventType": "meeting"},
        {"title": "Six-Way Overlap 6: Customer Escalation", "startTime": f"{TEST_DATE}T10:30:00", "endTime": f"{TEST_DATE}T11:45:00", "eventType": "meeting"},

        # 2. NESTED TIME INTERVALS (13:00 - 16:00 enclosing smaller blocks)
        {"title": "Nested Parent: Deep Focus Sprint", "startTime": f"{TEST_DATE}T13:00:00", "endTime": f"{TEST_DATE}T16:00:00", "eventType": "daily_plan_block"},
        {"title": "Nested Child A: Quick Standup", "startTime": f"{TEST_DATE}T13:30:00", "endTime": f"{TEST_DATE}T14:00:00", "eventType": "meeting"},
        {"title": "Nested Child B: Code Review", "startTime": f"{TEST_DATE}T14:30:00", "endTime": f"{TEST_DATE}T15:15:00", "eventType": "time_block"},

        # 3. IDENTICAL START & END TIMES (16:30 - 17:30)
        {"title": "Twin Block A: Ops Review", "startTime": f"{TEST_DATE}T16:30:00", "endTime": f"{TEST_DATE}T17:30:00", "eventType": "meeting"},
        {"title": "Twin Block B: Finance Review", "startTime": f"{TEST_DATE}T16:30:00", "endTime": f"{TEST_DATE}T17:30:00", "eventType": "time_block"},

        # 4. MULTI-DAY EVENT (Starts 2026-11-14, ends 2026-11-16)
        {"title": "Multi-Day Hackathon Sprint", "startTime": "2026-11-14T09:00:00", "endTime": "2026-11-16T18:00:00", "eventType": "time_block"},

        # 5. MIDNIGHT CROSSING (21:30 to 01:30 next morning)
        {"title": "Midnight Deployment Window", "startTime": f"{TEST_DATE}T21:30:00", "endTime": "2026-11-16T01:30:00", "eventType": "daily_plan_block"},

        # 6. EARLY START OUTSIDE TIME GRID (Starts at 05:30 AM, before 07:00)
        {"title": "Early Dawn Server Maintenance", "startTime": f"{TEST_DATE}T05:30:00", "endTime": f"{TEST_DATE}T08:00:00", "eventType": "time_block"},
    ]

    for ev in events_to_create:
        res = requests.post(f"{BASE_URL}/api/calendar", json=ev)
        if res.status_code not in (200, 201):
            print(f"Failed to create event: {ev['title']} - {res.text}")

    print(f"Seeded high-concurrency test events!")

def verify_high_concurrency():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1600, 'height': 900})
        page = context.new_page()

        # Navigate to calendar
        page.goto(f"{BASE_URL}/productivity/calendar", wait_until='load')
        time.sleep(2)
        page.wait_for_selector("button[data-view='day']", state='visible')

        # Switch to Day view for high precision coordinate verification
        page.click("button[data-view='day']")
        time.sleep(1)

        # Select target test date
        date_input = page.query_selector("input[type='date']")
        if date_input:
            date_input.fill(TEST_DATE)
            time.sleep(0.8)

        print("\n--- Verifying Six Simultaneous Overlapping Events ---")
        six_events = page.query_selector_all("text=/Six-Way Overlap/")
        print(f"Found {len(six_events)} six-way overlap elements (Expected: 6)")
        assert len(six_events) == 6, f"Expected 6 overlapping events, got {len(six_events)}"

        # Measure leftPct and widthPct for each of the six events
        sub_col_positions = []
        for el in six_events:
            card = el.evaluate_handle("(e) => e.closest('.absolute')")
            style = card.evaluate("(e) => e.getAttribute('style')")
            rect = card.evaluate("(e) => { const r = e.getBoundingClientRect(); return { x: r.x, width: r.width, visible: r.width > 20 }; }")
            sub_col_positions.append((style, rect))

        print(f"Six-way coordinates recorded:")
        for idx, (s, r) in enumerate(sub_col_positions, 1):
            print(f"   Event {idx}: X={r['x']:.1f}px, Width={r['width']:.1f}px, Visible={r['visible']}")
            assert r['visible'], f"Event {idx} was obscured or has 0 width!"

        # Ensure all 6 have distinct horizontal offsets (no two events stacked directly on top of each other)
        x_coords = [round(r['x']) for _, r in sub_col_positions]
        unique_x = set(x_coords)
        print(f"Unique X offsets across 6 simultaneous events: {len(unique_x)} / 6")
        assert len(unique_x) == 6, "Two overlapping events are sharing the exact same X position and obscuring each other!"

        print("\n--- Verifying Nested Time Intervals ---")
        parent_block = page.query_selector("text='Nested Parent: Deep Focus Sprint'")
        child_a = page.query_selector("text='Nested Child A: Quick Standup'")
        child_b = page.query_selector("text='Nested Child B: Code Review'")
        assert parent_block is not None, "Nested parent not found"
        assert child_a is not None, "Nested child A not found"
        assert child_b is not None, "Nested child B not found"
        print("All nested interval events rendered and visible!")

        print("\n--- Verifying Twin Identical Time Blocks ---")
        twin_a = page.query_selector("text='Twin Block A: Ops Review'")
        twin_b = page.query_selector("text='Twin Block B: Finance Review'")
        assert twin_a is not None and twin_b is not None, "Twin blocks not found"
        twin_a_x = twin_a.evaluate("(e) => e.closest('.absolute').getBoundingClientRect().x")
        twin_b_x = twin_b.evaluate("(e) => e.closest('.absolute').getBoundingClientRect().x")
        print(f"Twin A X: {twin_a_x:.1f}px, Twin B X: {twin_b_x:.1f}px")
        assert abs(twin_a_x - twin_b_x) > 30, "Twin blocks are occluding each other!"

        print("\n--- Verifying Multi-Day Event Rendering ---")
        multi_day = page.query_selector("text='Multi-Day Hackathon Sprint'")
        assert multi_day is not None, "Multi-day event not displayed on day 2026-11-15"
        print("Multi-day event successfully rendered on intermediate active day!")

        print("\n--- Verifying Midnight-Crossing and Off-Grid Blocks ---")
        midnight = page.query_selector("text='Midnight Deployment Window'")
        assert midnight is not None, "Midnight deployment window not found"
        early_dawn = page.query_selector("text='Early Dawn Server Maintenance'")
        assert early_dawn is not None, "Early dawn block not found"
        print("Midnight-crossing and early dawn blocks verified!")

        # Take screenshot of the complete high-concurrency Day view
        page.screenshot(path=os.path.join(OUTPUT_DIR, "calendar_high_concurrency_day.png"))

        # Switch to Week view to verify rendering in 7-column layout
        page.click("button[data-view='week']")
        time.sleep(0.5)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "calendar_high_concurrency_week.png"))

        print("\nAll High-Concurrency Overlap & Multi-Day Calendar Tests PASSED 100%!")
        browser.close()

if __name__ == '__main__':
    seed_high_concurrency_events()
    verify_high_concurrency()
