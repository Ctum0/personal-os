'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BarChart3, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function ProductivityInsightsRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/productivity/analytics');
  }, [router]);

  return (
    <div className="w-full max-w-4xl mx-auto px-8 py-16 text-center space-y-4">
      <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-white/[0.08] flex items-center justify-center mx-auto text-zinc-400">
        <BarChart3 className="w-6 h-6" />
      </div>
      <h1 className="text-xl font-bold text-zinc-100">Redirecting to Productivity Analytics...</h1>
      <p className="text-xs text-zinc-400 max-w-md mx-auto">
        Insights has been upgraded to the verified execution analytics dashboard with on-time performance, time allocation, and rescheduling tracking.
      </p>
      <div className="pt-2">
        <Link href="/productivity/analytics">
          <Button variant="primary" size="sm" icon={<ArrowRight className="w-3.5 h-3.5" />}>
            Open Productivity Analytics
          </Button>
        </Link>
      </div>
    </div>
  );
}
