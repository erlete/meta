export function stableStringify(value) {
  const seen = new WeakSet();
  const sorter = (obj) => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (seen.has(obj)) throw new Error('circular');
    seen.add(obj);
    if (Array.isArray(obj)) return obj.map(sorter);
    return Object.fromEntries(
      Object.keys(obj)
        .sort()
        .map((k) => [k, sorter(obj[k])])
    );
  };
  return JSON.stringify(sorter(value), null, 2) + '\n';
}
