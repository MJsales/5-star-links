# Generates sales-preview sites for local businesses into demo/<slug>.html.
# Each page is a pitch: noindex, with a banner saying it's a preview built by
# 5 Star Links. Only put verified facts in BUSINESSES — no invented reviews,
# prices, or claims. Run: python3 demo/build.py
import html, json, pathlib, urllib.parse

OUT = pathlib.Path(__file__).parent

THEMES = {
    'barber': dict(bg='#0c0c0e', panel='#16161a', accent='#d4a24c', accent2='#f3d18a', text='#f4efe6', muted='#a39e94',
                   font="'Oswald', sans-serif", fontlink='Oswald:wght@500;700', icon='💈'),
    'detail': dict(bg='#06121c', panel='#0d1e2c', accent='#2bb3ff', accent2='#9fe0ff', text='#eef8ff', muted='#93aabb',
                   font="'Rajdhani', sans-serif", fontlink='Rajdhani:wght@600;700', icon='🚗'),
    'food':   dict(bg='#1a0b06', panel='#2a130a', accent='#ff7a1a', accent2='#ffc15e', text='#fff4e8', muted='#d2b39c',
                   font="'Bebas Neue', sans-serif", fontlink='Bebas+Neue', icon='🌮'),
}

SERVICE_ICONS = {'Haircut': '✂️', 'Beard': '🧔', 'Shave': '🪒', 'Head': '💈', 'Wash': '🧽', 'Interior': '🧼',
                 'Reset': '✨', 'Asada': '🥩', 'Pastor': '🍍', 'Queso': '🧀', 'Mole': '🌶️', 'Chicken': '🍗',
                 'Short Rib': '🥪', 'Tamales': '🫔', 'Vegan': '🌱', 'Torta': '🥖', 'Pozole': '🍲', 'Potato': '🥔',
                 'Quesadilla': '🫓', 'Fresca': '🍓', 'Taco': '🌮'}

BARBER_SERVICES = [("Men's Haircut", 'Clean cuts and fades'), ('Beard Trim', 'Shape-ups and line-ups'),
                   ('Hot Towel Shave', 'Classic straight-razor shave'), ('Head Shave', 'Smooth, clean finish')]

BUSINESSES = [
    dict(slug='kings-barbershop', name='Kings BarberShop', kind='barber', tagline='Downtown Lompoc cuts on Ocean Ave',
         address='118 E Ocean Ave, Lompoc, CA 93436', phone='(805) 743-4392', services=BARBER_SERVICES,
         about='A neighborhood barbershop in the heart of downtown Lompoc. Walk in or call ahead.'),
    dict(slug='village-barber-shop', name='Village Barber Shop', kind='barber', tagline='Your Village Plaza barber in Lompoc',
         address='3734 Constellation Rd #H, Lompoc, CA 93436', phone='(805) 714-2407', services=BARBER_SERVICES,
         about='A friendly neighborhood barbershop on Constellation Road. Walk in or call ahead.'),
    dict(slug='premium-barbershop', name='The Premium Barbershop', kind='barber', tagline='Premium cuts on North H Street',
         address='1145 N H St, Suite E, Lompoc, CA 93436', phone='(820) 218-7655', services=BARBER_SERVICES,
         about='Sharp fades, clean lines and classic cuts on North H Street. Walk in or call ahead.'),
    dict(slug='andriks-barbershop', name="Andrik's Barbershop & Hair Salon", kind='barber', tagline='Barbershop & hair salon on Walnut Ave',
         address='105 W Walnut Ave, Lompoc, CA 93436', phone='(805) 741-6337', services=BARBER_SERVICES,
         about='Barbershop and hair salon in Lompoc for cuts, shaves and beard work. Walk in or call ahead.'),
    dict(slug='franks-mobile-detailing', name="Frank's Mobile Detailing", kind='detail', tagline='We come to you — anywhere in Lompoc',
         address='Mobile service · Lompoc, CA', phone='(820) 241-1646', mobile=True,
         hours='Mon–Sat · 8:00 am – 5:00 pm', book='https://frank-s-mobile-detailing.reservio.com/',
         services=[('Exterior Wash', '$65'), ('Interior/Exterior Basic', '$120'), ('Interior/Exterior Reset', '$250')],
         about="Professional car detailing at your home or work. Book online, and Frank brings everything needed."),
    dict(slug='lompoc-kekas', name='Lompoc Kekas', kind='food', tagline='Food from the heart of Zacatecas, Mexico',
         address='Food truck · Lompoc, CA', mobile=True, instagram='lompockekas',
         services=[('Asada', 'With jack cheese'), ('Al Pastor', 'Marinated pork, fresh pineapple, grilled onions, jack cheese'),
                   ('Queso', 'Melty cheese keka'), ('De Mole', 'Rich mole filling')],
         about="Food from the heart of Zacatecas, Mexico. A keka (keh·kuh) is a stuffed, deep-fried quesadilla made from corn masa. Follow us on Instagram for today's location and hours."),
    dict(slug='sassafrass', name='Sassafrass Lompoc', kind='food', tagline='Elevated comfort food 🌱 · Food truck, events & catering',
         address='Food truck · Lompoc, CA', mobile=True, instagram='sassafrass805', phone='(805) 865-0404',
         email='sassafrasslompoc@gmail.com',
         services=[('Tennessee Hot Chicken', 'Sandwich'), ('Braised Short Rib', 'Grilled sandwich with caramelized pickled red onion'),
                   ('Hot Cheeto Asada Tacos', 'Asada tacos with a Hot Cheeto crunch'), ('Tamales', 'Ask what’s on today'), ('Vegan Options', 'Plant-based comfort food')],
         about='Elevated comfort food from a Lompoc food truck, with plenty of vegan options. Booking an event? Sassafrass caters, so get in touch for your date.'),
    dict(slug='birria-boyz', name='The Birria Boyz', kind='food', tagline='Birria de Res 🐄 · The one and only Birria Boyz',
         address='Food truck · Lompoc, CA', mobile=True, instagram='thebirriaboyz',
         services=[('Birria Tacos', 'Slow-cooked birria on flat-top fried corn tortillas with melted cheese'),
                   ('Birria Quesadilla', 'A customer go-to'), ('Birria Torta', 'Stacked birria sandwich'),
                   ('Pozole', 'Classic Mexican stew'), ('Birria Baked Potato', 'Loaded with birria'), ('Strawberry Fresca', 'House agua fresca')],
         about="Lompoc's birria truck. Slow-cooked birria de res, served on crispy tortillas with melted cheese. Follow us on Instagram for today's location and hours."),
]


