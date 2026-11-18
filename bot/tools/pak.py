"""Чтение архивов Enfusion (.pak, FORM/PAC1): список файлов и распаковка."""
import struct, zlib, sys

def entries(path):
    d = open(path, 'rb').read()
    p = 12
    while p < len(d):
        tag = d[p:p+4]; ln = struct.unpack('>I', d[p+4:p+8])[0]
        if tag == b'FILE':
            fp, end = p + 8, p + 8 + ln
            break
        p += 8 + ln
    out = []
    def walk(pos, prefix):
        t = d[pos]; n = d[pos+1]; name = d[pos+2:pos+2+n].decode('utf-8', 'replace'); pos += 2 + n
        if t == 0:
            cnt = struct.unpack('<I', d[pos:pos+4])[0]; pos += 4
            for _ in range(cnt):
                pos = walk(pos, prefix + name + '/' if name else prefix)
        else:
            off, comp, orig = struct.unpack('<III', d[pos:pos+12]); pos += 24
            out.append((prefix + name, off, comp, orig))
        return pos
    walk(fp, '')
    return d, out

def read(d, e):
    _, off, comp, orig = e
    raw = d[off:off+comp]
    return zlib.decompress(raw) if comp != orig else raw

if __name__ == '__main__':
    d, es = entries(sys.argv[1])
    for e in es[:20]: print(e)
    print(len(es))
