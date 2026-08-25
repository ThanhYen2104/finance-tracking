export function parseAmountExpression(input: string): number | null {
  const source = input.trim().replace(/^=/, '').replace(/\s+/g, '');
  if (!source) return null;
  let position = 0;

  const expression = (): number => {
    let value = term();
    while (source[position] === '+' || source[position] === '-') {
      const operator = source[position++];
      const right = term();
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  };

  const term = (): number => {
    let value = factor();
    while (source[position] === '*' || source[position] === '/') {
      const operator = source[position++];
      const right = factor();
      if (operator === '/' && right === 0) return Number.NaN;
      value = operator === '*' ? value * right : value / right;
    }
    return value;
  };

  const factor = (): number => {
    if (source[position] === '+' || source[position] === '-') {
      const operator = source[position++];
      const value = factor();
      return operator === '-' ? -value : value;
    }
    if (source[position] === '(') {
      position += 1;
      const value = expression();
      if (source[position] !== ')') return Number.NaN;
      position += 1;
      return value;
    }
    const match = source.slice(position).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
    if (!match) return Number.NaN;
    position += match[0].length;
    return Number(match[0]);
  };

  const value = expression();
  return position === source.length && Number.isFinite(value) ? value : null;
}
