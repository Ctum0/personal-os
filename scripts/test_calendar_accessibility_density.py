import os
import time
import requests
from playwright.sync_api import sync_playwright

BASE_URL = "http://localhost:3000"
OUTPUT_DIR = os.path.abspath(".artifacts/browser/phase4")
os.makedirs(OUTPUT_DIR, exist_ok=True)

def test_calendar_accessibility_and_density():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1600, 'height': 900})
        page = context.new_page()

        print("\n--- 1. Testing Keyboard Accessibility & Focus Navigation ---")
        page.goto(f"{BASE_URL}/productivity/calendar", wait_until='networkidle')
        time.sleep(1)

        # Switch to Week view
        page.click("button[data-view='week']")
        time.sleep(0.5)

        # Verify event cards have role="button" and tabindex="0"
        event_cards = page.query_selector_all("[data-event-id]")
        print(f"Found {len(event_cards)} interactive event cards on week view.")
        assert len(event_cards) > 0, "No event cards found on canvas!"

        first_card = event_cards[0]
        role = first_card.get_attribute("role")
        tabindex = first_card.get_attribute("tabindex")
        aria_label = first_card.get_attribute("aria-label")
        print(f"Card Attributes -> role: {role}, tabindex: {tabindex}")
        print(f"Aria-label: {aria_label}")
        assert role == "button", f"Expected role='button', got {role}"
        assert tabindex == "0", f"Expected tabindex='0', got {tabindex}"
        assert aria_label and len(aria_label) > 10, "Aria label missing or too short"

        # Test Keyboard Activation (Enter key opens modal)
        first_card.focus()
        page.keyboard.press("Enter")
        time.sleep(0.5)

        modal_title = page.query_selector("text='Edit & Reschedule Block'")
        assert modal_title is not None, "Pressing Enter on event card failed to open Edit modal!"
        print("Keyboard activation via Enter key successfully opened Edit modal!")

        # Close modal
        page.click("button:has-text('Cancel')")
        time.sleep(0.3)

        print("\n--- 2. Testing High-Density Cluster Badge & Conflict Modal ---")
        # Navigate to test date 2026-11-15 where 6 overlapping events exist
        # Switch to Day view first to select 2026-11-15, or check week containing 2026-11-15
        page.click("button[data-view='day']")
        time.sleep(0.5)
        date_input = page.query_selector("input[type='date']")
        if date_input:
            date_input.fill("2026-11-15")
            time.sleep(0.8)

        # Switch to Week view for 2026-11-15
        page.click("button[data-view='week']")
        time.sleep(0.8)

        # Check for High-Density badge (+6 dense)
        density_badge = page.query_selector("text=/\\+.*dense/")
        print(f"Density badge found on canvas: {density_badge is not None}")
        assert density_badge is not None, "Density badge was not displayed on high-concurrency column!"
        badge_text = density_badge.inner_text()
        print(f"Density badge label: {badge_text}")

        # Click the density badge to open conflict / dense events popover
        density_badge.click()
        time.sleep(0.5)

        # Verify dense cluster popover is displayed
        conflict_header = page.query_selector("text='Concurrent Events & Overlaps'")
        assert conflict_header is not None, "Concurrent Events popover failed to open on badge click!"
        print("Concurrent Events & Overlaps popover opened successfully!")

        # Take screenshot of the conflict modal
        page.screenshot(path=os.path.join(OUTPUT_DIR, "calendar_density_modal.png"))

        # Verify twin overlap indicator in the modal
        twin_indicator = page.query_selector("text='Twin Overlap'")
        print(f"Twin conflict indicator detected in popover: {twin_indicator is not None}")

        # Close conflict modal via Done button
        done_btn = page.query_selector("button:has-text('Done')")
        if done_btn:
            done_btn.click()
            time.sleep(0.3)

        print("\n--- 3. Testing Source Preservation (Habit / Routine) ---")
        # Create a habit event via API
        habit_payload = {
            "title": "Daily Mindfulness & Reflection",
            "startTime": "2026-11-15T08:00:00",
            "endTime": "2026-11-15T08:30:00",
            "eventType": "habit"
        }
        res = requests.post(f"{BASE_URL}/api/calendar", json=habit_payload)
        assert res.status_code in (200, 201), f"Failed to create habit: {res.text}"
        habit_id = res.json()["event"]["id"]

        # Reload calendar and check habit badge
        page.reload(wait_until='networkidle')
        time.sleep(1)

        # Switch to Day view for 2026-11-15
        page.click("button[data-view='day']")
        time.sleep(0.5)
        date_input = page.query_selector("input[type='date']")
        if date_input:
            date_input.fill("2026-11-15")
            time.sleep(0.8)

        habit_card = page.query_selector("[data-event-id]:has-text('Daily Mindfulness')")
        assert habit_card is not None, "Habit card not found on Day canvas!"
        
        # Verify habit badge label
        habit_pill = page.query_selector("text='Habit / Routine'")
        assert habit_pill is not None, "Habit / Routine source pill missing!"
        print("Habit / Routine event successfully rendered with distinctive source pill!")

        # Edit habit and verify source preserved
        habit_card.click()
        time.sleep(0.5)
        type_select = page.query_selector("select")
        selected_val = type_select.input_value()
        print(f"Edit Modal pre-selected event type: {selected_val}")
        assert selected_val == "habit", f"Expected type 'habit', got '{selected_val}'!"

        save_btn = page.query_selector("button:has-text('Save Changes')")
        save_btn.click()
        time.sleep(0.8)

        # Clean up created habit
        requests.delete(f"{BASE_URL}/api/calendar?id={habit_id}")

        print("\nAll Calendar Accessibility, Density & Source Preservation Tests PASSED 100%!")
        browser.close()

if __name__ == '__main__':
    test_calendar_accessibility_and_density()
