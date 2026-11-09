import os
import json
import time
from playwright.sync_api import sync_playwright

ROUTES = [
    ('/', 'dashboard_today'),
    ('/productivity/today', 'productivity_today'),
    ('/productivity/plan', 'productivity_ai_plan'),
    ('/productivity/tasks', 'productivity_tasks'),
    ('/productivity/projects', 'productivity_projects'),
    ('/productivity/calendar', 'productivity_calendar'),
    ('/productivity/inbox', 'productivity_inbox'),
    ('/productivity/habits', 'productivity_habits'),
    ('/productivity/focus', 'productivity_focus'),
    ('/productivity/goals', 'productivity_goals'),
    ('/productivity/analytics', 'productivity_analytics'),
    ('/productivity/insights', 'productivity_insights'),
    ('/productivity/weekly-review', 'productivity_weekly_review'),
    ('/finance', 'finance_overview'),
    ('/finance/accounts', 'finance_accounts'),
    ('/finance/transactions', 'finance_transactions'),
    ('/finance/budgets', 'finance_budgets'),
    ('/finance/savings', 'finance_savings'),
    ('/finance/debts', 'finance_debts'),
    ('/finance/recurring', 'finance_recurring'),
    ('/finance/reports', 'finance_reports'),
    ('/finance/net-worth', 'finance_net_worth'),
    ('/finance/import', 'finance_import'),
    ('/overview', 'overview_home'),
    ('/overview/metrics', 'overview_metrics'),
    ('/overview/settings', 'overview_settings'),
    ('/overview/ai-governance', 'overview_ai_governance'),
    ('/overview/backup', 'overview_backup'),
    ('/overview/formulas', 'overview_formulas'),
]

VIEWPORTS = [
    (1440, 900),
    (1600, 900),
    (1920, 1080),
]

OUTPUT_DIR = os.path.abspath('.artifacts/browser/phase4')
os.makedirs(OUTPUT_DIR, exist_ok=True)

def measure_page_layout(page):
    js_code = """() => {
        const docEl = document.documentElement;
        const body = document.body;
        
        const scrollWidth = Math.max(docEl.scrollWidth, body.scrollWidth);
        const clientWidth = Math.max(docEl.clientWidth, body.clientWidth);
        const scrollHeight = Math.max(docEl.scrollHeight, body.scrollHeight);
        const clientHeight = Math.max(docEl.clientHeight, body.clientHeight);
        
        // Find main content container
        const main = document.querySelector('main') || document.querySelector('#__next') || body;
        const mainRect = main.getBoundingClientRect();
        
        // Check for overflowing elements
        const overflowingElements = [];
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
            if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
                const style = window.getComputedStyle(el);
                if (style.overflowX === 'auto' || style.overflowX === 'scroll' || style.overflowX === 'hidden') {
                    // acceptable if styled
                } else {
                    const tag = el.tagName.toLowerCase();
                    const cls = (el.className && typeof el.className === 'string') ? el.className.split(' ').slice(0, 3).join('.') : '';
                    overflowingElements.push({
                        selector: `${tag}.${cls}`,
                        scrollWidth: el.scrollWidth,
                        clientWidth: el.clientWidth,
                        diff: el.scrollWidth - el.clientWidth
                    });
                }
            }
        }
        
        // Check for small nested scrollbars (< 150px height or width with scroll)
        const smallScrollbars = [];
        for (const el of allElements) {
            const style = window.getComputedStyle(el);
            if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
                if (el.clientHeight < 120 && el.clientHeight > 0) {
                    const tag = el.tagName.toLowerCase();
                    const cls = (el.className && typeof el.className === 'string') ? el.className.split(' ').slice(0, 3).join('.') : '';
                    smallScrollbars.push({
                        selector: `${tag}.${cls}`,
                        clientHeight: el.clientHeight,
                        scrollHeight: el.scrollHeight
                    });
                }
            }
        }
        
        return {
            docScrollWidth: scrollWidth,
            docClientWidth: clientWidth,
            hasHorizontalOverflow: scrollWidth > clientWidth,
            mainWidth: Math.round(mainRect.width),
            mainMaxAllowedWidth: 1720,
            overflowingElementsCount: overflowingElements.length,
            overflowingElements: overflowingElements.slice(0, 5),
            smallScrollbarsCount: smallScrollbars.length,
            smallScrollbars: smallScrollbars.slice(0, 5)
        };
    }"""
    return page.evaluate(js_code)

