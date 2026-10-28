import { NextResponse } from 'next/server';
import { evaluateFormula, validateFormula } from '@/lib/customization/formula';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { formula, variables } = body;

    if (!formula || typeof formula !== 'string') {
      return NextResponse.json({ error: 'formula string is required' }, { status: 400 });
    }

    const validation = validateFormula(formula);
    if (!validation.isValid) {
      return NextResponse.json({ isValid: false, error: validation.error });
    }

    const evaluation = evaluateFormula(formula, { variables: variables || {} });
    return NextResponse.json({
      isValid: true,
      success: evaluation.success,
      value: evaluation.value,
      error: evaluation.error,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
