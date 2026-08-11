"""管家婆 BIFF8 .xls 解析:CONTINUE 续接片段开头带 grbit 标记(非标准写法)

用法: python parse-serial-inventory-xls.py [文件路径]
默认路径见 DEFAULT_PATH,可被第一个命令行参数覆盖。
"""
import olefile
import struct
import sys
from collections import Counter

DEFAULT_PATH = r"C:\Users\Administrator\Desktop\26\序列号库存状况-2026_08_10-14_21_14.xls"
PATH = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PATH


def iter_records(data):
    pos = 0
    n = len(data)
    while pos + 4 <= n:
        rec_id, rec_len = struct.unpack_from("<HH", data, pos)
        yield rec_id, data[pos + 4:pos + 4 + rec_len]
        pos += 4 + rec_len


class SstParser:
    """跨片段读取字节流。
    管家婆特性: 字符串数据跨片段续接时, CONTINUE 片段开头有 1 字节 grbit 标记。
    因此 read 时若从片段边界续读字符数据, 先跳过标记字节。
    """

    def __init__(self, fragments):
        self.fragments = fragments
        self.fi = 0
        self.pos = 0

    def _skip_marker(self):
        """跨片段续接时跳过标记字节(管家婆写 0x01)"""
        frag = self.fragments[self.fi]
        if self.pos >= len(frag):
            self.fi += 1
            self.pos = 0
            if self.fi < len(self.fragments):
                self.pos = 1  # 跳过续接标记
                return True
            return False
        return True

    def read_char_data(self, count):
        """读取字符数据, 跨片段时跳过续接标记"""
        out = bytearray()
        while len(out) < count:
            if self.fi >= len(self.fragments):
                break
            frag = self.fragments[self.fi]
            if self.pos >= len(frag):
                self.fi += 1
                self.pos = 0
                if self.fi < len(self.fragments):
                    self.pos = 1  # 跳过续接标记字节
                continue
            take = min(count - len(out), len(frag) - self.pos)
            out += frag[self.pos:self.pos + take]
            self.pos += take
        return bytes(out)

    def read_head(self, count):
        """读取字符串头部(cch+grbit 或 runs 等), 不跳过标记(头部在片段开头时本身含 grbit)"""
        out = bytearray()
        while len(out) < count:
            if self.fi >= len(self.fragments):
                break
            frag = self.fragments[self.fi]
            if self.pos >= len(frag):
                self.fi += 1
                self.pos = 0
                if self.fi >= len(self.fragments):
                    break
                continue
            take = min(count - len(out), len(frag) - self.pos)
            out += frag[self.pos:self.pos + take]
            self.pos += take
        return bytes(out)


def parse_sst(records):
    fragments = []
    for rec_id, payload in records:
        if rec_id == 0x00FC:
            fragments = [payload]
        elif rec_id == 0x003C and fragments:
            fragments.append(payload)
        elif fragments and rec_id != 0x003C:
            break
    if not fragments:
        return []

    count_total = struct.unpack_from("<I", fragments[0][:8], 0)[0]
    parser = SstParser(fragments)
    parser.pos = 8

    sst = []
    for _ in range(count_total):
        h = parser.read_head(3)
        if len(h) < 3:
            break
        cch, flags = struct.unpack_from("<HB", h, 0)
        compressed = not bool(flags & 0x01)
        rich = bool(flags & 0x04)
        ext = bool(flags & 0x08)
        need = cch * (1 if compressed else 2)
        raw = parser.read_char_data(need)
        if len(raw) < need:
            text = (raw.decode("gbk", errors="replace") if compressed
                    else raw.decode("utf-16-le", errors="replace"))
            sst.append(text)
            break
        text = (raw.decode("gbk", errors="replace") if compressed
                else raw.decode("utf-16-le", errors="replace"))
        if rich:
            rh = parser.read_head(2)
            if len(rh) == 2:
                runs = struct.unpack_from("<H", rh, 0)[0]
                parser.read_head(runs * 4)
        if ext:
            eh = parser.read_head(4)
            if len(eh) == 4:
                size = struct.unpack_from("<I", eh, 0)[0]
                parser.read_head(size)
        sst.append(text)
    return sst


