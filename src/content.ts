import raw from './content.json';

export const content = raw;

export function findTodos(node: unknown = raw, path = ''): string[] {
  const out: string[] = [];
  if (typeof node === 'string') {
    if (node.includes('TODO')) out.push(path);
  } else if (Array.isArray(node)) {
    node.forEach((v, i) => out.push(...findTodos(v, `${path}[${i}]`)));
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) out.push(...findTodos(v, path ? `${path}.${k}` : k));
  }
  return out;
}

export const TODO_PATHS = findTodos();
if (TODO_PATHS.length > 0) {
  console.warn(`[content.json] TODO ${TODO_PATHS.length}곳이 남아 있어요:\n` + TODO_PATHS.join('\n'));
}
