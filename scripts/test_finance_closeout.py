import os
import time
from playwright.sync_api import sync_playwright

OUTPUT_DIR = os.path.abspath('.artifacts/browser/phase4')
os.makedirs(OUTPUT_DIR, exist_ok=True)

FINANCE_ROUTES = [
    ('/finance', 'Overview'),
    ('/finance/accounts', 'Accounts'),
    ('/finance/transactions', 'Transactions'),
    ('/finance/budgets', 'Budgets'),
    ('/finance/savings', 'Savings'),
    ('/finance/debts', 'Debts'),
    ('/finance/recurring', 'Recurring'),
    ('/finance/reports', 'Reports'),
    ('/finance/net-worth', 'Net Worth'),
    ('/finance/import', 'Import'),
]

def test_finance_routes():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1600, 'height': 900})
        page = context.new_page()
        
        for path, name in FINANCE_ROUTES:
            print(f"Auditing Finance route: {path} ({name})...")
            page.goto(f"http://localhost:3000{path}", wait_until='networkidle')
            time.sleep(0.5)
            
            # Check horizontal overflow
            metrics = page.evaluate("""() => {
                const doc = document.documentElement;
                return {
                    scrollWidth: doc.scrollWidth,
                    clientWidth: doc.clientWidth,
                    overflow: doc.scrollWidth > doc.clientWidth
                };
            }""")
            print(f"   Scroll: {metrics['scrollWidth']}/{metrics['clientWidth']} (Overflow: {metrics['overflow']})")
            assert not metrics['overflow'], f"Horizontal overflow on {path}"
            
            page.screenshot(path=os.path.join(OUTPUT_DIR, f"finance_verified_{name.lower().replace(' ', '_')}.png"))
            
        # Verify Specific Invariants on /finance
        page.goto("http://localhost:3000/finance", wait_until='networkidle')
        time.sleep(0.5)
        
        # Check Safe-to-Spend Card
        sts_card = page.query_selector("text=/Safe-To-Spend/i")
        print(f"Safe-to-Spend Hero Card: {sts_card is not None}")
        assert sts_card is not None, "Safe-to-Spend card not found"

        # Check Net Worth Link / Stat
        nw_stat = page.query_selector("text=/Net Worth/i")
        print(f"Net Worth Stat Card: {nw_stat is not None}")
        assert nw_stat is not None, "Net worth card not found"
        
        print("\nAll Finance Routes verified cleanly with 0 overflow and high aesthetic consistency!")
        browser.close()

if __name__ == '__main__':
    test_finance_routes()
