import { Decimal } from 'decimal.js';

/** Every value the constrained evaluator can represent. */
export type FormulaValue = number | string | boolean;

export interface FormulaContext {
  variables: Record<string, FormulaValue>;
}

export interface FormulaValidationResult {
  isValid: boolean;
  error?: string;
  /** Reserved: the validator reports syntax only and does not build a tree. */
  ast?: unknown;
}

export interface FormulaEvaluationResult {
  success: boolean;
  value?: FormulaValue;
  error?: string;
}

/**
 * Narrowing helper: Decimal accepts `string | number | Decimal`, but the grammar
 * can hand it a boolean. Passing the boolean through unchanged keeps the
 * existing runtime behaviour (Decimal rejects it, the caller reports the error)
 * instead of silently coercing it to 0/1.
 */
function toDecimal(value: FormulaValue): Decimal {
  return new Decimal(value as Decimal.Value);
}

/**
 * Constrained, safe expression evaluator for user custom fields and dashboard calculations.
 * Supports:
 * - Literals (numbers, strings in single quotes, booleans true/false)
 * - Identifiers / variables (e.g. task_count, completed_count, spent, budget)
 * - Arithmetic operators: +, -, *, /
 * - Comparison operators: >, <, >=, <=, ==, !=
 * - Logical operators: AND, OR, NOT
 * - Functions: ROUND(val, decimals), IF(cond, thenVal, elseVal), MIN(a, b), MAX(a, b), ABS(val)
 * 
 * Strict safety: No eval, no Function constructor, no prototype access, no loops.
 */

// Simple tokenizer
type TokenType = 'NUMBER' | 'STRING' | 'BOOLEAN' | 'IDENTIFIER' | 'OPERATOR' | 'LPAREN' | 'RPAREN' | 'COMMA';

interface Token {
  type: TokenType;
  value: string;
}

export function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expr.length) {
    const char = expr[i];

    if (/\s/.test(char)) {
      i++;
      continue;
    }

    if (char === '(') {
      tokens.push({ type: 'LPAREN', value: '(' });
      i++;
      continue;
    }

    if (char === ')') {
      tokens.push({ type: 'RPAREN', value: ')' });
      i++;
      continue;
    }

    if (char === ',') {
      tokens.push({ type: 'COMMA', value: ',' });
      i++;
      continue;
    }

    // String literal in single quotes
    if (char === "'") {
      let str = '';
      i++;
      while (i < expr.length && expr[i] !== "'") {
        str += expr[i];
        i++;
      }
      i++; // skip closing quote
      tokens.push({ type: 'STRING', value: str });
      continue;
    }

    // Number literal
    if (/\d/.test(char) || (char === '.' && /\d/.test(expr[i + 1] || ''))) {
      let num = '';
      while (i < expr.length && (/\d/.test(expr[i]) || expr[i] === '.')) {
        num += expr[i];
        i++;
      }
      tokens.push({ type: 'NUMBER', value: num });
      continue;
    }

    // Two-character operators: >=, <=, ==, !=
    const two = expr.slice(i, i + 2);
    if (['>=', '<=', '==', '!='].includes(two)) {
      tokens.push({ type: 'OPERATOR', value: two });
      i += 2;
      continue;
    }

    // Single-character operators: +, -, *, /, >, <
    if (['+', '-', '*', '/', '>', '<'].includes(char)) {
      tokens.push({ type: 'OPERATOR', value: char });
      i++;
      continue;
    }

    // Identifiers or keyword operators (AND, OR, NOT, TRUE, FALSE)
    if (/[a-zA-Z_]/.test(char)) {
      let ident = '';
      while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) {
        ident += expr[i];
        i++;
      }
      const upper = ident.toUpperCase();
      if (upper === 'TRUE' || upper === 'FALSE') {
        tokens.push({ type: 'BOOLEAN', value: upper.toLowerCase() });
      } else if (upper === 'AND' || upper === 'OR' || upper === 'NOT') {
        tokens.push({ type: 'OPERATOR', value: upper });
      } else {
        tokens.push({ type: 'IDENTIFIER', value: ident });
      }
      continue;
    }

    throw new Error(`Unexpected character in formula: ${char}`);
  }

  return tokens;
}

/**
 * Validates a formula string syntax
 */
export function validateFormula(expr: string): FormulaValidationResult {
  try {
    const tokens = tokenize(expr);
    if (tokens.length === 0) {
      return { isValid: false, error: 'Empty formula expression' };
    }
    // Test evaluation with empty/dummy context
    return { isValid: true };
  } catch (err) {
    return { isValid: false, error: err instanceof Error && err.message ? err.message : 'Syntax error' };
  }
}

/**
 * Evaluates a formula in a given context safely
 */
