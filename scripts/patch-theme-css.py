import re
from pathlib import Path

p = Path('apps/web/src/styles.css')
s = p.read_text(encoding='utf-8')

variables = """:root,
[data-theme="dark"] {
  --bg: #0b0e14;
  --bg-soft: #0d121a;
  --bg-elevated: #0f141d;
  --panel: #111822;
  --panel-2: #161d29;
  --panel-3: #0e131c;
  --card-bg: #101722;
  --table-header: #111722;
  --input-bg: #0d131c;
  --media-bg: #0a0f16;
  --media-stage: #070b11;
  --topbar-bg: rgba(11, 14, 20, 0.82);
  --line: #243042;
  --line-soft: #1b2432;
  --line-strong: #2a3546;
  --line-strong-2: #2e3a4d;
  --border-soft: #1a2230;
  --border-table: #263243;
  --text: #e9eff8;
  --muted: #8f9caf;
  --muted-2: #647187;
  --placeholder: #5f6d82;
  --accent: #f2b35c;
  --accent-strong: #ffc972;
  --blue: #6aa7ff;
  --green: #58d68d;
  --yellow: #f2c14e;
  --red: #ff6b6b;
  --pink: #f4a7d8;
  --pink-border: #5a2f4a;
  --hover: rgba(255, 255, 255, 0.035);
  --hover-soft: rgba(255, 255, 255, 0.018);
  --active-blue: rgba(106, 167, 255, 0.1);
  --active-amber: rgba(242, 179, 92, 0.12);
  --focus-bg: rgba(106, 167, 255, 0.04);
  --focus-ring: rgba(242, 179, 92, 0.7);
  --focus-blue: rgba(106, 167, 255, 0.6);
  --selection: rgba(242, 179, 92, 0.28);
  --overlay: rgba(9, 12, 18, 0.72);
  --shadow: rgba(0, 0, 0, 0.28);
  --shadow-strong: rgba(0, 0, 0, 0.45);
  --white-01: rgba(255, 255, 255, 0.012);
  --white-02: rgba(255, 255, 255, 0.02);
  --white-03: rgba(255, 255, 255, 0.03);
  --danger-bg: rgba(255, 107, 107, 0.05);
  --danger-bg-strong: rgba(255, 107, 107, 0.06);
  --danger-border: #5a2a2a;
  --danger-text: #ff9a9a;
  --note-bg: #203149;
  --note-border: #37516f;
  --note-text: #cfe0ff;
  --note-chip-bg: #16202d;
  --note-chip-border: #2a3a50;
  --note-chip-text: #b9c8dc;
  --mention-bg: #161d29;
  --video-icon-bg-1: #2a3b52;
  --video-icon-bg-2: #17202d;
  --video-placeholder-1: #121a26;
  --video-placeholder-2: #0b1018;
  --video-placeholder-text: #53647c;
  --scroll-thumb: #243042;
  --scroll-thumb-hover: #35445b;
  --brand-gradient-1: #ffd08a;
  --brand-gradient-2: #e8933f;
  --brand-text: #1a1207;
  --bg-glow-1: rgba(106, 167, 255, 0.08);
  --bg-glow-2: rgba(242, 179, 92, 0.055);
  --radius: 12px;
}

[data-theme="light"] {
  --bg: #f4f5f7;
  --bg-soft: #eef0f3;
  --bg-elevated: #f8f9fb;
  --panel: #ffffff;
  --panel-2: #f8f9fb;
  --panel-3: #ffffff;
  --card-bg: #ffffff;
  --table-header: #f7f8fa;
  --input-bg: #ffffff;
  --media-bg: #eef1f5;
  --media-stage: #e9ecf1;
  --topbar-bg: rgba(244, 245, 247, 0.86);
  --line: #dfe3e9;
  --line-soft: #e8ebf0;
  --line-strong: #cfd5de;
  --line-strong-2: #c3cad5;
  --border-soft: #edf0f4;
  --border-table: #e2e6ec;
  --text: #1b2430;
  --muted: #6b7788;
  --muted-2: #8b95a5;
  --placeholder: #9aa4b2;
  --accent: #b9721c;
  --accent-strong: #9a5c12;
  --blue: #2f6fed;
  --green: #2e9e63;
  --yellow: #b8860b;
  --red: #d9534f;
  --pink: #9b3d74;
  --pink-border: #e3bdd4;
  --hover: rgba(23, 32, 46, 0.045);
  --hover-soft: rgba(23, 32, 46, 0.025);
  --active-blue: rgba(47, 111, 237, 0.09);
  --active-amber: rgba(185, 114, 28, 0.1);
  --focus-bg: rgba(47, 111, 237, 0.04);
  --focus-ring: rgba(185, 114, 28, 0.55);
  --focus-blue: rgba(47, 111, 237, 0.45);
  --selection: rgba(185, 114, 28, 0.2);
  --overlay: rgba(244, 245, 247, 0.75);
  --shadow: rgba(28, 40, 60, 0.1);
  --shadow-strong: rgba(28, 40, 60, 0.18);
  --white-01: rgba(23, 32, 46, 0.015);
  --white-02: rgba(23, 32, 46, 0.025);
  --white-03: rgba(23, 32, 46, 0.035);
  --danger-bg: rgba(217, 83, 79, 0.06);
  --danger-bg-strong: rgba(217, 83, 79, 0.08);
  --danger-border: #e7b4b2;
  --danger-text: #b23b37;
  --note-bg: #e8f0fd;
  --note-border: #b9cdf0;
  --note-text: #234a85;
  --note-chip-bg: #f0f3f8;
  --note-chip-border: #d8dee8;
  --note-chip-text: #3b4a5f;
  --mention-bg: #ffffff;
  --video-icon-bg-1: #dbe5f0;
  --video-icon-bg-2: #eef3f8;
  --video-placeholder-1: #eef2f7;
  --video-placeholder-2: #e3e8ef;
  --video-placeholder-text: #8b95a5;
  --scroll-thumb: #c8cfd8;
  --scroll-thumb-hover: #aab4c1;
  --brand-gradient-1: #ffd08a;
  --brand-gradient-2: #e8933f;
  --brand-text: #1a1207;
  --bg-glow-1: rgba(47, 111, 237, 0.05);
  --bg-glow-2: rgba(185, 114, 28, 0.05);
  --radius: 12px;
}
"""