def icon_for(title, default):
    for k, v in SERVICE_ICONS.items():
        if k.lower() in title.lower():
            return v
    return default


def page(b):
    t = THEMES[b['kind']]
    e = lambda s: html.escape(s, quote=True)
    tel = 'tel:+1' + ''.join(c for c in b.get('phone', '') if c.isdigit())
    maps_q = urllib.parse.quote(b['name'] + ' ' + b['address'])
    ig = f"https://instagram.com/{b['instagram']}" if b.get('instagram') else None

    ctas = []
    if ig:  # food trucks: where-are-you-today is the first thing people need
        ctas.append(f'<a class="btn primary" href="{ig}" target="_blank" rel="noopener">📍 Today\'s location on Instagram</a>')
    if b.get('phone'):
        ctas.append(f'<a class="btn{"" if ig else " primary"}" href="{tel}">📞 Call {e(b["phone"])}</a>')
    if b.get('email'):
        ctas.append(f'<a class="btn" href="mailto:{e(b["email"])}">✉️ Catering &amp; events</a>')
    if b.get('book'):
        ctas.append(f'<a class="btn" href="{e(b["book"])}" target="_blank" rel="noopener">📅 Book online</a>')
    if not b.get('mobile'):
        ctas.append(f'<a class="btn" href="https://www.google.com/maps/search/?api=1&query={maps_q}" target="_blank" rel="noopener">🧭 Directions</a>')

    label = 'Menu' if b['kind'] == 'food' else ('Services & Prices' if b['kind'] == 'detail' else 'Services')
    cards = ''.join(f'<div class="card"><div class="ci">{icon_for(n, t["icon"])}</div><h3>{e(n)}</h3><p>{e(d)}</p></div>'
                    for n, d in b['services'])

    info = []
    info.append(f'<div><span>Where</span><b>{e(b["address"])}</b></div>')
    if b.get('phone'):
        info.append(f'<div><span>Call</span><b><a href="{tel}">{e(b["phone"])}</a></b></div>')
    info.append(f'<div><span>Hours</span><b>{e(b.get("hours", "Posted daily on Instagram" if ig else "Call for today’s hours"))}</b></div>')
    if b.get('email'):
        info.append(f'<div><span>Catering &amp; events</span><b><a href="mailto:{e(b["email"])}">{e(b["email"])}</a></b></div>')
    if ig:
        info.append(f'<div><span>Instagram</span><b><a href="{ig}" target="_blank" rel="noopener">@{e(b["instagram"])}</a></b></div>')
    map_html = '' if b.get('mobile') else (
        f'<iframe class="map" loading="lazy" title="Map" src="https://www.google.com/maps?q={maps_q}&output=embed"></iframe>')

    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>{e(b["name"])} · Lompoc, CA</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family={t["fontlink"]}&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