export function evaluateFormula(expr: string, context: FormulaContext): FormulaEvaluationResult {
  try {
    const tokens = tokenize(expr);
    let pos = 0;

    function peek(): Token | undefined {
      return tokens[pos];
    }

    function consume(expectedType?: TokenType): Token {
      const token = tokens[pos];
      if (!token) throw new Error('Unexpected end of formula');
      if (expectedType && token.type !== expectedType) {
        throw new Error(`Expected token type ${expectedType}, got ${token.type}`);
      }
      pos++;
      return token;
    }

    // Grammar:
    // Expression -> LogicalOr
    // LogicalOr -> LogicalAnd ('OR' LogicalAnd)*
    // LogicalAnd -> Equality ('AND' Equality)*
    // Equality -> Relational (('==' | '!=') Relational)*
    // Relational -> Additive (('>' | '<' | '>=' | '<=') Additive)*
    // Additive -> Multiplicative (('+' | '-') Multiplicative)*
    // Multiplicative -> Unary (('*' | '/') Unary)*
    // Unary -> ('-' | 'NOT') Primary | Primary
    // Primary -> NUMBER | STRING | BOOLEAN | IDENTIFIER | FunctionCall | '(' Expression ')'

    function parseExpression(): FormulaValue {
      return parseLogicalOr();
    }

    function parseLogicalOr(): FormulaValue {
      let left = parseLogicalAnd();
      while (peek() && peek()?.type === 'OPERATOR' && peek()?.value.toUpperCase() === 'OR') {
        consume();
        const right = parseLogicalAnd();
        left = Boolean(left) || Boolean(right);
      }
      return left;
    }

    function parseLogicalAnd(): FormulaValue {
      let left = parseEquality();
      while (peek() && peek()?.type === 'OPERATOR' && peek()?.value.toUpperCase() === 'AND') {
        consume();
        const right = parseEquality();
        left = Boolean(left) && Boolean(right);
      }
      return left;
    }

    function parseEquality(): FormulaValue {
      let left = parseRelational();
      while (peek() && peek()?.type === 'OPERATOR' && (peek()?.value === '==' || peek()?.value === '!=')) {
        const op = consume().value;
        const right = parseRelational();
        if (op === '==') left = left == right;
        else left = left != right;
      }
      return left;
    }

    function parseRelational(): FormulaValue {
      let left = parseAdditive();
      while (peek() && peek()?.type === 'OPERATOR' && ['>', '<', '>=', '<='].includes(peek()!.value)) {
        const op = consume().value;
        const right = parseAdditive();
        if (op === '>') left = Number(left) > Number(right);
        else if (op === '<') left = Number(left) < Number(right);
        else if (op === '>=') left = Number(left) >= Number(right);
        else if (op === '<=') left = Number(left) <= Number(right);
      }
      return left;
    }

    function parseAdditive(): FormulaValue {
      let left = parseMultiplicative();
      while (peek() && peek()?.type === 'OPERATOR' && (peek()?.value === '+' || peek()?.value === '-')) {
        const op = consume().value;
        const right = parseMultiplicative();
        if (op === '+') {
          // If either is string, concat; otherwise numeric addition with Decimal
          if (typeof left === 'string' || typeof right === 'string') {
            left = String(left) + String(right);
          } else {
            left = toDecimal(left).plus(toDecimal(right)).toNumber();
          }
        } else {
          left = toDecimal(left).minus(toDecimal(right)).toNumber();
        }
      }
      return left;
    }

    function parseMultiplicative(): FormulaValue {
      let left = parseUnary();
      while (peek() && peek()?.type === 'OPERATOR' && (peek()?.value === '*' || peek()?.value === '/')) {
        const op = consume().value;
        const right = parseUnary();
        if (op === '*') {
          left = toDecimal(left).times(toDecimal(right)).toNumber();
        } else {
          const divisor = toDecimal(right);
          if (divisor.isZero()) {
            throw new Error('Division by zero');
          }
          left = toDecimal(left).dividedBy(divisor).toNumber();
        }
      }
      return left;
    }

    function parseUnary(): FormulaValue {
      if (peek() && peek()?.type === 'OPERATOR' && peek()?.value === '-') {
        consume();
        const operand = parsePrimary();
        return toDecimal(operand).negated().toNumber();
      }
      if (peek() && peek()?.type === 'OPERATOR' && peek()?.value.toUpperCase() === 'NOT') {
        consume();
        const operand = parsePrimary();
        return !operand;
      }
      return parsePrimary();
    }

    function parsePrimary(): FormulaValue {
      const token = peek();
      if (!token) throw new Error('Unexpected end of expression');

      if (token.type === 'NUMBER') {
        consume();
        return parseFloat(token.value);
      }

      if (token.type === 'STRING') {
        consume();
        return token.value;
      }

      if (token.type === 'BOOLEAN') {
        consume();
        return token.value === 'true';
      }

      if (token.type === 'LPAREN') {
        consume();
        const result = parseExpression();
        consume('RPAREN');
        return result;
      }

      if (token.type === 'IDENTIFIER') {
        const name = consume().value;

        // Check if function call
        if (peek() && peek()?.type === 'LPAREN') {
          consume('LPAREN');
          const args: FormulaValue[] = [];
          if (peek() && peek()?.type !== 'RPAREN') {
            args.push(parseExpression());
            while (peek() && peek()?.type === 'COMMA') {
              consume('COMMA');
              args.push(parseExpression());
            }
          }
          consume('RPAREN');

          return executeFunction(name.toUpperCase(), args);
        }

        // Variable lookup
        if (Object.prototype.hasOwnProperty.call(context.variables, name)) {
          return context.variables[name];
        }

        throw new Error(`Undefined variable '${name}' in formula`);
      }

      throw new Error(`Unexpected token: ${token.value}`);
    }

    function executeFunction(fnName: string, args: FormulaValue[]): FormulaValue {
      switch (fnName) {
        case 'ROUND':
          const val = toDecimal(args[0] || 0);
          const decs = args[1] !== undefined ? Number(args[1]) : 0;
          return Number(val.toFixed(decs));

        case 'IF':
          // IF(condition, thenValue, elseValue)
          return args[0] ? args[1] : args[2];

        case 'MIN':
          return Math.min(...args.map(Number));

        case 'MAX':
          return Math.max(...args.map(Number));

        case 'ABS':
          return Math.abs(Number(args[0] || 0));

        default:
          throw new Error(`Unsupported formula function '${fnName}'`);
      }
    }

    const finalValue = parseExpression();
    return { success: true, value: finalValue };
  } catch (err) {
    return { success: false, error: err instanceof Error && err.message ? err.message : 'Evaluation error' };
  }
}