s = re.sub(r'^:root \{.*?\n\}\n', variables, s, count=1, flags=re.S)

s = s.replace("""  background:
    radial-gradient(1200px 600px at 75% -10%, rgba(106, 167, 255, 0.08), transparent 60%),
    radial-gradient(900px 500px at 5% 110%, rgba(242, 179, 92, 0.055), transparent 60%),
    var(--bg);""",
"""  background:
    radial-gradient(1200px 600px at 75% -10%, var(--bg-glow-1), transparent 60%),
    radial-gradient(900px 500px at 5% 110%, var(--bg-glow-2), transparent 60%),
    var(--bg);""")

s = s.replace("outline: 1px solid rgba(242, 179, 92, 0.7);", "outline: 1px solid var(--focus-ring);")
s = s.replace("background: rgba(242, 179, 92, 0.28);", "background: var(--selection);")
s = s.replace("background: #243042;", "background: var(--scroll-thumb);")
s = s.replace("background: #35445b;", "background: var(--scroll-thumb-hover);")
s = s.replace("background: rgba(11, 14, 20, 0.82);", "background: var(--topbar-bg);")
s = s.replace("background: rgba(11, 14, 20, 0.75);", "background: var(--topbar-bg);")

hex_map = {
    '#0b0e14': 'var(--bg)',
    '#0d121a': 'var(--bg-soft)',
    '#0f141d': 'var(--bg-elevated)',
    '#111822': 'var(--panel)',
    '#161d29': 'var(--panel-2)',
    '#0e131c': 'var(--panel-3)',
    '#111722': 'var(--table-header)',
    '#0d131c': 'var(--input-bg)',
    '#101722': 'var(--card-bg)',
    '#0a0f16': 'var(--media-bg)',
    '#0b1018': 'var(--media-bg)',
    '#070b11': 'var(--media-stage)',
    '#243042': 'var(--line)',
    '#1b2432': 'var(--line-soft)',
    '#2a3546': 'var(--line-strong)',
    '#2e3a4d': 'var(--line-strong-2)',
    '#1a2230': 'var(--border-soft)',
    '#263243': 'var(--border-table)',
    '#233043': 'var(--line)',
    '#2b374a': 'var(--line-strong-2)',
    '#3a465a': 'var(--line-strong)',
    '#40506a': 'var(--line-strong)',
    '#1e2836': 'var(--line-soft)',
    '#202b3b': 'var(--hover)',
    '#141c28': 'var(--panel-2)',
    '#121b27': 'var(--panel-2)',
    '#151d2a': 'var(--panel-2)',
    '#121722': 'var(--panel)',
    '#e9eff8': 'var(--text)',
    '#8f9caf': 'var(--muted)',
    '#647187': 'var(--muted-2)',
    '#5f6d82': 'var(--placeholder)',
    '#f2b35c': 'var(--accent)',
    '#ffc972': 'var(--accent-strong)',
    '#6aa7ff': 'var(--blue)',
    '#58d68d': 'var(--green)',
    '#f2c14e': 'var(--yellow)',
    '#ff6b6b': 'var(--red)',
    '#ff9a9a': 'var(--danger-text)',
    '#5a2a2a': 'var(--danger-border)',
    '#203149': 'var(--note-bg)',
    '#37516f': 'var(--note-border)',
    '#cfe0ff': 'var(--note-text)',
    '#16202d': 'var(--note-chip-bg)',
    '#2a3a50': 'var(--note-chip-border)',
    '#b9c8dc': 'var(--note-chip-text)',
    '#2a3b52': 'var(--video-icon-bg-1)',
    '#17202d': 'var(--video-icon-bg-2)',
    '#121a26': 'var(--video-placeholder-1)',
    '#53647c': 'var(--video-placeholder-text)',
    '#35445b': 'var(--scroll-thumb-hover)',
    '#c4d0e0': 'var(--text)',
    '#9be7b7': 'var(--green)',
    '#7f8da3': 'var(--muted)',
    '#9cc4ff': 'var(--blue)',
    '#ffd27d': 'var(--yellow)',
    '#5a4a28': 'var(--line-strong)',
    '#2f4d74': 'var(--line-strong)',
    '#f4a7d8': 'var(--pink)',
    '#5a2f4a': 'var(--pink-border)',
    '#ffd08a': 'var(--brand-gradient-1)',
    '#e8933f': 'var(--brand-gradient-2)',
    '#1a1207': 'var(--brand-text)',
}
for old, new in hex_map.items():
    s = s.replace(old, new)

