function tile(items, x, y, w, h) {
  if (items.length === 0) return [];
  if (items.length === 1) return [{ name: items[0].name, value: items[0].value, x, y, w, h }];
  const total = items.reduce((s, i) => s + i.value, 0);
  let acc = 0, target = total / 2, idx = 1, best = Infinity;
  for (let k = 0; k < items.length - 1; k++) {
    acc += items[k].value;
    const d = Math.abs(acc - target);
    if (d < best) { best = d; idx = k + 1; }
  }
  const left = items.slice(0, idx);
  const right = items.slice(idx);
  const leftSum = left.reduce((s, i) => s + i.value, 0);
  const ratio = leftSum / total;
  if (w >= h) {
    const lw = w * ratio;
    return [...tile(left, x, y, lw, h), ...tile(right, x + lw, y, w - lw, h)];
  } else {
    const lh = h * ratio;
    return [...tile(left, x, y, w, lh), ...tile(right, x, y + lh, w, h - lh)];
  }
}
function check(items, W, H, label) {
  const rects = tile(items, 0, 0, W, H);
  let area = 0, bad = false;
  for (const r of rects) {
    area += r.w * r.h;
    if (r.x < -0.01 || r.y < -0.01 || r.x + r.w > W + 0.01 || r.y + r.h > H + 0.01) { bad = true; console.log(label, '越界:', r.name); }
    for (const o of rects) {
      if (o === r) continue;
      const ox = Math.max(0, Math.min(r.x + r.w, o.x + o.w) - Math.max(r.x, o.x));
      const oy = Math.max(0, Math.min(r.y + r.h, o.y + o.h) - Math.max(r.y, o.y));
      if (ox > 0.01 && oy > 0.01) { bad = true; console.log(label, '重叠:', r.name, o.name); }
    }
  }
  console.log(label, '块数:', rects.length, '总面积:', Math.round(area), '期望:', W*H, '越界/重叠:', bad);
  rects.forEach(r => console.log('  ' + r.name, Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h), r.value));
}
const company = [
  ['总库',1924],['米古里华为店',507],['锦程一店',493],['铁路局电信营业厅',469],
  ['鸿翔一店',434],['潘国杰售后',312],['米泉北路店',286],['鸿翔京东店',283],
  ['电信华为合作店',274],['苹果店',221],['中山路联通店',183],['米古里VIVO体验店',169],
  ['尚层空间',135],['联通店',94],['中山李路远仓',68],['其他门店11类',109]
].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);
const personal = [
  ['支文香',22],['杨菲',21],['刘玉昆',19],['支文玉',16],['高磊',14],['向青竹',10],
  ['赵君',9],['温平',7],['金克文',6],['杨成',6],['冯丽纯',6],['其他32位',68]
].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);
check(company, 660, 300, '公司区');
check(personal, 660, 60, '个人区');
