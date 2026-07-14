from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools import subset
import hashlib, os

# Subset set — mirrors the Archivo WO-5.1 BUILD.md exactly, PLUS the money
# spaces (U+202F/U+2009) added to the keep-list so each font's ACTUAL coverage
# decides (the guard then pins the truth). Latin + French typographic.
KEEP = set()
KEEP |= set(range(0x0020, 0x007F))      # basic latin
KEEP |= set(range(0x00A0, 0x0100))      # latin-1 (incl U+00A0 NBSP, « », accents)
KEEP |= {0x0152,0x0153,0x0131}          # Œ œ ı
KEEP |= {0x2018,0x2019,0x201C,0x201D}   # curly quotes
KEEP |= {0x2013,0x2014,0x2026}          # – — …
KEEP |= {0x20AC}                        # €
KEEP |= {0x202F,0x2009}                 # narrow no-break space, thin space (coverage decided by the font)

def build(src, axes, family, weightclass, out):
    f = TTFont(src)
    instantiateVariableFont(f, axes, inplace=True)   # pin ALL axes -> static
    # subset (keep tnum/kern via layout_features='*')
    opts = subset.Options()
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    opts.name_legacy = True
    opts.recalc_bounds = True
    opts.notdef_outline = True
    opts.glyph_names = False
    ss = subset.Subsetter(options=opts)
    ss.populate(unicodes=KEEP)
    ss.subset(f)
    # DISTINCT name-table identity per weight (the Archivo collision lesson)
    ps = family  # already hyphenated PascalCase, e.g. BricolageGrotesque-Bold
    nm = f['name']
    for pid,eid,lid in [(3,1,0x409),(1,0,0)]:
        nm.setName(family, 1, pid, eid, lid)   # family
        nm.setName('Regular', 2, pid, eid, lid) # subfamily
        nm.setName(family, 4, pid, eid, lid)    # full
        nm.setName(ps, 6, pid, eid, lid)        # postscript
        nm.setName(family, 16, pid, eid, lid)   # typographic family
        nm.setName('Regular', 17, pid, eid, lid)
    f['OS/2'].usWeightClass = weightclass
    f['head'].macStyle = 0
    if 'OS/2' in f:  # clear bold/italic selection ambiguity; Regular subfamily
        f['OS/2'].fsSelection = (f['OS/2'].fsSelection & ~0b100001) | 0x40  # REGULAR bit
    f.save(out)
    b = open(out,'rb').read()
    return len(b), hashlib.sha256(b).hexdigest()

jobs = [
  ('Bricolage-VF.ttf', {'opsz':36,'wdth':100,'wght':700}, 'BricolageGrotesque-Bold', 700, 'BricolageGrotesque-Bold.ttf'),
  ('Bricolage-VF.ttf', {'opsz':36,'wdth':100,'wght':800}, 'BricolageGrotesque-ExtraBold', 800, 'BricolageGrotesque-ExtraBold.ttf'),
  ('InstrumentSans-VF.ttf', {'wdth':100,'wght':400}, 'InstrumentSans-Regular', 400, 'InstrumentSans-Regular.ttf'),
  ('InstrumentSans-VF.ttf', {'wdth':100,'wght':500}, 'InstrumentSans-Medium', 500, 'InstrumentSans-Medium.ttf'),
  ('InstrumentSans-VF.ttf', {'wdth':100,'wght':600}, 'InstrumentSans-SemiBold', 600, 'InstrumentSans-SemiBold.ttf'),
  ('InstrumentSans-VF.ttf', {'wdth':100,'wght':700}, 'InstrumentSans-Bold', 700, 'InstrumentSans-Bold.ttf'),
]
total=0
for src,axes,fam,wc,out in jobs:
    n,h = build(src,axes,fam,wc,out)
    total += n
    print(f"{out:34s} {n:6d} bytes  wght {wc}  sha256 {h}")
print(f"TOTAL: {total} bytes ({total/1024:.1f} KB)")