:root{{--bg:{t["bg"]};--panel:{t["panel"]};--a:{t["accent"]};--a2:{t["accent2"]};--t:{t["text"]};--m:{t["muted"]}}}
body{{background:var(--bg);color:var(--t);font-family:Inter,system-ui,sans-serif;line-height:1.55}}
a{{color:inherit}}
.preview{{background:#7c3aed;color:#fff;font-size:.82rem;text-align:center;padding:.55rem 1rem}}
.preview a{{font-weight:700}}
header{{display:flex;justify-content:space-between;align-items:center;padding:1rem 1.25rem;max-width:1080px;margin:0 auto}}
.logo{{font-family:{t["font"]};font-size:1.35rem;letter-spacing:1px;text-transform:uppercase}}
.logo span{{color:var(--a)}}
header a.call{{text-decoration:none;font-weight:600;font-size:.9rem;color:var(--a2)}}
.hero{{position:relative;overflow:hidden;text-align:center;padding:5rem 1.25rem 4.5rem;
  background:radial-gradient(ellipse at 50% 0%,color-mix(in srgb,var(--a) 28%,transparent),transparent 65%),
  repeating-linear-gradient(135deg,transparent 0 22px,color-mix(in srgb,var(--a) 6%,transparent) 22px 24px)}}
.hero .big{{font-size:4.2rem;line-height:1;margin-bottom:.6rem}}
.hero h1{{font-family:{t["font"]};font-size:clamp(2.6rem,9vw,4.6rem);line-height:1;text-transform:uppercase;letter-spacing:1px}}
.hero p{{color:var(--m);font-size:1.1rem;margin:1rem auto 2rem;max-width:34rem}}
.ctas{{display:flex;gap:.75rem;justify-content:center;flex-wrap:wrap}}
.btn{{display:inline-block;padding:.9rem 1.4rem;border-radius:12px;text-decoration:none;font-weight:700;border:2px solid var(--a);color:var(--a2)}}
.btn.primary{{background:var(--a);color:var(--bg);border-color:var(--a)}}
section{{max-width:1080px;margin:0 auto;padding:3.5rem 1.25rem}}
h2{{font-family:{t["font"]};font-size:2.2rem;text-transform:uppercase;letter-spacing:1px;margin-bottom:1.5rem;text-align:center}}
h2::after{{content:"";display:block;width:60px;height:3px;background:var(--a);margin:.6rem auto 0}}
.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem}}
.card{{background:var(--panel);border:1px solid color-mix(in srgb,var(--a) 25%,transparent);border-radius:16px;padding:1.5rem;text-align:center}}
.ci{{font-size:2rem;margin-bottom:.5rem}}
.card h3{{font-family:{t["font"]};font-size:1.35rem;letter-spacing:.5px;margin-bottom:.3rem}}
.card p{{color:var(--a2);font-weight:600}}
.about{{text-align:center;color:var(--m);font-size:1.1rem;max-width:40rem;margin:0 auto}}
.info{{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;margin-bottom:1.5rem}}
.info div{{background:var(--panel);border-radius:14px;padding:1.1rem 1.2rem}}
.info span{{display:block;color:var(--m);font-size:.75rem;text-transform:uppercase;letter-spacing:1px;margin-bottom:.2rem}}
.info a{{color:var(--a2)}}
.map{{width:100%;height:320px;border:0;border-radius:16px;filter:grayscale(.3)}}
footer{{text-align:center;color:var(--m);font-size:.8rem;padding:2rem 1rem 6rem}}
.sticky{{position:fixed;left:12px;right:12px;bottom:12px;display:none}}
.sticky a{{display:block;text-align:center}}
@media (max-width:640px){{.sticky{{display:block}} header a.call{{display:none}}}}
</style>
</head>
<body>
<div class="preview">✨ Website preview made for {e(b["name"])} by 5 Star Links · <a href="https://www.5starlinks.xyz/website.html">Make it yours for $500</a></div>
<header><div class="logo">{e(b["name"].split(" ")[0])} <span>{e(" ".join(b["name"].split(" ")[1:]))}</span></div>
{f'<a class="call" href="{tel}">📞 {e(b["phone"])}</a>' if b.get("phone") else ""}</header>
<div class="hero"><div class="big">{t["icon"]}</div><h1>{e(b["name"])}</h1><p>{e(b["tagline"])}</p><div class="ctas">{"".join(ctas)}</div></div>
<section><h2>{label}</h2><div class="grid">{cards}</div></section>
<section><h2>About</h2><p class="about">{e(b["about"])}</p></section>
<section><h2>Find Us</h2><div class="info">{"".join(info)}</div>{map_html}</section>
<footer>© 2026 {e(b["name"])} · Lompoc, California</footer>
<div class="sticky">{ctas[0].replace('class="btn', 'class="btn primary') if ctas else ""}</div>
</body>
</html>
'''


if __name__ == '__main__':
    for b in BUSINESSES:
        (OUT / f"{b['slug']}.html").write_text(page(b), encoding='utf-8')
        print('wrote demo/' + b['slug'] + '.html')
