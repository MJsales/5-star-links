// Deal list shared by deals.html (loaded as a plain <script>) and the Discord
// deals bot in api/discord.js (require'd in Node). Edit deals here only.
//
// Add new deals here. percentOff is computed automatically from origPrice/salePrice.
// Every discount level shows up (use the "min % off" filter on the page to narrow it down).
// type: "Online" (needs a link) or "In-Store" (needs sku/location; lat/lng optional —
// only set lat/lng if you know the REAL coordinates of the specific store this applies to).
//
// Optional flags:
//   isHub: true             -> retailer's own live "50%+ off" filtered category page (no
//                               single item price — set `blurb` + `ctaText`, not origPrice/salePrice).
//   isGeneralHub: true      -> retailer's general clearance/outlet page where discounts vary
//                               item to item (not pre-filtered to any specific %) — same
//                               rendering as isHub, but only shows up under the "All" % filter
//                               since we can't confirm any specific item on it hits a threshold.
//   origPriceUnknown: true  -> for penny/near-free items where the sale price is confirmed
//                               but the regular price isn't known — skips the fake strikethrough price.
//   source / sourceUrl      -> attribution for anything community-reported rather than
//                               personally verified — always include so shoppers can double check.
//
// Online example:
//   { name: "Item Name", store: "DHGate", type: "Online", origPrice: 89.99, salePrice: 39.99, link: "https://..." },
// In-Store example:
//   { name: "Item Name", store: "Home Depot", type: "In-Store", origPrice: 79.00, salePrice: 0.01, sku: "123-456", location: "Garden dept endcap", address: "123 Main St, City", lat: 43.78, lng: -79.46 },
//
// Only put REAL prices you've verified here — origPrice/salePrice are shown to customers
// as actual discounts, so made-up numbers would be false advertising. For anything not
// personally verified (community penny lists, clearance sightings, etc.) always include
// source/sourceUrl so shoppers can double check before making a trip.