rgba_map = {
    'rgba(255, 255, 255, 0.035)': 'var(--hover)',
    'rgba(255, 255, 255, 0.018)': 'var(--hover-soft)',
    'rgba(255, 255, 255, 0.012)': 'var(--white-01)',
    'rgba(255, 255, 255, 0.015)': 'var(--white-01)',
    'rgba(255, 255, 255, 0.02)': 'var(--white-02)',
    'rgba(255, 255, 255, 0.025)': 'var(--white-03)',
    'rgba(255, 255, 255, 0.03)': 'var(--white-03)',
    'rgba(106, 167, 255, 0.1)': 'var(--active-blue)',
    'rgba(106, 167, 255, 0.10)': 'var(--active-blue)',
    'rgba(106, 167, 255, 0.12)': 'var(--active-blue)',
    'rgba(106, 167, 255, 0.04)': 'var(--focus-bg)',
    'rgba(106, 167, 255, 0.6)': 'var(--focus-blue)',
    'rgba(242, 179, 92, 0.12)': 'var(--active-amber)',
    'rgba(242, 179, 92, 0.08)': 'var(--active-amber)',
    'rgba(242, 179, 92, 0.28)': 'var(--selection)',
    'rgba(242, 179, 92, 0.7)': 'var(--focus-ring)',
    'rgba(9, 12, 18, 0.72)': 'var(--overlay)',
    'rgba(255, 107, 107, 0.05)': 'var(--danger-bg)',
    'rgba(255, 107, 107, 0.06)': 'var(--danger-bg-strong)',
    'rgba(0, 0, 0, 0.28)': 'var(--shadow)',
    'rgba(0, 0, 0, 0.45)': 'var(--shadow-strong)',
}
for old, new in rgba_map.items():
    s = s.replace(old, new)

s += """

/* ---------- custom inputs ---------- */

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.field-block {
  margin-bottom: 14px;
}

.field-label {
  color: var(--muted);
  font-size: 10.5px;
  letter-spacing: 0.04em;
}

.field-input {
  width: 100%;
  padding: 9px 11px;
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  background: var(--input-bg);
  color: var(--text);
  font-size: 13px;
  outline: none;
  transition: border-color 120ms ease, box-shadow 120ms ease;
}

.field-input::placeholder {
  color: var(--placeholder);
}

.field-input:hover {
  border-color: var(--muted-2);
}

.field-input:focus {
  border-color: var(--blue);
  box-shadow: 0 0 0 3px var(--active-blue);
}

.field-input.has-error {
  border-color: var(--danger-border);
}

.field-error {
  color: var(--danger-text);
  font-size: 11px;
}

.settings-inline-form .field {
  flex: 1;
}

.library-search {
  width: 220px;
  margin-left: auto;
}

.library-search .field-input {
  padding: 7px 10px;
}

/* ---------- light-theme contrast fixes ---------- */

[data-theme="light"] .status-badge.status-ready {
  color: #1f7a4d;
  border-color: #b7e0c8;
}

[data-theme="light"] .status-badge.status-failed {
  color: #b23b37;
  border-color: #e7b4b2;
}

[data-theme="light"] .status-badge.status-processing,
[data-theme="light"] .status-badge.status-uploading {
  color: #8a5a00;
  border-color: #e3d1a8;
}

[data-theme="light"] .recycle-kind.kind-row {
  color: #2f6fed;
  border-color: #b9cdf0;
  background: rgba(47, 111, 237, 0.06);
}

[data-theme="light"] .recycle-kind.kind-sheet {
  color: #8a5a00;
  border-color: #e3d1a8;
  background: rgba(184, 134, 11, 0.06);
}

[data-theme="light"] .recycle-kind.kind-media {
  color: #9b3d74;
  border-color: #e3bdd4;
  background: rgba(155, 61, 116, 0.05);
}

[data-theme="light"] .mark-dot.red {
  background: #d9534f;
  border-color: #d9534f;
  box-shadow: 0 0 8px rgba(217, 83, 79, 0.25);
}

[data-theme="light"] .mark-dot.yellow {
  background: #b8860b;
  border-color: #b8860b;
  box-shadow: 0 0 8px rgba(184, 134, 11, 0.25);
}

[data-theme="light"] .mark-dot.green {
  background: #2e9e63;
  border-color: #2e9e63;
  box-shadow: 0 0 8px rgba(46, 158, 99, 0.25);
}
"""

p.write_text(s, encoding='utf-8')
print('theme css patched')
