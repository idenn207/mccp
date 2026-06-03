'use strict';

function canonicalize(value) {
  if (value === null) return 'null';
  if (value === undefined) {
    throw new Error('JCS: undefined is not representable in JSON');
  }
  const t = typeof value;
  if (t === 'boolean') return value ? 'true' : 'false';
  if (t === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('JCS: non-finite numbers are not allowed (got ' + value + ')');
    }
    return JSON.stringify(value);
  }
  if (t === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    let out = '[';
    for (let i = 0; i < value.length; i++) {
      if (i > 0) out += ',';
      out += canonicalize(value[i]);
    }
    return out + ']';
  }
  if (t === 'object') {
    const keys = Object.keys(value).sort();
    let out = '{';
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (value[k] === undefined) continue;
      if (out.length > 1) out += ',';
      out += JSON.stringify(k) + ':' + canonicalize(value[k]);
    }
    return out + '}';
  }
  throw new Error('JCS: cannot canonicalize value of type ' + t);
}

module.exports = { canonicalize };