def run_audit():
    results = {}
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        
        for width, height in VIEWPORTS:
            vp_key = f"{width}x{height}"
            results[vp_key] = {}
            print(f"=== Auditing Viewport {vp_key} ===")
            
            context = browser.new_context(viewport={'width': width, 'height': height})
            page = context.new_page()
            
            for path, slug in ROUTES:
                url = f"http://localhost:3000{path}"
                try:
                    page.goto(url, wait_until='networkidle', timeout=15000)
                except Exception as e:
                    page.goto(url, wait_until='load', timeout=15000)
                
                time.sleep(0.5)  # brief settle for layout and charts
                
                metrics = measure_page_layout(page)
                
                # Take initial viewport screenshot
                vp_screenshot_file = os.path.join(OUTPUT_DIR, f"{slug}_{vp_key}_viewport.png")
                page.screenshot(path=vp_screenshot_file, full_page=False)
                
                # Take full-page screenshot
                full_screenshot_file = os.path.join(OUTPUT_DIR, f"{slug}_{vp_key}_fullpage.png")
                page.screenshot(path=full_screenshot_file, full_page=True)
                
                results[vp_key][path] = {
                    'slug': slug,
                    'viewportScreenshot': vp_screenshot_file,
                    'fullpageScreenshot': full_screenshot_file,
                    'metrics': metrics
                }
                
                status_symbol = "✓" if not metrics['hasHorizontalOverflow'] else "✗ OVERFLOW"
                print(f"  [{status_symbol}] {path:30} Width: {metrics['mainWidth']}px (scroll: {metrics['docScrollWidth']}/{metrics['docClientWidth']})")
            
            context.close()
            
        # Dedicated Calendar Deep-Dive at 1600x900
        print("\n=== Auditing Calendar Interactive States (1600x900) ===")
        context = browser.new_context(viewport={'width': 1600, 'height': 900})
        page = context.new_page()
        page.goto("http://localhost:3000/productivity/calendar", wait_until='networkidle')
        time.sleep(0.5)
        
        # Capture Week View default
        page.screenshot(path=os.path.join(OUTPUT_DIR, "calendar_week_view.png"), full_page=False)
        
        # Check week column count
        week_cols = page.evaluate("""() => {
            const cols = document.querySelectorAll('.grid-cols-7 > div, [data-day-column]');
            return cols.length >= 7;
        }""")
        print(f"  Calendar Week Columns (>=7): {week_cols}")
        
        # Switch to Day view
        day_btn = page.query_selector("button[data-view='day']") or page.query_selector("button:has-text('Day')")
        if day_btn:
            day_btn.click()
            time.sleep(0.4)
            page.screenshot(path=os.path.join(OUTPUT_DIR, "calendar_day_view.png"), full_page=False)
            print("  Captured Calendar Day View")
            
        # Switch to Agenda view
        agenda_btn = page.query_selector("button[data-view='agenda']") or page.query_selector("button:has-text('Agenda')")
        if agenda_btn:
            agenda_btn.click()
            time.sleep(0.4)
            page.screenshot(path=os.path.join(OUTPUT_DIR, "calendar_agenda_view.png"), full_page=False)
            print("  Captured Calendar Agenda View")
            
        # Switch back to Week view
        week_btn = page.query_selector("button[data-view='week']") or page.query_selector("button:has-text('Week')")
        if week_btn:
            week_btn.click()
            time.sleep(0.4)
            
        # Check calendar event overlap and midnight badges
        cal_details = page.evaluate("""() => {
            const events = Array.from(document.querySelectorAll('[data-event-id], .group.cursor-pointer'));
            const badges = Array.from(document.querySelectorAll('span')).map(s => s.innerText);
            const hasNextDay = badges.some(t => t.includes('Next Day'));
            const hasOffHours = badges.some(t => t.includes('Off-hours'));
            return {
                eventCount: events.length,
                hasNextDayBadge: hasNextDay,
                hasOffHoursBadge: hasOffHours
            };
        }""")
        print(f"  Calendar Overlap/Badges: {cal_details}")
        
        context.close()
        browser.close()
        
    with open('spatial_audit_results.json', 'w') as f:
        json.dump(results, f, indent=2)
    print("\nSaved detailed spatial audit results to spatial_audit_results.json")

if __name__ == '__main__':
    run_audit()
