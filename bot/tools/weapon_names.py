"""Названия оружия из модов: префаб -> русское название (по строковым таблицам ru_ru)."""
import sys, re, json
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
import pak

files, ru = {}, {}
for p in sys.argv[2:]:
    d, es = pak.entries(p)
    for e in es:
        n = e[0]
        if n.endswith('.et') and n.startswith('Prefabs/'):
            files[n] = pak.read(d, e).decode('utf-8', 'replace')
        elif n.startswith('Language/') and ('ru_ru' in n or 'en_us' in n):
            t = pak.read(d, e).decode('utf-8', 'replace')
            ids = re.findall(r'"((?:[^"\\]|\\.)*)"', t[t.find('Ids {'):t.find('Texts {')])
            txt = re.findall(r'"((?:[^"\\]|\\.)*)"', t[t.find('Texts {'):])
            # ru важнее: en только там, где русского нет
            for i, v in zip(ids, txt):
                if 'ru_ru' in n or i not in ru:
                    ru[i] = v

NAME = re.compile(r'(?:ItemDisplayName|UIInfo)[^{\n]*\{[^}]*?\bName "([^"]+)"', re.S)
PARENT = re.compile(r'^\w+ : "\{[0-9A-F]+\}([^"]+)"', re.M)

def key_of(path, depth=0):
    t = files.get(path)
    if t is None or depth > 12:
        return None
    m = NAME.search(t)
    if m:
        return m.group(1)
    p = PARENT.search(t)
    return key_of(p.group(1), depth + 1) if p else None

out = {}
for path in sorted(files):
    if not path.startswith('Prefabs/Weapons/') or re.search(r'/(Magazines|Ammo|Attachments|Core)/', path):
        continue
    if path.endswith('_Base.et'):
        continue
    k = key_of(path)
    if not k:
        continue
    # Название бывает составным: "#Модель (#Комплектация)" — переводим каждый ключ.
    miss = []
    def tr(m):
        v = ru.get(m.group(1))
        if v is None:
            miss.append(m.group(1))
        return v or ''
    name = re.sub(r'#([A-Za-z0-9_\-]+)', tr, k).strip()
    name = re.sub(r'\(\s*\)', '', name).strip()
    if name and not miss:
        out[path] = name
json.dump(out, open(sys.argv[1], 'w', encoding='utf-8'), ensure_ascii=False, indent=1, sort_keys=True)
print(len(files), 'prefabs,', len(ru), 'ru strings ->', len(out), 'weapon names')
