import os
import time
from playwright.sync_api import sync_playwright

OUTPUT_DIR = os.path.abspath('.artifacts/browser/phase4')
os.makedirs(OUTPUT_DIR, exist_ok=True)

def test_planner():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        
        for width, height in [(1440, 900), (1600, 900), (1920, 1080)]:
            vp_key = f"{width}x{height}"
            context = browser.new_context(viewport={'width': width, 'height': height})
            page = context.new_page()
            
            print(f"Testing /productivity/plan at {vp_key}...")
            page.goto("http://localhost:3000/productivity/plan", wait_until='networkidle')
            time.sleep(1)
            
            # Check 2-column or workstation grid
            workstation = page.query_selector(".grid, .flex")
            assert workstation is not None, "Workstation container not found"
            
            # Check composer input
            composer = page.query_selector("textarea, input[type='text']")
            assert composer is not None, "Composer textarea/input not found"
            
            # Check operating rules badge / context
            rules_badge = page.query_selector("text='09:00'")
            print(f"   Operating rules 09:00 visible: {rules_badge is not None}")
            
            # Check scroll behavior
            doc_metrics = page.evaluate("""() => {
                const docEl = document.documentElement;
                return {
                    scrollWidth: docEl.scrollWidth,
                    clientWidth: docEl.clientWidth,
                    hasHorizontalOverflow: docEl.scrollWidth > docEl.clientWidth,
                    innerHeight: window.innerHeight
                };
            }""")
            print(f"   Horizontal overflow: {doc_metrics['hasHorizontalOverflow']} ({doc_metrics['scrollWidth']}/{doc_metrics['clientWidth']})")
            assert not doc_metrics['hasHorizontalOverflow'], f"Horizontal overflow detected at {vp_key}"
            
            # Screenshot
            page.screenshot(path=os.path.join(OUTPUT_DIR, f"ai_planner_{vp_key}.png"))
            context.close()
            
        print("\nAI Planner layout & workstation verification PASSED 100%!")
        browser.close()

if __name__ == '__main__':
    test_planner()
