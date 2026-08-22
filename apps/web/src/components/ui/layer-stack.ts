/**
 * 浮层层级栈：抽屉与确认框可能同时打开，Esc 只应关闭最顶层。
 * 每个浮层挂载时 push、卸载时 remove，键盘处理前用 isTopLayer 判断。
 */
const stack: symbol[] = [];

export function pushLayer(): symbol {
  const id = Symbol("layer");
  stack.push(id);
  return id;
}

export function removeLayer(id: symbol): void {
  const index = stack.indexOf(id);
  if (index >= 0) stack.splice(index, 1);
}

export function isTopLayer(id: symbol): boolean {
  return stack[stack.length - 1] === id;
}
