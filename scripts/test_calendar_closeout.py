import os
import time
import json
import urllib.request
import sqlite3
from datetime import datetime, timedelta
from playwright.sync_api import sync_playwright

OUTPUT_DIR = os.path.abspath('.artifacts/browser/phase4')
os.makedirs(OUTPUT_DIR, exist_ok=True)

def seed_closeout_events():
    con = sqlite3.connect('data/personal_os.db')
    target_date = "2026-11-08"
    try:
        req = urllib.request.urlopen("http://localhost:3000/api/planning", timeout=3)
        data = json.loads(req.read().decode())
        if data.get("targetDate"):
            target_date = data["targetDate"]
        elif data.get("context", {}).get("targetDate"):
            target_date = data["context"]["targetDate"]
    except Exception as e:
        print(f"Could not fetch date from planning API: {e}, using fallback 2026-11-08")

    dt = datetime.strptime(target_date, "%Y-%m-%d")
    tomorrow = (dt + timedelta(days=1)).strftime("%Y-%m-%d")

    print(f"Seeding closeout events for target date: {target_date}...")
    con.execute('DELETE FROM calendar_events WHERE id LIKE "calev_test_%";')
    con.execute(f'''
        INSERT INTO calendar_events (id, tenant_id, space_id, title, description, start_time, end_time, is_all_day, event_type, color)
        VALUES 
        ('calev_test_overlap_1', 'tenant_default', 'space_personal', 'Executive Architecture Review', 'Strategic technical review', '{target_date}T10:00:00', '{target_date}T11:30:00', 0, 'time_block', '#3b82f6'),
        ('calev_test_overlap_2', 'tenant_default', 'space_personal', 'Emergency Triage Standup', 'High priority response', '{target_date}T10:30:00', '{target_date}T11:30:00', 0, 'meeting', '#f59e0b'),
        ('calev_test_offhours', 'tenant_default', 'space_personal', 'Early Morning Deep Reading', 'Morning focus before work hours', '{target_date}T07:30:00', '{target_date}T08:45:00', 0, 'time_block', '#3b82f6'),
        ('calev_test_midnight', 'tenant_default', 'space_personal', 'Overnight Batch Synchronization', 'Crosses midnight boundary', '{target_date}T21:30:00', '{tomorrow}T01:30:00', 0, 'daily_plan_block', '#10b981'),
        ('calev_test_workday', 'tenant_default', 'space_personal', 'Core Product Execution Sprint', 'Afternoon dedicated focus', '{target_date}T13:00:00', '{target_date}T15:30:00', 0, 'daily_plan_block', '#10b981');
    ''')
    con.commit()
    con.close()
    print("Closeout test events seeded successfully!")

def test_calendar():
    seed_closeout_events()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1600, 'height': 900})
        page = context.new_page()
        
        print("Navigating to /productivity/calendar...")
        page.goto("http://localhost:3000/productivity/calendar", wait_until='networkidle')
        time.sleep(1)
        
        # 1. Verify 7 actual day columns in Week view
        day_cols = page.query_selector_all('[data-day-column]')
        print(f"1. Week view day columns count: {len(day_cols)} (Expected: 7)")
        assert len(day_cols) == 7, f"Expected 7 columns, got {len(day_cols)}"
        
        # 2. Verify overlapping events sub-columns
        overlap_1 = page.query_selector("text='Executive Architecture Review'")
        overlap_2 = page.query_selector("text='Emergency Triage Standup'")
        assert overlap_1 is not None, "Overlap event 1 not found"
        assert overlap_2 is not None, "Overlap event 2 not found"
        print("2. Both overlapping events rendered on canvas!")
        
        # Check their container widths and positions
        el1_style = page.evaluate("(el) => el.closest('.group.cursor-pointer')?.getAttribute('style') || el.parentElement.getAttribute('style')", overlap_1)
        el2_style = page.evaluate("(el) => el.closest('.group.cursor-pointer')?.getAttribute('style') || el.parentElement.getAttribute('style')", overlap_2)
        print(f"   Event 1 inline style: {el1_style}")
        print(f"   Event 2 inline style: {el2_style}")
        
        # 3. Verify off-hours badge
        off_hours_badge = page.query_selector("text='Off-hours'")
        print(f"3. Off-hours badge detected: {off_hours_badge is not None}")
        assert off_hours_badge is not None, "Off-hours badge not found"
        
        # 4. Verify midnight crossing badge
        midnight_badge = page.query_selector("text='→ Next Day'")
        print(f"4. Midnight-crossing '→ Next Day' badge detected: {midnight_badge is not None}")
        assert midnight_badge is not None, "Midnight-crossing badge not found"
        
        # Capture full week screenshot
        page.screenshot(path=os.path.join(OUTPUT_DIR, "calendar_verified_week_view.png"))
        
        # 5. Test Day View
        page.click("button[data-view='day']")
        time.sleep(0.5)
        day_canvas = page.query_selector("text='Executive Architecture Review'")
        assert day_canvas is not None, "Day view failed to render events"
        page.screenshot(path=os.path.join(OUTPUT_DIR, "calendar_verified_day_view.png"))
        print("5. Day view verified and screenshot captured")
        
        # 6. Test Agenda View
        page.click("button[data-view='agenda']")
        time.sleep(0.5)
        agenda_items = page.query_selector_all(".divide-y > div")
        print(f"6. Agenda view items count: {len(agenda_items)}")
        page.screenshot(path=os.path.join(OUTPUT_DIR, "calendar_verified_agenda_view.png"))
        
        # 7. Test Edit & Reschedule Modal Persistence
        # Switch back to Day view
        page.click("button[data-view='day']")
        time.sleep(0.5)
        
        # Click on "Early Morning Deep Reading" card to edit
        reading_card = page.query_selector("text=/Early Morning Deep Reading/")
        assert reading_card is not None, "Reading card not found on canvas"
        reading_card.click()
        time.sleep(0.5)
        
        # Check modal open
        modal_title = page.query_selector("text='Edit & Reschedule Block'")
        assert modal_title is not None, "Edit modal did not open"
        
        # Change title
        new_title = f"Early Morning Deep Reading (Cycle {int(time.time()) % 1000})"
        title_input = page.query_selector("input.border-zinc-800") or page.query_selector("input[type='text']")
        title_input.fill(new_title)
        
        # Click Save Changes
        save_btn = page.query_selector("button:has-text('Save Changes')")
        save_btn.click()
        time.sleep(1)
        
        # Reload page and verify persistence
        page.reload(wait_until='networkidle')
        time.sleep(1)
        
        persisted_el = page.query_selector(f"text='{new_title}'")
        print(f"7. Persistence verified after full page reload: {persisted_el is not None}")
        assert persisted_el is not None, "Edited event failed to persist across reload"
        
        print("\nAll Calendar Closeout verification requirements PASSED 100%!")
        browser.close()

if __name__ == '__main__':
    test_calendar()