def parse_rows(data, sst):
    rows = {}
    for rec_id, payload in iter_records(data):
        if rec_id == 0x00FD:
            if len(payload) < 10:
                continue
            row, col, _ = struct.unpack_from("<HHH", payload, 0)
            idx = struct.unpack_from("<I", payload, 6)[0]
            rows.setdefault(row, {})[col] = sst[idx] if idx < len(sst) else f"<{idx}>"
        elif rec_id == 0x0203:
            if len(payload) < 14:
                continue
            row, col, _ = struct.unpack_from("<HHH", payload, 0)
            rows.setdefault(row, {})[col] = struct.unpack_from("<d", payload, 6)[0]
        elif rec_id == 0x027E:
            if len(payload) < 10:
                continue
            row, col, _ = struct.unpack_from("<HHH", payload, 0)
            rk = struct.unpack_from("<I", payload, 6)[0]
            val = (rk >> 2) / 100.0 if rk & 0x02 else rk >> 2
            if rk & 0x01:
                val = -val
            rows.setdefault(row, {})[col] = val
        elif rec_id == 0x00BE:
            if len(payload) < 6:
                continue
            row, c0 = struct.unpack_from("<HH", payload, 0)
            p = 4
            col = c0
            while p + 6 <= len(payload) - 2:
                _, rk = struct.unpack_from("<HI", payload, p)
                val = (rk >> 2) / 100.0 if rk & 0x02 else rk >> 2
                if rk & 0x01:
                    val = -val
                rows.setdefault(row, {})[col] = val
                p += 6
                col += 1
    return rows


def ct(v):
    if v is None:
        return ""
    if isinstance(v, float) and v == int(v) and abs(v) < 1e15:
        return str(int(v))
    return str(v).strip()


def main():
    ole = olefile.OleFileIO(PATH)
    wb = ole.openstream("Workbook").read()
    records = list(iter_records(wb))
    sst = parse_sst(records)
    rows = parse_rows(wb, sst)
    print(f"SST 字符串数: {len(sst)}")

    header_row = None
    for r in sorted(rows):
        vals = [ct(rows[r].get(c)) for c in range(20)]
        if any("仓库编号" in v for v in vals):
            header_row = r
            break
    header = rows[header_row]
    max_col = max((max(cells.keys(), default=-1) for cells in rows.values()), default=-1) + 1
    cols = {c: ct(header.get(c)) for c in range(max_col)}
    print("表头:", cols)

    code_col = next((c for c, h in cols.items() if "仓库编号" in h), None)
    name_col = next((c for c, h in cols.items() if "仓库全名" in h), None)
    serial_col = next((c for c, h in cols.items() if h == "序列号"), None)

    cnt = Counter()
    samples = {}
    for r in sorted(rows):
        if r <= header_row:
            continue
        code = ct(rows[r].get(code_col)) if code_col is not None else ""
        name = ct(rows[r].get(name_col)) if name_col is not None else ""
        key = (code, name)
        cnt[key] += 1
        samples.setdefault(key, [])
        if serial_col is not None and len(samples[key]) < 2:
            samples[key].append(ct(rows[r].get(serial_col)))

    print(f"\n===== 仓库分类统计(共 {len(cnt)} 类, {sum(cnt.values())} 条) =====")
    for (code, name), count in sorted(cnt.items(), key=lambda x: (-x[1], x[0])):
        if "<" in name or "missing" in name or not name:
            continue
        print(f"  {code or '(空)'} | {name} | {count} 台 | 例SN={samples[(code, name)]}")


if __name__ == "__main__":
    main()
