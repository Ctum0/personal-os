import { evaluateFormula, validateFormula } from '@/lib/customization/formula';
import { withApiLogging } from '@/lib/api/log';
import { FieldError, ok, readBody, routeError } from '@/lib/api/http';
import { requiredString } from '@/lib/api/fields';

const MAX_FORMULA_LENGTH = 2000;

export const POST = withApiLogging(async function POST(request: Request) {
  try {
    const body = await readBody(request);

    // Length is enforced before tokenizing so an oversized expression never
    // reaches the parser.
    const formula = requiredString(body.formula, 'formula', MAX_FORMULA_LENGTH);
    if (typeof body.variables !== 'undefined' && body.variables !== null) {
      if (typeof body.variables !== 'object' || Array.isArray(body.variables)) {
        throw new FieldError('variables must be an object');
      }
    }
    const variables = (body.variables ?? {}) as Parameters<typeof evaluateFormula>[1]['variables'];

    const validation = validateFormula(formula);
    if (!validation.isValid) {
      return ok({ isValid: false, error: validation.error });
    }

    const evaluation = evaluateFormula(formula, { variables });
    return ok({
      isValid: true,
      success: evaluation.success,
      value: evaluation.value,
      error: evaluation.error,
    });
  } catch (err) {
    return routeError(err);
  }
});
