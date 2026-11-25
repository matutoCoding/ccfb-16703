// 简单 id 生成(不依赖 crypto.randomUUID 的兼容性)
let counter = 0;
export function uid(prefix = 'id'): string {
  counter = (counter + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