// Fill in affiliate IDs here once you're approved for each program -- every outbound
// deal link runs through withAffiliate() below. Leave an ID blank to link out plain
// (no tag). Each affiliate network has its own URL format, so this only auto-tags
// Amazon (the simplest: just an appended query param) -- for Rakuten/CJ/Impact/Awin
// programs, replace/wrap the specific store's branch with that network's link format
// once you have it.
const AFFILIATE_IDS = {
  amazon: '5starlinks0c-20', // same Amazon Associates tag already used on guides.html
};
function withAffiliate(url, store) {
  if (store === 'Amazon' && AFFILIATE_IDS.amazon && !url.includes('tag=')) {
    const sep = url.includes('?') ? '&' : '?';
    return url + sep + 'tag=' + encodeURIComponent(AFFILIATE_IDS.amazon);
  }
  return url;
}
const deals = [
  // ---- Online: free cashback on top of every deal on this page ----
  { name: "Get Cash Back on Everything You Buy", store: "Rakuten", type: "Online", isGeneralHub: true, featured: true, badgeText: "FREE CASHBACK",
    blurb: "Sign up free and get real cash back — paid out by check or PayPal — on top of any deal on this page. Works at 3,500+ stores including Amazon, Walmart, Target, and Nordstrom Rack. No cost, no catch.",
    link: "https://www.rakuten.com/r/JOHNJO2131?eeid=28187", ctaText: "Join Free & Get Cash Back" },

  // ---- Online: retailer's own live, pre-filtered 50%+ deal page ----
  { name: "Clearance Electronics — 50% Off or More", store: "Best Buy", type: "Online", isHub: true,
    blurb: "Best Buy's own live clearance filter — every item on this page is independently marked 50%+ off list price by Best Buy, updated continuously.",
    link: "https://www.bestbuy.com/site/outlet-refurbished-clearance/clearance-electronics/pcmcat748300666044.c?qp=percentdiscount_facet%3DDiscount%7E50%25+Off+or+More",
    ctaText: "Browse Live Deals" },
  { name: "Clearance & Rollback", store: "Walmart", type: "Online", isGeneralHub: true, badgeText: "CLEARANCE",
    blurb: "Walmart's live clearance + rollback hub — thousands of items, discount varies item to item.",
    link: "https://www.walmart.com/shop/deals/clearance", ctaText: "Browse Clearance" },
  { name: "Clearance Sale", store: "Kohl's", type: "Online", isGeneralHub: true, badgeText: "CLEARANCE",
    blurb: "Kohl's ongoing clearance section — thousands of items, discount varies item to item.",
    link: "https://www.kohls.com/catalog/clearance.jsp?CN=Promotions%3AClearance", ctaText: "Browse Clearance" },
  { name: "Outlet: Clearance, Open-Box & Refurbished", store: "Best Buy", type: "Online", isGeneralHub: true, badgeText: "CLEARANCE",
    blurb: "Best Buy Outlet — clearance, open-box and refurbished items up to 95% off, discount varies item to item.",
    link: "https://www.bestbuy.com/site/outlet-refurbished-clearance/pcmcat142300050026.c?id=pcmcat142300050026", ctaText: "Browse Outlet" },
  { name: "Clearance", store: "Snipes", type: "Online", isGeneralHub: true, badgeText: "CLEARANCE",
    blurb: "Snipes' live clearance section — sneakers, streetwear and accessories, 1,200+ items, discount varies item to item.",
    link: "https://www.snipesusa.com/clearance/", ctaText: "Browse Clearance" },
  { name: "Regal Premiere Cinema Ticket or Snack Choice", store: "Regal", type: "Online", isGeneralHub: true, pctOverride: 40, badgeText: "UP TO 40% OFF", featured: true,
    blurb: "Via dealsFor.me — discounted Regal Premiere movie tickets or snack choices, valid at 436+ theaters nationwide. Redeem at the box office, kiosk, Regal app, or REGmovies.com. Limit 5 per person.",
    link: "https://www.dealsfor.me/Deal/Regal-Cinemas/77666", ctaText: "Get This Deal" },

  // ---- Online: entertainment & attractions ----
  { name: "Ferox Ninja Park Entrance Ticket", store: "dealsFor.me", type: "Online", isGeneralHub: true, pctOverride: 25, badgeText: "~26% OFF",
    blurb: "Via dealsFor.me — discounted entrance ticket to Ferox Ninja Park.",
    link: "https://www.dealsfor.me/Deal/Ferox-Ninja-Park/76928", ctaText: "Get This Deal" },
  { name: "Water Park Deals", store: "dealsFor.me", type: "Online", isGeneralHub: true,
    blurb: "Via dealsFor.me — discounted tickets to water parks nationwide, discount varies by park and deal.",
    link: "https://www.dealsfor.me/Deals/Waterpark/", ctaText: "Browse Deals" },
  { name: "Discount Tuesdays — 50% Off (AMC Stubs)", store: "AMC", type: "Online", isGeneralHub: true, pctOverride: 50, badgeText: "50% OFF TUESDAYS",
    blurb: "Official AMC promo — AMC Stubs members get 50% off the evening ticket price and 50% off small combos, every Tuesday.",
    link: "https://www.amctheatres.com/discount-tuesdays", ctaText: "See Details" },
  { name: "Discount Matinees — 20% Off Before 4pm", store: "AMC", type: "Online", isGeneralHub: true, pctOverride: 20, badgeText: "20% OFF MATINEES",
    blurb: "Official AMC promo — tickets are 20% off the evening price before 4pm, every day, at any AMC theatre nationwide.",
    link: "https://www.amctheatres.com/discount-matinees", ctaText: "See Details" },
  { name: "Theme Park & Movie Tickets", store: "FunEx", type: "Online", isGeneralHub: true,
    blurb: "FunEx — authorized discount tickets for Six Flags, Universal, LEGOLAND, SeaWorld and more (started as an employee-discount program with Knott's Berry Farm). Discount varies by park.",
    link: "https://www.funex.com/all-attractions", ctaText: "Browse Tickets" },

  // ---- Online: eBay Refurbished, real specific items + prices, 2yr warranty ----
  { name: "Apple AirPods 4 with Active Noise Cancellation (Refurb.)", store: "eBay", type: "Online", origPrice: 180.00, salePrice: 89.00,
    link: "https://www.ebay.com/deals/featured/up-to-60-off-ebay-refurbished-cell-phones-and-accessories?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=5339164581&customid=&toolid=10001&mkevt=1" },
  { name: "Samsung Galaxy Watch 7 40mm (Refurbished)", store: "eBay", type: "Online", origPrice: 350.00, salePrice: 135.00,
    link: "https://www.ebay.com/deals/featured/up-to-60-off-ebay-refurbished-cell-phones-and-accessories?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=5339164581&customid=&toolid=10001&mkevt=1" },
  { name: "Belkin MagSafe 3-in-1 Wireless Charger Stand (Refurb.)", store: "eBay", type: "Online", origPrice: 150.00, salePrice: 60.00,
    link: "https://www.ebay.com/deals/featured/up-to-60-off-ebay-refurbished-cell-phones-and-accessories?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=5339164581&customid=&toolid=10001&mkevt=1" },

  // ---- Online: Amazon, tagged with Amazon Associates ID 5starlinks0c-20 ----
  { name: "Bose QuietComfort Headphones", store: "Amazon", type: "Online", origPrice: 359.00, salePrice: 179.00,
    link: "https://www.amazon.com/deals?tag=5starlinks0c-20" },
  { name: "Shark Robot Vacuum", store: "Amazon", type: "Online", origPrice: 599.00, salePrice: 270.00,
    link: "https://www.amazon.com/deals?tag=5starlinks0c-20" },
  { name: "Today's Deals — Lightning Deals", store: "Amazon", type: "Online", isGeneralHub: true,
    blurb: "Amazon's own live deals hub — Lightning Deals regularly run 50-70% off (sometimes up to 90%), but they're time & quantity limited so check often.",
    link: "https://www.amazon.com/deals?tag=5starlinks0c-20", ctaText: "Browse Today's Deals" },
  { name: "Amazon Outlet", store: "Amazon", type: "Online", isGeneralHub: true, badgeText: "CLEARANCE",
    blurb: "Amazon's clearance/overstock outlet — brand-new, unopened items marked down up to 80%, discount varies item to item.",
    link: "https://www.amazon.com/Outlet?tag=5starlinks0c-20", ctaText: "Browse Outlet" },

  // ---- Online: Nordstrom Rack "Clear the Rack" — extra 25% off clearance, through 7/12 ----
  { name: "Clear the Rack — Extra 25% Off Clearance", store: "Nordstrom Rack", type: "Online", isGeneralHub: true, pctOverride: 70, badgeText: "UP TO 75% OFF", expires: "7/12/2026",
    blurb: "Nordstrom Rack's Clear the Rack event — extra 25% off red-tag clearance on top of everyday markdowns, for a total up to 75% off top brands. Online prices reflect it automatically.",
    link: "https://www.nordstromrack.com/promo/clear-the-rack", ctaText: "Shop the Rack" },

  // ---- Online: groceries, pets, travel & fitness ----
  { name: "First Box Discount (New Customers)", store: "HelloFresh", type: "Online", isGeneralHub: true, pctOverride: 65, badgeText: "UP TO 70% OFF FIRST BOX",
    blurb: "HelloFresh's own current codes page — new customers can get up to 70% off their first box plus discounted boxes 2-5. Exact code/amount changes, always check what's live.",
    link: "https://www.hellofresh.com/eat/coupon-codes-and-promotions", ctaText: "See Current Codes" },
  { name: "40% Off First Autoship Order", store: "Chewy", type: "Online", isGeneralHub: true, pctOverride: 40, badgeText: "40% OFF FIRST AUTOSHIP",
    blurb: "Chewy's own deals page — new customers get 40% off their first Autoship order (repeat deliveries), plus free shipping on the first order regardless of size.",
    link: "https://www.chewy.com/deals/todays-deals-2723", ctaText: "See Current Deals" },
  { name: "Express Deals — Mystery Hotel Discounts", store: "Priceline", type: "Online", isGeneralHub: true, pctOverride: 10, badgeText: "10-12% OFF HOTELS",
    blurb: "Priceline Express Deals — 10% off on the website or 12% off in the app, on hotels exclusive to this program. You don't know the exact hotel until booking is complete.",
    link: "https://www.expresshoteldeals.com/", ctaText: "See Express Deals" },
  { name: "Membership Deals", store: "Planet Fitness", type: "Online", isGeneralHub: true,
    blurb: "Planet Fitness's own deals page — join promos are seasonal (biggest cuts around New Year's, summer, and Black Friday), so check what's currently running.",
    link: "https://www.planetfitness.com/deals", ctaText: "See Current Deals" },

  // ---- Online: Target, real direct product links & current prices ----
  { name: "Dealworthy Outdoor Portable Camp Chair", store: "Target", type: "Online", origPrice: 10.00, salePrice: 7.00,
    link: "https://www.target.com/p/adult-outdoor-portable-camp-chair-dealworthy-8482-mineral-blue/-/A-92087240" },
  { name: "Stanley 40oz H2.0 FlowState Quencher Tumbler", store: "Target", type: "Online", origPrice: 50.00, salePrice: 42.50,
    link: "https://www.target.com/p/stanley-40-oz-stainless-steel-h2-0-flowstate-quencher-tumbler/-/A-1011289211" },

  // ---- In-Store: Target clearance, spotted & reported by deal-tracking sites ----
  { name: "Threshold Outdoor Firepit", store: "Target", type: "In-Store", origPrice: 54.99, salePrice: 27.49,
    address: "Availability varies by store — call ahead", source: "Hip2Save", sourceUrl: "https://hip2save.com/deals/target-clearance/" },
  { name: "Char-Broil 4-Piece Grill Cookware Set", store: "Target", type: "In-Store", origPrice: 39.99, salePrice: 12.00,
    address: "Availability varies by store — call ahead", source: "Hip2Save", sourceUrl: "https://hip2save.com/deals/target-clearance/" },
  { name: "Weber 3-Piece Precision Grill Tool Set", store: "Target", type: "In-Store", origPrice: 39.99, salePrice: 12.00,
    address: "Availability varies by store — call ahead", source: "Hip2Save", sourceUrl: "https://hip2save.com/deals/target-clearance/" },
  { name: "Outdoor Throw Pillow (assorted styles)", store: "Target", type: "In-Store", origPrice: 15.00, salePrice: 4.50,
    address: "Availability varies by store — call ahead", source: "Hip2Save", sourceUrl: "https://hip2save.com/deals/target-clearance/" },
  { name: "Shark Stratos Lift-Away Vacuum", store: "Target", type: "In-Store", origPrice: 529.99, salePrice: 158.99,
    address: "Availability varies by store — call ahead", source: "All Things Target", sourceUrl: "https://allthingstarget.com/target-june-clearance-2026/" },

  // ---- In-Store: Home Depot penny list, community-reported 7/3/2026 ----
  { name: "LIFX Low Voltage Landscape Spotlight", store: "Home Depot", type: "In-Store", salePrice: 0.01, origPriceUnknown: true, sku: "1010333772",
    address: "Reported 7/3/2026 — availability varies by store", source: "Penny Pinchin' Mom", sourceUrl: "https://pennypinchinmom.com/home-depot-penny-list/" },
  { name: "Delta Neo-Angle Pivot Shower Enclosure", store: "Home Depot", type: "In-Store", salePrice: 0.01, origPriceUnknown: true, sku: "1002780539",
    address: "Reported 7/3/2026 — availability varies by store", source: "Penny Pinchin' Mom", sourceUrl: "https://pennypinchinmom.com/home-depot-penny-list/" },
  { name: "SHOCKWAVE Impact Duty Screw Driver Bit Set", store: "Home Depot", type: "In-Store", salePrice: 0.01, origPriceUnknown: true, sku: "1013064797",
    address: "Reported 7/3/2026 — availability varies by store", source: "Penny Pinchin' Mom", sourceUrl: "https://pennypinchinmom.com/home-depot-penny-list/" },
  { name: "40-Watt ST19 Clear Glass Vintage Edison LED Bulb", store: "Home Depot", type: "In-Store", salePrice: 0.01, origPriceUnknown: true, sku: "1006211634",
    address: "Reported 7/3/2026 — availability varies by store", source: "Penny Pinchin' Mom", sourceUrl: "https://pennypinchinmom.com/home-depot-penny-list/" },
  { name: "40-Watt ST19 Amber Glass Vintage Edison LED Bulb", store: "Home Depot", type: "In-Store", salePrice: 0.01, origPriceUnknown: true, sku: "1005432053",
    address: "Reported 7/3/2026 — availability varies by store", source: "Penny Pinchin' Mom", sourceUrl: "https://pennypinchinmom.com/home-depot-penny-list/" },
  { name: "Alderston Matte Black Table Lamp", store: "Home Depot", type: "In-Store", salePrice: 0.01, origPriceUnknown: true, sku: "1008498990",
    address: "Reported 7/3/2026 — availability varies by store", source: "Penny Pinchin' Mom", sourceUrl: "https://pennypinchinmom.com/home-depot-penny-list/" },
];

if (typeof module !== 'undefined') module.exports = { deals, withAffiliate };
