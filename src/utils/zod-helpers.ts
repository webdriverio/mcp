import { z } from 'zod';

export const coerceBoolean = z.preprocess((val) => {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    if (val === 'false' || val === '0') return false;
    if (val === 'true' || val === '1') return true;
    return Boolean(val);
  }
  return val;
}, z.boolean());