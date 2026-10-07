"""Render the documentation bundle without dependencies; embed reference images."""
from pathlib import Path
import base64
import html
import re

ROOT = Path(__file__).resolve().parents[1]
SECTIONS = [
    ("overview", "概要", "README.md"),
    ("implementation", "実装可否・手順", "docs/implementation-plan.md"),
    ("runtime", "ゲームエンジンR1.3", "docs/runtime-r1.md"),
    ("map", "マップ仕様", "docs/map-spec.md"),
    ("spec", "ゲーム仕様", "docs/spec.md"),
    ("policy", "補完監査", "docs/reproduction-policy.md"),
    ("review", "再監査", "docs/rule-review.md"),
    ("radar", "レーダー", "docs/radar-tags.md"),
    ("visual", "画面・操作", "docs/visual-reference.md"),
    ("characters", "64名", "docs/character-audit.md"),
    ("weapons", "装備・スキル", "docs/weapon-audit.md"),
    ("sources", "出典", "docs/sources.md"),
    ("verification", "検証", "docs/verification.md"),
    ("agents", "作業規約", "AGENTS.md"),
]
ANCHORS = {(ROOT / filename).resolve(): key for key, _, filename in SECTIONS}


def target(value, path, image=False):
    if value.startswith(("http:", "https:", "#")):
        return value
    dest = (path.parent / value.split("#")[0]).resolve()
    if image:
        mime = "image/jpeg" if dest.suffix.lower() in (".jpg", ".jpeg") else "image/png"
        return f"data:{mime};base64," + base64.b64encode(dest.read_bytes()).decode("ascii")
    if dest in ANCHORS:
        return "#" + ANCHORS[dest]
    return dest.relative_to(ROOT).as_posix()


def inline(line, path):
    pattern = r'!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]*)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*'
    parts, end = [], 0
    for m in re.finditer(pattern, line):
        parts.append(html.escape(line[end:m.start()]))
        if m.group(1) is not None:
            parts.append(f'<img alt="{html.escape(m.group(1), quote=True)}" src="{target(m.group(2), path, True)}">')
        elif m.group(3) is not None:
            parts.append(f'<a href="{html.escape(target(m.group(4), path), quote=True)}">{html.escape(m.group(3))}</a>')
        elif m.group(5) is not None:
            parts.append(f'<code>{html.escape(m.group(5))}</code>')
        else:
            parts.append(f'<strong>{html.escape(m.group(6))}</strong>')
        end = m.end()
    parts.append(html.escape(line[end:]))
    return "".join(parts)


def render(path):
    lines = path.read_text(encoding="utf-8").splitlines()
    result, i = [], 0
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        if line.startswith("```"):
            i += 1
            code = []
            while i < len(lines) and not lines[i].startswith("```"):
                code.append(lines[i])
                i += 1
            result.append("<pre><code>" + html.escape("\n".join(code)) + "</code></pre>")
        elif line.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                row = lines[i]
                if not re.fullmatch(r'[|\s:\-]+', row):
                    rows.append(row.strip("|").split("|"))
                i += 1
            result.append('<div class="table-wrap"><table><thead><tr>' + ''.join('<th>'+inline(c.strip(), path)+'</th>' for c in rows[0]) + '</tr></thead><tbody>')
            for row in rows[1:]:
                result.append('<tr>'+''.join('<td>'+inline(c.strip(), path)+'</td>' for c in row)+'</tr>')
            result.append('</tbody></table></div>')
            continue
        elif re.match(r'^#{1,6} ', line):
            level = len(line.split(" ", 1)[0])
            result.append(f'<h{level}>'+inline(line[level+1:], path)+f'</h{level}>')
        elif re.match(r'^(- |\d+\. )', line):
            ordered = bool(re.match(r'^\d+\. ', line))
            tag = "ol" if ordered else "ul"
            result.append(f'<{tag}>')
            while i < len(lines) and re.match(r'^(- |\d+\. )', lines[i]):
                result.append('<li>'+inline(re.sub(r'^(- |\d+\. )', '', lines[i]), path)+'</li>')
                i += 1
            result.append(f'</{tag}>')
            continue
        else:
            para = []
            while i < len(lines) and lines[i].strip() and not re.match(r'^(#|\||```|- |\d+\. )', lines[i]):
                para.append(lines[i])
                i += 1
            result.append('<p>'+inline(' '.join(para), path)+'</p>')
            continue
        i += 1
    return "\n".join(result)


def main():
    # Preserve the established visual style, never reuse stale section contents.
    old = (ROOT / "仕様書.html").read_text(encoding="utf-8")
    css = re.search(r'<style>(.*?)</style>', old, re.S).group(1)
    nav = ''.join(f'<a href="#{key}">{label}</a>' for key, label, _ in SECTIONS)
    sections = ''.join(f'<section id="{key}">{render(ROOT / filename)}</section>' for key, _, filename in SECTIONS)
    search = '<div class="search"><label for="filter">表を検索 </label><input id="filter" type="search" placeholder="例：M1、援護、未確認"><span id="count">全行を表示</span><p class="note">表だけ絞り込み。原作参照画像は埋込済み。独自マップは <a href="map-preview.html">確認ビューア</a> を開いてください。</p></div>'
    script = "const f=document.getElementById('filter');f.addEventListener('input',()=>{const q=f.value.trim().toLowerCase();let n=0;for(const r of document.querySelectorAll('tbody tr')){const ok=!q||r.textContent.toLowerCase().includes(q);r.hidden=!ok;if(ok)n++;}document.getElementById('count').textContent=q?n+'行を表示':'全行を表示';});"
    doc = f'<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>戦闘シミュレーション仕様 v0.8</title><style>{css}</style></head><body><header><h1>閉鎖環境 戦闘シミュレーション再現仕様</h1><p>v0.8 · 2026-10-06 · 実装判断 / R1.3 / マップM1.1 / 64名・41装備の照合</p></header><nav>{nav}</nav><main>{search}{sections}</main><script>{script}</script></body></html>'
    (ROOT / "仕様書.html").write_text(doc, encoding="utf-8")
    print(f"Built specification v0.8: {len(SECTIONS)} sections, embedded reference images")


if __name__ == "__main__":
    main()
