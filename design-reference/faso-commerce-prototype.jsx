// Boutik+ × Ma Boutique × Séra — prototype mobile interactif (données simulées, Ouagadougou)
// Un seul état partagé alimente les 4 surfaces : une action côté Séra met à jour le vendeur et le client en direct.
import React, { useState, useReducer, useEffect, useRef, useMemo, createContext, useContext } from "react";

/* ---------------------------------- helpers ---------------------------------- */
const F = (n) => (n ?? 0).toLocaleString("fr-FR") + " F";
const calc = (B, C, M) => {
  const fee = Math.round(B * 0.05);
  const gross = C + M;
  const rFee = Math.round(gross * 0.2);
  return { fee, sellerNet: B - C - fee, gross, rFee, rNet: gross - rFee, subtotal: B + M };
};
let SEQ = 2421;
const now = () => new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

/* ---------------------------------- design ---------------------------------- */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Instrument+Sans:ital,wght@0,400;0,500;0,600;0,700&display=swap');
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
html,body,#root{height:100%}
body{font-family:'Instrument Sans',system-ui,sans-serif;background:#171310}
.shell{min-height:100dvh;display:flex;justify-content:center;background:radial-gradient(120% 90% at 50% 0%,#2A241D 0%,#171310 70%)}
.phone{width:min(100vw,430px);height:100dvh;display:flex;flex-direction:column;position:relative;overflow:hidden;background:var(--bg);color:var(--txt)}
.appLight{--bg:#F3EDE1;--card:#FFFDF6;--txt:#221C15;--sub:#6F6557;--line:#E6DCC8;--onpri:#FFFDF6;--dim:#EFE7D6}
.appB{--pri:#0B5B47;--deep:#07392D;--soft:#E2EEE7;--b1:#0B5B47;--b2:#F3EDE1;--b3:#C89A3F}
.appM{--pri:#A31D4E;--deep:#701134;--soft:#F8E3EB;--b1:#A31D4E;--b2:#F3EDE1;--b3:#E0A11B}
.appY{--pri:#8A4F1D;--deep:#5F3512;--soft:#F3E6D3;--b1:#8A4F1D;--b2:#F3EDE1;--b3:#A31D4E}
.appS{--bg:#14181F;--card:#1D232D;--txt:#F3EDE0;--sub:#9AA2B0;--line:#2A313D;--pri:#F5B301;--deep:#C79102;--soft:#2A2410;--onpri:#191100;--dim:#232A35;--b1:#F5B301;--b2:#14181F;--b3:#6B7382}
.appO{--pri:#3E4B8C;--deep:#2A3363;--soft:#E7EAF6;--b1:#3E4B8C;--b2:#F3EDE1;--b3:#8A4F1D}
.band{height:8px;flex:none;background:repeating-linear-gradient(90deg,var(--b1) 0 16px,var(--b2) 16px 22px,var(--b3) 22px 30px,var(--b2) 30px 36px)}
.top{display:flex;align-items:center;gap:10px;padding:12px 16px 10px;flex:none}
.wm{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:20px;letter-spacing:-.02em}
.h1{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:26px;line-height:1.12;letter-spacing:-.02em}
.h2{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:19px;letter-spacing:-.01em}
.h3{font-weight:700;font-size:15.5px}
.cap{font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--sub)}
.sub{font-size:13px;color:var(--sub);line-height:1.45}
.p{font-size:14px;line-height:1.5}
.num{font-variant-numeric:tabular-nums}
.scroll{flex:1;overflow-y:auto;padding:4px 16px calc(96px + env(safe-area-inset-bottom));scrollbar-width:none}
.scroll::-webkit-scrollbar{display:none}
.card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:14px;box-shadow:0 1px 2px rgba(20,15,8,.05)}
.mt8{margin-top:8px}.mt12{margin-top:12px}.mt16{margin-top:16px}.mt20{margin-top:20px}.mb6{margin-bottom:6px}
.row{display:flex;align-items:center;justify-content:space-between;gap:10px}
.col{display:flex;flex-direction:column;gap:4px}
.btn{display:flex;align-items:center;justify-content:center;gap:8px;min-height:52px;padding:0 18px;border-radius:15px;border:1px solid transparent;font:inherit;font-weight:700;font-size:15px;width:100%;cursor:pointer;transition:transform .08s ease,opacity .2s}
.btn:active{transform:scale(.98)}
.pri{background:var(--pri);color:var(--onpri,#fff)}
.sec{background:var(--soft);color:var(--deep)}
.ghost{background:transparent;border-color:var(--line);color:var(--txt)}
.danger{background:#B3261E;color:#fff}
.btn:disabled{opacity:.45;cursor:default;transform:none}
.pill{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:700;padding:4px 9px;border-radius:99px}
.pOk{background:#DDEEE1;color:#14603A}.pWarn{background:#F6E7C8;color:#7A5104}.pBad{background:#F7DEDC;color:#8C1D18}.pInfo{background:var(--soft);color:var(--deep)}.pMut{background:var(--dim);color:var(--sub)}
.appS .pOk{background:#173626;color:#7ED9A2}.appS .pWarn{background:#3A2E0D;color:#F0C55C}.appS .pBad{background:#42201E;color:#F1958F}.appS .pMut{background:#242B36;color:#9AA2B0}
.chip{display:inline-flex;align-items:center;gap:6px;padding:9px 13px;border-radius:99px;border:1.5px solid var(--line);font-size:13.5px;font-weight:600;background:var(--card);color:var(--txt);cursor:pointer}
.chipOn{border-color:var(--pri);background:var(--soft);color:var(--deep)}
.appS .chipOn{color:var(--pri)}
.chips{display:flex;gap:8px;flex-wrap:wrap}
.chipsX{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;scrollbar-width:none}
.chipsX::-webkit-scrollbar{display:none}
.tabbar{position:absolute;left:0;right:0;bottom:0;display:flex;background:var(--card);border-top:1px solid var(--line);padding:6px 6px calc(8px + env(safe-area-inset-bottom))}
.tab{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding:7px 2px;border-radius:12px;border:none;background:none;font:inherit;font-size:10.5px;font-weight:700;color:var(--sub);cursor:pointer}
.tabOn{color:var(--pri)}
.appB .tabOn,.appM .tabOn,.appO .tabOn{color:var(--deep);background:var(--soft)}
.tIco{font-size:19px;line-height:1}
.sheetWrap{position:absolute;inset:0;background:rgba(15,11,7,.5);display:flex;align-items:flex-end;z-index:40;animation:fade .18s ease}
.sheet{background:var(--card);width:100%;border-radius:24px 24px 0 0;padding:10px 18px calc(20px + env(safe-area-inset-bottom));max-height:88%;overflow-y:auto;animation:up .22s ease}
.grab{width:42px;height:5px;border-radius:99px;background:var(--line);margin:4px auto 12px}
@keyframes up{from{transform:translateY(28px);opacity:.4}to{transform:none;opacity:1}}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes shake{20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
.shake{animation:shake .4s ease}
.blink{animation:pulse 1.1s ease infinite}
.toastWrap{position:absolute;top:14px;left:0;right:0;display:flex;flex-direction:column;align-items:center;gap:8px;z-index:60;pointer-events:none}
.toast{background:#221C15;color:#F6F0E4;font-size:13.5px;font-weight:600;padding:11px 16px;border-radius:14px;max-width:86%;box-shadow:0 8px 24px rgba(0,0,0,.3);animation:up .2s ease}
.tl{display:flex;flex-direction:column}
.tlRow{display:flex;gap:12px}
.tlL{display:flex;flex-direction:column;align-items:center;width:18px}
.dot{width:14px;height:14px;border-radius:99px;border:2.5px solid var(--line);background:var(--card);flex:none;margin-top:2px}
.dotOn{border-color:var(--pri);background:var(--pri)}
.dotCur{border-color:var(--pri);background:var(--card)}
.tlBar{width:2.5px;flex:1;background:var(--line);min-height:16px}
.tlBarOn{background:var(--pri)}
.tlTxt{padding-bottom:16px;flex:1}
.field{display:flex;flex-direction:column;gap:6px;margin-top:12px}
.field input,.field textarea{font:inherit;font-size:16px;padding:13px 14px;border-radius:13px;border:1.5px solid var(--line);background:var(--card);color:var(--txt);width:100%}
.field input:focus,.field textarea:focus{outline:none;border-color:var(--pri)}
.ml{display:flex;justify-content:space-between;font-size:14px;padding:7px 0}
.ml b{font-variant-numeric:tabular-nums}
.mlTot{border-top:1.5px dashed var(--line);margin-top:4px;padding-top:11px;font-size:15.5px;font-weight:800}
.seg{display:flex;background:var(--dim);border-radius:13px;padding:4px;gap:4px}
.segB{flex:1;border:none;background:none;font:inherit;font-weight:700;font-size:13px;padding:9px 6px;border-radius:10px;color:var(--sub);cursor:pointer}
.segOn{background:var(--card);color:var(--txt);box-shadow:0 1px 3px rgba(0,0,0,.12)}
.art{border-radius:16px;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center}
.art::after{content:'';position:absolute;inset:0;background:repeating-linear-gradient(135deg,rgba(255,255,255,.07) 0 10px,transparent 10px 26px)}
.artE{font-size:52px;filter:drop-shadow(0 4px 8px rgba(0,0,0,.22))}
.gauge{height:10px;border-radius:99px;background:var(--dim);overflow:hidden}
.gaugeF{height:100%;border-radius:99px;background:var(--pri)}
.kbd{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px}
.key{height:60px;border-radius:15px;border:1.5px solid var(--line);background:var(--card);color:var(--txt);font:inherit;font-size:22px;font-weight:700;cursor:pointer}
.key:active{background:var(--dim)}
.codeBox{display:flex;gap:10px;justify-content:center;margin-top:8px}
.codeC{width:52px;height:60px;border-radius:14px;border:2px solid var(--line);display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:800;background:var(--card)}
input[type=range]{-webkit-appearance:none;width:100%;height:34px;background:transparent}
input[type=range]::-webkit-slider-runnable-track{height:8px;border-radius:99px;background:var(--dim)}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:28px;height:28px;border-radius:99px;background:var(--pri);border:4px solid var(--card);box-shadow:0 2px 6px rgba(0,0,0,.25);margin-top:-10px}
.tile{border:1px solid var(--line);border-radius:20px;overflow:hidden;background:var(--card);text-align:left;cursor:pointer;padding:0;font:inherit;color:inherit;width:100%}
.hero{position:relative;border-radius:22px;overflow:hidden}
.stick{position:absolute;left:0;right:0;bottom:0;padding:12px 16px calc(14px + env(safe-area-inset-bottom));background:linear-gradient(transparent,var(--bg) 34%);z-index:10}
.list>*+*{margin-top:10px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.check{display:flex;align-items:center;gap:11px;padding:12px 13px;border:1.5px solid var(--line);border-radius:14px;background:var(--card);cursor:pointer}
.ckB{width:26px;height:26px;border-radius:9px;border:2px solid var(--line);display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;flex:none}
.ckOk{background:#177245;border-color:#177245;color:#fff}
.ckNo{background:#B3261E;border-color:#B3261E;color:#fff}
.note{display:flex;gap:9px;padding:11px 13px;border-radius:14px;font-size:12.5px;line-height:1.45;background:var(--soft);color:var(--deep)}
.appS .note{color:#F0DFAF}
.warnNote{background:#F6E7C8;color:#6B4703}
.appS .warnNote{background:#3A2E0D;color:#F0C55C}
.badNote{background:#F7DEDC;color:#7E1A15}
.appS .badNote{background:#42201E;color:#F1958F}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;

/* ---------------------------------- données ---------------------------------- */
const SELLERS = {
  wendkuni: { id: "wendkuni", name: "Boutique Wendkuni", owner: "Rasmané Zongo", zone: "Marché Rood Woko", landmark: "Allée 4, face au grand portail est", tier: "verified", stats: "12 livraisons · 0 faute", phone: "70 12 34 56" },
  zalissa: { id: "zalissa", name: "Zalissa Créations", owner: "Zalissa Ouédraogo", zone: "Dassasgho", landmark: "Près de l’école B, rue du forage", tier: "provisional", stats: "2 livraisons · 0 faute", phone: "76 88 21 03" },
  rasmata: { id: "rasmata", name: "Maison Rasmata", owner: "Rasmata Kaboré", zone: "Zone du Bois", landmark: "Face à la station Shell", tier: "trusted", stats: "84 livraisons · 1 avertissement", phone: "78 45 09 12" },
  awa: { id: "awa", name: "Maison Awa", owner: "Awa Diallo — Montréal 🇨🇦", zone: "Hub Boutik+ — Gounghin", landmark: "Zone consignation · QC fait à l’intake", tier: "diaspora", stats: "27 livraisons · ⭐ 4,9 · exécution 100 % hub", phone: "—" },
  packlab: { id: "packlab", name: "Shop+ PackLab", owner: "Stock plateforme (plafond de trésorerie)", zone: "Hub Boutik+ — atelier de kitting", landmark: "Scellé au kitting après QC", tier: "platform", stats: "Paniers conçus · financement livraison ✓", phone: "—" },
};
const TIER_FR = { provisional: "Provisoire", verified: "Vérifié", trusted: "De confiance", diaspora: "Enseigne diaspora", platform: "PackLab" };
const RESELLER = { id: "aicha", name: "Aïcha Sawadogo", store: "Chez Aïcha Mode", zone: "Gounghin", month: 34500 };

const PRODUCTS = {
  p1: { id: "p1", name: "Robe brodée bogolan", cat: "Mode femme", seller: "wendkuni", B: 10000, C: 1000, stock: 7, sizes: ["S", "M", "L"], e: "👗", g: "linear-gradient(140deg,#B65C2E,#7A3014)" },
  p2: { id: "p2", name: "Pagne wax 6 yards", cat: "Tissus", seller: "rasmata", B: 18000, C: 1800, stock: 11, sizes: null, e: "🧵", g: "linear-gradient(140deg,#146152,#0A3A31)" },
  p3: { id: "p3", name: "Sac cuir artisanal", cat: "Sacs", seller: "wendkuni", B: 15000, C: 1500, stock: 4, sizes: null, e: "👜", g: "linear-gradient(140deg,#8A4F1D,#5C3210)" },
  p4: { id: "p4", name: "Sandales cuir homme", cat: "Chaussures", seller: "rasmata", B: 8000, C: 800, stock: 6, sizes: ["41", "42", "43", "44"], e: "🩴", g: "linear-gradient(140deg,#6E4A2B,#3F2814)" },
  p5: { id: "p5", name: "Coffret karité pur", cat: "Beauté scellée", seller: "zalissa", B: 6000, C: 600, stock: 9, sizes: null, e: "🧴", g: "linear-gradient(140deg,#B08A2E,#7A5C14)", sealed: true },
  p6: { id: "p6", name: "Boubou brodé homme", cat: "Mode homme", seller: "rasmata", B: 20000, C: 2000, stock: 3, sizes: ["M", "L", "XL"], e: "🥻", g: "linear-gradient(140deg,#28527A,#152F49)" },
  p7: { id: "p7", name: "Foulard Faso Dan Fani", cat: "Accessoires", seller: "wendkuni", B: 5500, C: 550, stock: 14, sizes: null, e: "🧣", g: "linear-gradient(140deg,#A31D4E,#5E0F2C)" },
  p8: { id: "p8", name: "Chemise Faso Dan Fani", cat: "Mode homme", seller: "wendkuni", B: 12000, C: 1200, stock: 5, sizes: ["M", "L"], e: "👔", g: "linear-gradient(140deg,#3E4B8C,#232B54)" },
  p9: { id: "p9", name: "Panier tressé déco", cat: "Maison", seller: "zalissa", B: 7000, C: 700, stock: 8, sizes: null, e: "🧺", g: "linear-gradient(140deg,#7A6A34,#4C4120)" },
  p10: { id: "p10", name: "Ensemble enfant wax", cat: "Enfant", seller: "rasmata", B: 9000, C: 900, stock: 6, sizes: ["4a", "6a", "8a"], e: "🧒", g: "linear-gradient(140deg,#B3541E,#6E2F0D)" },
  d1: { id: "d1", name: "Sac Perle (Montréal)", cat: "Sacs", seller: "awa", B: 12500, C: 1250, stock: 9, sizes: null, e: "👝", g: "linear-gradient(140deg,#5E3A8C,#332050)", hub: true },
  k1: { id: "k1", name: "Pack Cuisine Départ", cat: "Maison", seller: "packlab", B: 12500, C: 1250, stock: 28, sizes: null, e: "🍲", g: "linear-gradient(140deg,#8C5A2E,#4E3016)", hub: true, pack: true },
};
const MARKUPS = { p1: 1500, p2: 2500, p3: 2000, p4: 1200, p5: 900, p7: 800, p8: 1800, d1: 1900, k1: 1500 };

const mkOrder = (o) => ({
  markup: 1500, fee: 1000, deliveryType: "standard", variant: null, history: [], flags: {}, campaignId: null, camp: 0,
  buyer: { name: "Awa Kaboré", zone: "Ouaga 2000", landmark: "Près de la Pharmacie du Rond-point", phone: "70 55 20 41" }, ...o,
});
const ORDERS0 = {
  o1: mkOrder({ id: "o1", code: "CMD-2417", pid: "p1", mode: "B", variant: "M", status: "FUNDED", dropCode: "4729", challenge: "WK-472",
    history: [{ ts: "09:12", l: "Frais de livraison payés : 1 000 F, gardés en sécurité chez le partenaire" }, { ts: "09:12", l: "Stock réservé · vendeur notifié" }] }),
  o2: mkOrder({ id: "o2", code: "CMD-2409", pid: "p3", mode: "A", status: "PAID", dropCode: "8890", deliveryType: "free", fee: 0, markup: 2000,
    history: [{ ts: "hier", l: "Payé en entier — en sécurité" }, { ts: "hier", l: "Livraison offerte (campagne — zones proches)" }, { ts: "hier", l: "Livré — code client confirmé" }, { ts: "hier", l: "Versements effectués" }] }),
  o3: mkOrder({ id: "o3", code: "CMD-2411", pid: "p8", mode: "A", status: "READY_FAILED", variant: "L", dropCode: "5512", challenge: "WK-981",
    buyer: { name: "Salif Nikiéma", zone: "Tampouy", landmark: "Derrière la mosquée centrale", phone: "76 02 88 14" },
    history: [{ ts: "08:40", l: "Payé en entier — en sécurité" }, { ts: "08:58", l: "Photo de préparation refusée : trop sombre" }] }),
  o5: mkOrder({ id: "o5", code: "CMD-2398", pid: "p7", mode: "B", status: "BUYER_REFUSED",
    buyer: { name: "Moussa Traoré", zone: "Cissin", landmark: "Face au maquis Le Palmier", phone: "71 33 45 09" },
    history: [{ ts: "lun.", l: "Refusé à la porte : la cliente a changé d’avis" }, { ts: "lun.", l: "Frais de livraison gardés — retour scellé RET-1104" }] }),
  o7: mkOrder({ id: "o7", code: "CMD-2413", pid: "p2", mode: "A", status: "TRANSIT", deliveryType: "express", fee: 1500, markup: 2500, dropCode: "8156", sealId: "SÉR-8836",
    buyer: { name: "Mme Zongo Habibou", zone: "Cissin", landmark: "À côté de la boulangerie Wend Panga", phone: "70 90 11 32" },
    history: [{ ts: "10:05", l: "Payé en entier — en sécurité" }, { ts: "10:31", l: "Vérifié à l’enlèvement · scellé SÉR-8836" }, { ts: "10:32", l: "Pris en charge par Issa (Séra)" }] }),
};
const CLAIMS0 = [
  { id: "c1", code: "CMD-2402", fault: "seller", label: "Mauvaise pointure à l’enlèvement (42 ≠ 43)", amount: 1400, state: "Payée" },
  { id: "c2", code: "CMD-2371", fault: "sera", label: "Colis endommagé en route (responsabilité Séra)", amount: 9000, state: "Dossier séparé — garde" },
  { id: "c3", code: "CMD-2398", fault: "buyer", label: "Refus de la cliente — frais gardés", amount: 0, state: "Clos" },
];
const BG0 = [{ id: "BG-0031", code: "CMD-2415", ref: "INC-112", label: "Confirmation de l’opérateur en attente — 12 min", state: "Résolu en 4 min", by: "Mariam (régulation)" }];
const TRUST0 = [
  { ts: "lun.", l: "Maison Rasmata : avertissement (variante incorrecte à l’enlèvement)" },
  { ts: "sam.", l: "Boutique Wendkuni : passée au niveau Vérifié (12 livraisons propres)" },
];

const CERCLE0 = {
  members: 214, plus: 24, joined: false, deliv: 73, note: "4,8",
  reviews: [
    { n: "Awa K.", pid: "p1", stars: 5, t: "Conforme à la photo, scellée et livrée à l’heure.", d: "il y a 2 j" },
    { n: "Salif N.", pid: "p8", stars: 5, t: "Très belle qualité, vérifiée devant moi avant de payer.", d: "il y a 5 j" },
    { n: "Habibou Z.", pid: "p2", stars: 4, t: "Livraison rapide, tissu superbe.", d: "sem. dernière" },
  ],
  list: [
    { n: "Awa Kaboré", z: "Ouaga 2000", seg: "Fidèle", i: "Mode femme" },
    { n: "Fatou Ilboudo", z: "Tampouy", seg: "Fidèle", i: "Sacs" },
    { n: "Mariam Ouédraogo", z: "Tampouy", seg: "Intéressée", i: "Beauté" },
    { n: "Salif Nikiéma", z: "Tampouy", seg: "1ʳᵉ commande", i: "Mode homme" },
    { n: "Habibou Zongo", z: "Cissin", seg: "Fidèle", i: "Tissus" },
    { n: "Rihanata Sana", z: "Gounghin", seg: "Nouvelle", i: "Nouveautés" },
    { n: "Adja Compaoré", z: "Tampouy", seg: "À relancer", i: "Beauté" },
    { n: "K. Traoré", z: "Dassasgho", seg: "Nouvelle", i: "Maison" },
  ],
  campaign: { id: "CAMP-014", recipe: "Quartier", pid: "p1", zone: "Tampouy", window: "Samedi 10 h – 12 h",
    K: 600, customerShare: 400, maxOrders: 10, budget: 6000, spent: 4200, reserved: 0, orders: 7, state: "ACTIVE", expiry: "sam. 4 juil." },
  funding: { available: 18000 },
};
const campLeft = (c) => c ? Math.max(0, Math.min(c.maxOrders - c.orders, c.K > 0 ? Math.floor((c.budget - c.spent - c.reserved) / c.K) : c.maxOrders - c.orders)) : 0;

const DIA0 = {
  avail: 41300, pendingSeed: 11875, anchor: null, priceEvent: null, familyLink: false,
  proposals: [{ id: "pr1", pid: "d1", label: "Sac Perle vieillit — 48 jours en stock (unité #12)", done: false, result: null }],
};
const ownerNet = (p) => p.B - p.C - Math.round(p.B * 0.05) - 300; // B − C − 5%B − 300 F gestion

const init = () => ({ orders: ORDERS0, products: PRODUCTS, claims: CLAIMS0, bg: BG0, trust: TRUST0, buyerIds: ["o1", "o2"], fund: 812400, cercle: CERCLE0, dia: DIA0 });

function reducer(S, a) {
  switch (a.t) {
    case "ORD": {
      const o = S.orders[a.id]; if (!o) return S;
      const history = a.h ? [...o.history, { ts: now(), l: a.h }] : o.history;
      let cercle = S.cercle;
      const st = a.p && a.p.status;
      if (o.camp && cercle.campaign && o.campaignId === cercle.campaign.id && st && st !== o.status) {
        const c = cercle.campaign;
        if (st === "PAID") cercle = { ...cercle, campaign: { ...c, reserved: Math.max(0, c.reserved - o.camp), spent: c.spent + o.camp } };
        else if (["PICKUP_REFUSED", "SELLER_RETURN"].includes(st)) cercle = { ...cercle, campaign: { ...c, reserved: Math.max(0, c.reserved - o.camp), orders: Math.max(0, c.orders - 1) } };
        else if (["RETURNING", "BUYER_REFUSED"].includes(st)) cercle = { ...cercle, campaign: { ...c, reserved: Math.max(0, c.reserved - o.camp), spent: c.spent + o.camp } };
      }
      return { ...S, cercle, orders: { ...S.orders, [a.id]: { ...o, ...a.p, history } } };
    }
    case "NEW": {
      let cercle = S.cercle;
      if (a.o.camp && cercle.campaign && a.o.campaignId === cercle.campaign.id) {
        const c = cercle.campaign;
        cercle = { ...cercle, campaign: { ...c, reserved: c.reserved + a.o.camp, orders: c.orders + 1 } };
      }
      return { ...S, cercle, orders: { ...S.orders, [a.o.id]: a.o }, buyerIds: [a.o.id, ...S.buyerIds] };
    }
    case "PUB": return { ...S, products: { ...S.products, [a.p.id]: a.p } };
    case "STOCK": { const p = S.products[a.pid]; return { ...S, products: { ...S.products, [a.pid]: { ...p, stock: Math.max(0, p.stock + a.d) } } }; }
    case "CLAIM": return { ...S, claims: [a.c, ...S.claims], fund: S.fund - (a.c.amount || 0) };
    case "TRUST": return { ...S, trust: [{ ts: now(), l: a.l }, ...S.trust] };
    case "BG": return { ...S, bg: [a.e, ...S.bg] };
    case "CER": return { ...S, cercle: { ...S.cercle, ...a.p } };
    case "CAMP": return { ...S, cercle: { ...S.cercle, campaign: { ...S.cercle.campaign, ...a.p } } };
    case "CAMPNEW": return { ...S, cercle: { ...S.cercle, campaign: a.c } };
    case "REVIEW": return { ...S, cercle: { ...S.cercle, reviews: [a.r, ...S.cercle.reviews] } };
    case "PROD": return { ...S, products: { ...S.products, [a.pid]: { ...S.products[a.pid], ...a.p } } };
    case "DIA": return { ...S, dia: { ...S.dia, ...a.p } };
    default: return S;
  }
}

const STATUS_FR = {
  FUNDED: ["À préparer", "pWarn"], READY: ["Prêt — enlèvement", "pInfo"], TRANSIT: ["En route", "pInfo"], ARRIVED: ["Livreur arrivé", "pInfo"],
  INSPECT: ["Inspection", "pInfo"], AWAIT_PAY: ["Paiement à la porte", "pWarn"], PAY_PENDING: ["Confirmation en cours", "pWarn"],
  PAY_OK: ["Paiement confirmé", "pOk"], HANDOFF: ["Remise — code de la cliente", "pInfo"], DELIVERED: ["Livré", "pOk"], PAID: ["Versé", "pOk"],
  READY_FAILED: ["Photo à reprendre", "pBad"], PICKUP_REFUSED: ["Refusé à l’enlèvement", "pBad"], BUYER_REFUSED: ["Refusé par le client", "pBad"],
  SELLER_RETURN: ["Retour — défaut", "pBad"], RETURNING: ["Retour en cours", "pWarn"], RETURNED: ["Retourné", "pMut"],
};
const FLOW = (mode) => mode === "B"
  ? ["FUNDED", "READY", "TRANSIT", "ARRIVED", "INSPECT", "AWAIT_PAY", "PAY_OK", "HANDOFF", "DELIVERED", "PAID"]
  : ["FUNDED", "READY", "TRANSIT", "ARRIVED", "INSPECT", "HANDOFF", "DELIVERED", "PAID"];
const FLOW_FR = (o) => ({
  FUNDED: o.mode === "B" ? "Frais de livraison payés — en sécurité" : "Paiement complet — en sécurité",
  READY: "Produit prêt chez le vendeur", TRANSIT: "Vérifié, scellé, pris en charge par Séra", ARRIVED: "Livreur arrivé",
  INSPECT: "Vous inspectez avant la remise", AWAIT_PAY: "Le produit se paie à la porte", PAY_OK: "Paiement confirmé par le partenaire",
  HANDOFF: "Remise autorisée — code de la cliente", DELIVERED: "Livré ✓", PAID: "Vendeur et revendeuse payés",
});
const stageIdx = (o) => {
  const f = FLOW(o.mode);
  const map = { PAY_PENDING: "AWAIT_PAY" };
  return f.indexOf(map[o.status] || o.status);
};

/* ---------------------------------- primitives ---------------------------------- */
const Ctx = createContext(null);
const useApp = () => useContext(Ctx);

const Band = () => <div className="band" />;
const Pill = ({ k, children }) => <span className={"pill " + (k || "pMut")}>{children}</span>;
const StatusPill = ({ s }) => { const [l, k] = STATUS_FR[s] || [s, "pMut"]; return <Pill k={k}>{l}</Pill>; };

function Top({ title, sub, back, right, big }) {
  const A = useApp();
  return (
    <div className="top">
      {back && <button className="chip" style={{ padding: "8px 12px" }} onClick={back} aria-label="Retour">←</button>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className={big ? "h1" : "wm"} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {right}
      <button className="chip" style={{ padding: "8px 12px" }} onClick={() => A.setApp("launcher")} aria-label="Écosystème">⌂</button>
    </div>
  );
}
function Tabs({ items, cur, onGo }) {
  return (
    <div className="tabbar">
      {items.map((t) => (
        <button key={t.s} className={"tab " + (cur === t.s ? "tabOn" : "")} onClick={() => onGo(t.s)}>
          <span className="tIco">{t.i}</span>{t.l}
        </button>
      ))}
    </div>
  );
}
function Sheet({ open, onClose, children, title }) {
  if (!open) return null;
  return (
    <div className="sheetWrap" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        {title && <div className="h2" style={{ marginBottom: 10 }}>{title}</div>}
        {children}
      </div>
    </div>
  );
}
function Toasts({ list }) {
  return <div className="toastWrap">{list.map((t) => <div key={t.id} className="toast">{t.m}</div>)}</div>;
}
function Timeline({ o, buyer }) {
  const f = FLOW(o.mode); const labels = FLOW_FR(o); const cur = stageIdx(o);
  const failed = cur === -1;
  const shown = buyer ? f.filter((k) => k !== "PAID") : f;
  return (
    <div className="tl">
      {shown.map((k, i) => {
        const idx = f.indexOf(k);
        const done = !failed && idx < cur; const curr = !failed && idx === cur;
        return (
          <div className="tlRow" key={k}>
            <div className="tlL">
              <div className={"dot " + (done ? "dotOn" : curr ? "dotCur blink" : "")} />
              {i < shown.length - 1 && <div className={"tlBar " + (done ? "tlBarOn" : "")} />}
            </div>
            <div className="tlTxt">
              <div className="p" style={{ fontWeight: done || curr ? 700 : 500, color: done || curr ? "var(--txt)" : "var(--sub)" }}>{labels[k]}</div>
              {curr && o.status === "PAY_PENDING" && <div className="sub">Confirmation de l’opérateur en cours…</div>}
            </div>
          </div>
        );
      })}
      {failed && <div className="note badNote mt8">Commande interrompue : {STATUS_FR[o.status][0]}. {o.status === "BUYER_REFUSED" ? "Frais de livraison gardés — le produit repart chez le vendeur." : o.status === "PICKUP_REFUSED" ? "La cliente est remboursée automatiquement — le coût est couvert par le fonds de protection." : "Voir le détail ci-dessous."}</div>}
    </div>
  );
}
function Art({ p, h = 120, size = 44, radius }) {
  return (
    <div className="art" style={{ height: h, background: p.g, borderRadius: radius }}>
      <span className="artE" style={{ fontSize: size }}>{p.e}</span>
    </div>
  );
}
function Stepper({ v, set, step = 500, min = 0, max = 999999 }) {
  return (
    <div className="row" style={{ gap: 8 }}>
      <button className="chip" style={{ width: 52, justifyContent: "center", fontSize: 18 }} onClick={() => set(Math.max(min, v - step))}>−</button>
      <div className="card num" style={{ flex: 1, textAlign: "center", fontWeight: 800, fontSize: 17, padding: 12 }}>{F(v)}</div>
      <button className="chip" style={{ width: 52, justifyContent: "center", fontSize: 18 }} onClick={() => set(Math.min(max, v + step))}>＋</button>
    </div>
  );
}
function VoiceBtn({ label = "Écouter l’explication" }) {
  const A = useApp(); const [open, setOpen] = useState(false);
  return (<>
    <button className="chip" onClick={() => setOpen(true)}>🔊 {label}</button>
    <Sheet open={open} onClose={() => setOpen(false)} title="Explication audio">
      <div className="sub">Choisissez la langue (lecture simulée dans ce prototype) :</div>
      <div className="chips mt12">
        {["Français", "Mooré", "Dioula"].map((l) => (
          <button key={l} className="chip" onClick={() => { setOpen(false); A.toast("▶ Lecture en " + l + " (démo)"); }}>{l}</button>
        ))}
      </div>
    </Sheet>
  </>);
}
function MoneyLines({ lines, total }) {
  return (
    <div>
      {lines.map((l, i) => (
        <div className="ml" key={i} style={l.dim ? { color: "var(--sub)" } : null}>
          <span>{l.l}</span><b className="num">{l.v}</b>
        </div>
      ))}
      {total && <div className="ml mlTot"><span>{total.l}</span><b className="num">{total.v}</b></div>}
    </div>
  );
}
function Keypad({ expect, onOk, hint }) {
  const A = useApp(); const [v, setV] = useState(""); const [err, setErr] = useState(false);
  const tap = (d) => {
    if (v.length >= 4) return;
    const nv = v + d; setV(nv);
    if (nv.length === 4) {
      if (nv === expect) onOk();
      else { setErr(true); A.toast("Code incorrect — vérifiez avec la cliente"); setTimeout(() => { setErr(false); setV(""); }, 500); }
    }
  };
  return (
    <div>
      <div className={"codeBox " + (err ? "shake" : "")}>
        {[0, 1, 2, 3].map((i) => <div key={i} className="codeC" style={err ? { borderColor: "#B3261E" } : v[i] ? { borderColor: "var(--pri)" } : null}>{v[i] || ""}</div>)}
      </div>
      {hint && <div className="sub mt8" style={{ textAlign: "center" }}>{hint}</div>}
      <div className="kbd">
        {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((k, i) => k === "" ? <div key={i} /> :
          <button key={i} className="key" onClick={() => k === "⌫" ? setV(v.slice(0, -1)) : tap(k)}>{k}</button>)}
      </div>
    </div>
  );
}
const Line = () => <div style={{ height: 1, background: "var(--line)", margin: "12px 0" }} />;

/* ---------------------------------- LAUNCHER ---------------------------------- */
function Launcher() {
  const A = useApp();
  const Door = ({ cls, title, tag, e, app, extra }) => (
    <div className={cls}>
      <button className="tile" onClick={() => A.setApp(app)}>
        <Band />
        <div style={{ padding: "14px 16px" }}>
          <div className="row">
            <div>
              <div className="wm" style={{ fontSize: 22 }}>{e} {title}</div>
              <div className="sub mt8" style={{ maxWidth: 300 }}>{tag}</div>
            </div>
            <span style={{ fontSize: 22, color: "var(--sub)" }}>›</span>
          </div>
          {extra}
        </div>
      </button>
    </div>
  );
  return (
    <div className="phone appLight appY">
      <Band />
      <div className="scroll" style={{ paddingTop: 18 }}>
        <div className="cap">Prototype interactif · données simulées · Ouagadougou</div>
        <div className="h1 mt8" style={{ fontSize: 30 }}>Le commerce de confiance,<br />de la boutique à la porte.</div>
        <div className="sub mt8">Trois applications, une seule histoire : le produit est vérifié, le paiement est protégé, la remise est sûre. Ce que vous faites ici se voit tout de suite dans les autres.</div>
        <div className="list mt16">
          <Door cls="appB" app="boutik" e="🏬" title="Boutik+" tag="Vendez sans dépôt, sans caution. Vous êtes payé dès que la livraison est confirmée."
            extra={<button className="chip mt12" onClick={(ev) => { ev.stopPropagation(); A.setApp("boutik"); A.reset("boutik", { s: "onboard", step: 0 }); }}>Voir l’inscription vendeur →</button>} />
          <Door cls="appB" app="dia" e="🌍" title="Boutik+ Diaspora"
            tag={<><b>« Vous décidez. Nous exécutons. Vous encaissez. »</b> Votre boutique au pays vous obéit — stock au hub, argent sur règles.</>} />
          <Door cls="appM" app="mb" e="🛍️" title="Ma Boutique" tag="Gagnez sans acheter de stock. Votre boutique, vos clientes — et votre gain net toujours affiché avant de partager." />
          <Door cls="appY" app="buyer" e="🤝" title="Espace client" tag="Achetez par le lien d’une revendeuse. Payez tout maintenant, en sécurité — ou seulement le produit, à la livraison." />
          <Door cls="appS" app="sera" e="🛵" title="Séra" tag="On vérifie, on scelle, on remet — et seulement une fois le paiement confirmé." />
          <Door cls="appO" app="ops" e="🛡️" title="Opérations" tag="Fonds de protection, incidents, réconciliation — la supervision humaine, à vue." />
        </div>
        <div className="card mt16">
          <div className="cap">Le fil d’une commande</div>
          <div className="p mt8">Client paie → vendeur prépare → livreur <b>vérifie puis scelle</b> → inspection à la porte → <b>paiement confirmé avant remise</b> → versements le jour même.</div>
        </div>
        <div className="sub mt12" style={{ textAlign: "center", paddingBottom: 8 }}>Bandes tissées : un même pagne, trois couleurs — un seul écosystème.</div>
      </div>
    </div>
  );
}

/* ---------------------------------- BOUTIK+ ---------------------------------- */
function Boutik() {
  const A = useApp();
  const cur = A.stacks.boutik[A.stacks.boutik.length - 1];
  const S = { home: BHome, produits: BProducts, commandes: BOrders, argent: BMoney, product: BProduct, order: BOrder, add: BAdd, studio: BStudio, trust: BTrust, onboard: BOnboard }[cur.s] || BHome;
  const tabs = [{ s: "home", i: "🏠", l: "Accueil" }, { s: "produits", i: "🏷️", l: "Produits" }, { s: "commandes", i: "📦", l: "Commandes" }, { s: "argent", i: "💰", l: "Argent" }];
  const showTabs = ["home", "produits", "commandes", "argent"].includes(cur.s);
  return (
    <div className="phone appLight appB">
      <Band />
      <S cur={cur} />
      {showTabs && <Tabs items={tabs} cur={cur.s} onGo={(s) => A.reset("boutik", { s })} />}
    </div>
  );
}
const wkOrders = (A) => Object.values(A.S.orders).filter((o) => A.S.products[o.pid].seller === "wendkuni");

function BHome() {
  const A = useApp();
  const todo = wkOrders(A).filter((o) => ["FUNDED", "READY_FAILED"].includes(o.status));
  const payable = wkOrders(A).filter((o) => o.status === "PAID").reduce((s, o) => { const p = A.S.products[o.pid]; return s + calc(p.B, p.C, o.markup).sellerNet; }, 0);
  const pending = wkOrders(A).filter((o) => !["PAID", "BUYER_REFUSED", "PICKUP_REFUSED", "RETURNED"].includes(o.status)).reduce((s, o) => { const p = A.S.products[o.pid]; return s + calc(p.B, p.C, o.markup).sellerNet; }, 0);
  return (<>
    <Top title="Boutik+" sub="Boutique Wendkuni · Rood Woko" right={<button className="chip" onClick={() => A.push("boutik", { s: "trust" })}>Vérifié ✓</button>} />
    <div className="scroll">
      <div className="h1">Nd’waoga, Rasmané 👋</div>
      <div className="sub mt8">Boutique ouverte · {Object.values(A.S.products).filter((p) => p.seller === "wendkuni").length} produits en ligne · aucun dépôt exigé, jamais.</div>
      {todo.length > 0 && (
        <div className="mt16">
          <div className="cap mb6">À faire maintenant</div>
          <div className="list">
            {todo.map((o) => {
              const p = A.S.products[o.pid];
              return (
                <button key={o.id} className="tile" onClick={() => A.push("boutik", { s: "order", id: o.id })}>
                  <div style={{ padding: 13 }} className="row">
                    <Art p={p} h={54} size={26} radius={13} />
                    <div style={{ flex: 1, marginLeft: 4 }}>
                      <div className="h3">{o.code} · {p.name}{o.variant ? " · " + o.variant : ""}</div>
                      <div className="sub">{o.status === "FUNDED" ? "Commande payée — confirmez « Produit prêt »" : "Photo refusée — reprenez la photo du produit prêt"}</div>
                    </div>
                    <StatusPill s={o.status} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="grid2 mt16">
        <div className="card"><div className="cap">En attente</div><div className="h2 num mt8">{F(pending)}</div><div className="sub">Payé après livraison validée</div></div>
        <div className="card"><div className="cap">Versé</div><div className="h2 num mt8">{F(payable)}</div><div className="sub">Sous 24 h après acceptation</div></div>
      </div>
      <button className="btn pri mt16" onClick={() => { resetAdd(); A.push("boutik", { s: "add", step: 0 }); }}>＋ Ajouter un produit</button>
      <div className="card mt12">
        <div className="row"><div className="h3">Alerte stock</div><Pill k="pWarn">2 produits</Pill></div>
        <div className="sub mt8">Sac cuir artisanal (4) · Boubou brodé — pensez à reconfirmer vos quantités.</div>
      </div>
      <div className="note mt12">🆓 Inscription et publication gratuites. Boutik+ ne gagne que lorsque votre produit est vendu (5 % du prix de base).</div>
    </div>
  </>);
}

function BOnboard({ cur }) {
  const A = useApp(); const st = cur.step || 0;
  const next = () => A.reset("boutik", { s: "onboard", step: st + 1 });
  const steps = [
    { t: "Bienvenue sur Boutik+", c: <><div className="p">Proposez vos produits aux revendeuses de Ma Boutique. Séra livre, vous encaissez.</div><div className="note mt12">✔ Inscription gratuite · ✔ aucun dépôt · ✔ aucune caution · ✔ aucun abonnement.<br />Vous payez seulement <b>5 %</b> quand un produit est <b>vendu avec succès</b>.</div></> },
    { t: "Votre numéro", c: <><div className="field"><label className="cap">Téléphone</label><input inputMode="tel" defaultValue="70 12 34 56" /></div><div className="note mt12">Un code de vérification arrive par WhatsApp (simulé ici).</div></> },
    { t: "Votre boutique", c: <><div className="field"><label className="cap">Nom de la boutique</label><input defaultValue="Ma nouvelle boutique" /></div><div className="field"><label className="cap">Quartier</label><input defaultValue="Rood Woko" /></div><div className="field"><label className="cap">Repère (pas d’adresse exigée)</label><input defaultValue="Allée 4, face au grand portail est" /></div></> },
    { t: "Compte de versement", c: <><div className="field"><label className="cap">Mobile Money (Orange / Moov)</label><input inputMode="tel" defaultValue="70 12 34 56" /></div><div className="note mt12">Vos gains y sont versés <b>sous 24 h</b> après chaque livraison validée. Aucun rechargement demandé.</div></> },
    { t: "Statut provisoire", c: <><div className="p">Pour commencer, votre compte est <b>provisoire</b> :</div><div className="card mt12"><div className="p">• Une commande à la fois pour commencer<br />• Seulement les catégories autorisées<br />• La cliente paie tout à la commande<br />• Une photo « produit prêt » est demandée<br />• Le livreur vérifie chaque enlèvement</div></div><div className="sub mt12">Après quelques livraisons propres, vous devenez <b>Vérifié</b> : plus de commandes, paiement à la livraison débloqué.</div></> },
  ];
  if (st >= steps.length) return (<>
    <Top title="Boutik+" back={() => A.reset("boutik", { s: "home" })} />
    <div className="scroll" style={{ display: "flex", flexDirection: "column", justifyContent: "center", textAlign: "center" }}>
      <div style={{ fontSize: 58 }}>🎉</div>
      <div className="h1 mt12">Compte provisoire créé</div>
      <div className="sub mt8">« Listez gratuitement. Vous payez seulement lorsqu’un produit est vendu avec succès. »</div>
      <button className="btn pri mt20" onClick={() => A.reset("boutik", { s: "home" })}>Explorer avec Boutique Wendkuni (démo)</button>
    </div>
  </>);
  const s = steps[st];
  return (<>
    <Top title={"Inscription " + (st + 1) + "/" + steps.length} back={() => st === 0 ? A.setApp("launcher") : A.reset("boutik", { s: "onboard", step: st - 1 })} />
    <div className="scroll"><div className="h1">{s.t}</div><div className="mt12">{s.c}</div></div>
    <div className="stick"><button className="btn pri" onClick={next}>{st === steps.length - 1 ? "Créer mon compte gratuit" : "Continuer"}</button></div>
  </>);
}

function BProducts() {
  const A = useApp();
  const list = Object.values(A.S.products).filter((p) => p.seller === "wendkuni");
  return (<>
    <Top title="Produits" sub={list.length + " en ligne · assets sans prix"} />
    <div className="scroll">
      <button className="btn sec" onClick={() => { resetAdd(); A.push("boutik", { s: "add", step: 0 }); }}>＋ Lister un produit (gratuit)</button>
      <div className="grid2 mt12">
        {list.map((p) => (
          <button key={p.id} className="tile" onClick={() => A.push("boutik", { s: "product", id: p.id })}>
            <Art p={p} h={104} radius={0} />
            <div style={{ padding: 11 }}>
              <div className="h3" style={{ fontSize: 14 }}>{p.name}</div>
              <div className="sub num">{F(p.B)} · stock {p.stock}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  </>);
}

function BProduct({ cur }) {
  const A = useApp(); const p = A.S.products[cur.id];
  const [pause, setPause] = useState(false); const [adj, setAdj] = useState(false); const [d, setD] = useState(0);
  const c = calc(p.B, p.C, 0);
  return (<>
    <Top title={p.name} back={() => A.pop("boutik")} />
    <div className="scroll">
      <Art p={p} h={170} size={64} />
      <div className="row mt12"><Pill k={pause ? "pMut" : "pOk"}>{pause ? "En pause" : "En ligne"}</Pill><Pill k="pInfo">3 revendeuses le proposent</Pill></div>
      <div className="card mt12">
        <div className="cap">Vos gains sur ce produit</div>
        <MoneyLines lines={[{ l: "Prix de base", v: F(p.B) }, { l: "Commission revendeuse", v: "−" + F(p.C), dim: true }, { l: "Frais Boutik+ (5 %)", v: "−" + F(c.fee), dim: true }]} total={{ l: "Vous recevez", v: F(c.sellerNet) }} />
        <div className="sub mt8">Montant verrouillé à la commande — payé sous 24 h après livraison validée.</div>
      </div>
      <div className="card mt12">
        <div className="row"><div className="h3">Stock</div><Pill k={p.stock <= 4 ? "pWarn" : "pOk"}>{p.stock} dispo.</Pill></div>
        {p.sizes && <div className="sub mt8">Variantes : {p.sizes.join(" · ")}</div>}
        <button className="btn ghost mt12" onClick={() => { setD(0); setAdj(true); }}>Ajuster le stock</button>
      </div>
      <div className="grid2 mt12">
        <button className="btn sec" onClick={() => A.toast("Modification (démo) — crée une nouvelle version, les commandes passées ne changent pas")}>Modifier</button>
        <button className="btn ghost" onClick={() => { setPause(!pause); A.toast(pause ? "Produit remis en ligne" : "Produit mis en pause — masqué chez les revendeuses"); }}>{pause ? "Réactiver" : "Mettre en pause"}</button>
      </div>
      <div className="card mt12">
        <div className="cap mb6">Activité</div>
        <div className="sub">• Photo canonique approuvée (cadre premium)<br />• Version 2 activée — prix inchangé pour les commandes passées<br />• Ajout au catalogue · vérifié par la modération</div>
      </div>
    </div>
    <Sheet open={adj} onClose={() => setAdj(false)} title="Ajuster le stock">
      <Stepper v={p.stock + d} set={(v) => setD(v - p.stock)} step={1} min={0} />
      <div className="sub mt8">Chaque ajustement est daté et motivé. Le stock affiché aux revendeuses est calculé côté serveur.</div>
      <button className="btn pri mt16" onClick={() => { A.d({ t: "STOCK", pid: p.id, d }); setAdj(false); A.toast("Stock mis à jour : " + (p.stock + d) + " unités"); }}>Enregistrer</button>
    </Sheet>
  </>);
}

const ADD_D = { cat: "Mode femme", name: "", B: 10000, C: 1000, sizes: "S, M, L", stock: 5, photos: false };
const resetAdd = () => Object.assign(ADD_D, { cat: "Mode femme", name: "", B: 10000, C: 1000, sizes: "S, M, L", stock: 5, photos: false });
function BAdd({ cur }) {
  const A = useApp(); const st = cur.step || 0;
  if (cur.done) { ADD_D.photos = true; delete cur.done; }
  const D = ADD_D;
  const go = (n) => A.reset2("boutik", A.stacks.boutik.slice(0, -1).concat({ s: "add", step: n }));
  const c = calc(D.B, D.C, 0);
  const [, force] = useState(0); const rf = () => force((x) => x + 1);
  const steps = [
    { t: "Catégorie", ok: true, c: <div className="chips">{["Mode femme", "Mode homme", "Chaussures", "Sacs", "Tissus", "Beauté scellée", "Maison", "Enfant"].map((x) => <button key={x} className={"chip " + (D.cat === x ? "chipOn" : "")} onClick={() => { D.cat = x; rf(); }}>{x}</button>)}</div> },
    { t: "Détails & stock", ok: true, c: <><div className="field"><label className="cap">Nom du produit</label><input placeholder="Ex. Robe brodée bogolan" defaultValue={D.name} onChange={(e) => (D.name = e.target.value)} /></div><div className="field"><label className="cap">Variantes (tailles…)</label><input defaultValue={D.sizes} onChange={(e) => (D.sizes = e.target.value)} /></div><div className="field"><label className="cap">Stock disponible</label></div><Stepper v={D.stock} set={(v) => { D.stock = v; rf(); }} step={1} min={1} /></> },
    { t: "Prix & commission", ok: true, c: <>
        <div className="cap">Prix de base (ce que vaut le produit)</div><div className="mt8"><Stepper v={D.B} set={(v) => { D.B = v; rf(); }} /></div>
        <div className="cap mt16">Commission revendeuse (vous la financez)</div><div className="mt8"><Stepper v={D.C} set={(v) => { D.C = v; rf(); }} step={100} /></div>
        <div className="card mt16">
          <MoneyLines lines={[{ l: "Prix de base", v: F(D.B) }, { l: "Commission revendeuse", v: "−" + F(D.C), dim: true }, { l: "Frais Boutik+ (5 %)", v: "−" + F(c.fee), dim: true }]} total={{ l: "Vous recevez", v: F(c.sellerNet) }} />
        </div>
        <div className="sub mt8">La cliente paie : prix de base + marge de la revendeuse. Votre commission n’est <b>jamais</b> ajoutée une deuxième fois au prix client.</div>
      </> },
    { t: "Photos — Studio", ok: D.photos, c: <>
        <div className="p">Le Studio vous guide pour des photos nettes, honnêtes et sans prix incrusté.</div>
        {D.photos ? <div className="note mt12">✅ 3 photos capturées et validées (héro · preuve · détail) — cadre premium appliqué.</div>
          : <button className="btn pri mt12" onClick={() => A.push("boutik", { s: "studio", ret: st })}>📸 Ouvrir Boutik+ Studio</button>}
      </> },
    { t: "Vérifiez, puis publiez", ok: true, c: <>
        <div className="card"><div className="h3">{D.name || "Robe brodée bogolan"}</div><div className="sub">{D.cat} · variantes {D.sizes} · stock {D.stock}</div>
          <Line /><MoneyLines lines={[{ l: "Vous recevez / vente", v: F(c.sellerNet) }, { l: "Commission revendeuse", v: F(D.C), dim: true }]} /></div>
        <div className="sub mt12">La modération vérifie catégorie, allégations et photos avant mise en ligne (immédiat dans la démo).</div>
      </> },
  ];
  const s = steps[st];
  return (<>
    <Top title={"Nouveau produit " + (st + 1) + "/5"} back={() => st === 0 ? A.pop("boutik") : go(st - 1)} />
    <div className="scroll"><div className="h1">{s.t}</div><div className="mt12">{s.c}</div></div>
    <div className="stick">
      <button className="btn pri" disabled={!s.ok} onClick={() => {
        if (st < 4) return go(st + 1);
        const id = "p" + (Object.keys(A.S.products).length + 1);
        A.d({ t: "PUB", p: { id, name: D.name || "Robe brodée bogolan", cat: D.cat, seller: "wendkuni", B: D.B, C: D.C, stock: D.stock, sizes: D.sizes ? D.sizes.split(",").map((x) => x.trim()) : null, e: "🧥", g: "linear-gradient(140deg,#0B5B47,#07392D)" } });
        A.toast("Publié ✓ — visible chez les revendeuses");
        A.reset("boutik", { s: "produits" });
      }}>{st === 4 ? "Publier — c’est gratuit" : st === 3 && !D.photos ? "Photos requises" : "Continuer"}</button>
    </div>
  </>);
}

function BStudio({ cur }) {
  const A = useApp(); const [st, setSt] = useState(0); const [low, setLow] = useState(false);
  const [shots, setShots] = useState({}); const [proc, setProc] = useState(0); const [orig, setOrig] = useState(false);
  useEffect(() => { if (st === 3 && proc < 4) { const t = setTimeout(() => setProc((p) => p + 1), 650); return () => clearTimeout(t); } }, [st, proc]);
  const Meter = ({ l, ok }) => <div className="row" style={{ padding: "6px 0" }}><span className="sub">{l}</span><Pill k={ok ? "pOk" : "pWarn"}>{ok ? "OK" : "À corriger"}</Pill></div>;
  const View = ({ label, e }) => (
    <div className="art" style={{ height: 230, background: low ? "linear-gradient(140deg,#3A3128,#241E17)" : "linear-gradient(140deg,#B65C2E,#7A3014)" }}>
      <div style={{ position: "absolute", inset: 22, border: "2.5px dashed rgba(255,255,255,.75)", borderRadius: 16 }} />
      <span className="artE" style={{ fontSize: 74, opacity: low ? 0.5 : 1 }}>{e}</span>
      <span style={{ position: "absolute", bottom: 10, left: 0, right: 0, textAlign: "center", color: "#FFF6E8", fontSize: 12, fontWeight: 700 }}>{label}</span>
    </div>
  );
  const shotStep = (key, title, sub, e, next) => (<>
    <div className="h2">{title}</div><div className="sub mt8">{sub}</div>
    <div className="mt12"><View label="Placez l’article dans le cadre" e={e} /></div>
    <div className="card mt12">
      <Meter l="Luminosité" ok={!low} /><Meter l="Netteté" ok={!low} /><Meter l="Stabilité" ok /><Meter l="Fond" ok={!low} />
      {low && <div className="note warnNote mt8">Trop sombre — rapprochez-vous d’une fenêtre ou d’une lampe.</div>}
    </div>
    <button className="chip mt12" onClick={() => setLow(!low)}>{low ? "Simuler : bonne lumière" : "Simuler : faible lumière"}</button>
    <button className="btn pri mt12" disabled={low} onClick={() => { setShots((s) => ({ ...s, [key]: true })); setSt(next); }}>📸 Capturer</button>
  </>);
  const done = () => { const ret = A.stacks.boutik[A.stacks.boutik.length - 2]; A.pop("boutik"); if (ret && ret.s === "add") { ret.done = true; } A.toast("Photos canoniques prêtes — sans prix, sans contact"); };
  return (<>
    <Top title="Boutik+ Studio" sub="De vraies photos — aucune image inventée par IA" back={() => A.pop("boutik")} />
    <div className="scroll">
      {st === 0 && shotStep("hero", "1 · Photo héro", "Sur une surface simple. Elle recevra la mise en forme premium.", "👗", 1)}
      {st === 1 && shotStep("proof", "2 · Photo preuve", "L’article en main, dans votre boutique. Une photo réelle qui inspire confiance (le désordre est permis).", "🤳", 2)}
      {st === 2 && shotStep("detail", "3 · Détail catégorie", "Mode : étiquette de taille bien lisible.", "🏷️", 3)}
      {st === 3 && (<>
        <div className="h2">Traitement (sur votre téléphone)</div>
        <div className="card mt12">
          {["Rotation corrigée", "Lumière équilibrée — sans exagérer", "Recadrage sûr depuis le cadre", "Analyse du fond…"].map((l, i) => (
            <div className="row" key={i} style={{ padding: "6px 0" }}><span className="p">{l}</span><span>{proc > i ? "✅" : proc === i ? <span className="blink">⏳</span> : "·"}</span></div>
          ))}
        </div>
        {proc >= 4 && (<>
          <div className="note warnNote mt12">Fond complexe détecté → <b>cadre premium appliqué</b> (votre vraie photo, joliment encadrée). Aucun détourage risqué, aucune retouche du produit.</div>
          <div className="card mt12">
            <div className="row"><div className="cap">Avant / Après</div><button className="chip" onClick={() => setOrig(!orig)}>{orig ? "Voir la version traitée" : "Utiliser les couleurs d’origine"}</button></div>
            <div className="grid2 mt12">
              <div><Art p={{ g: "linear-gradient(140deg,#8a5a3a,#5a3a22)", e: "👗" }} h={110} size={40} /><div className="sub mt8" style={{ textAlign: "center" }}>Originale (conservée en privé)</div></div>
              <div><div style={{ border: "5px solid #F3EDE1", borderRadius: 16, boxShadow: "0 4px 14px rgba(0,0,0,.15)" }}><Art p={{ g: orig ? "linear-gradient(140deg,#8a5a3a,#5a3a22)" : "linear-gradient(140deg,#B65C2E,#7A3014)", e: "👗" }} h={100} size={40} /></div><div className="sub mt8" style={{ textAlign: "center" }}>Publique · sans prix</div></div>
            </div>
          </div>
          <button className="btn pri mt12" onClick={done}>J’approuve ces photos</button>
        </>)}
      </>)}
      <div className="sub mt12">Cette photo prouve l’accès au produit — pas la quantité ni l’authenticité. L’originale est conservée, jamais écrasée.</div>
    </div>
  </>);
}

function BOrders() {
  const A = useApp(); const list = wkOrders(A).sort((a, b) => (a.status === "FUNDED" ? -1 : 1));
  return (<>
    <Top title="Commandes" sub={list.length + " commandes"} />
    <div className="scroll"><div className="list">
      {list.map((o) => { const p = A.S.products[o.pid]; return (
        <button key={o.id} className="tile" onClick={() => A.push("boutik", { s: "order", id: o.id })}>
          <div style={{ padding: 13 }} className="row">
            <Art p={p} h={50} size={24} radius={12} />
            <div style={{ flex: 1, marginLeft: 4 }}><div className="h3">{o.code}</div><div className="sub">{p.name}{o.variant ? " · " + o.variant : ""} · {o.mode === "B" ? "produit payé à la porte" : "payé en entier"}</div></div>
            <StatusPill s={o.status} />
          </div>
        </button>); })}
    </div></div>
  </>);
}

function BOrder({ cur }) {
  const A = useApp(); const o = A.S.orders[cur.id]; const p = A.S.products[o.pid];
  const c = calc(p.B, p.C, o.markup); const [ready, setReady] = useState(false); const [shot, setShot] = useState(false);
  const confirmReady = () => {
    A.d({ t: "ORD", id: o.id, p: { status: "READY" }, h: "Produit prêt confirmé (code " + o.challenge + ") — Séra assigne un livreur" });
    setReady(false); A.toast("Prêt ✓ — Issa (Séra) est notifié");
  };
  return (<>
    <Top title={o.code} back={() => A.pop("boutik")} right={<StatusPill s={o.status} />} />
    <div className="scroll">
      <div className="card row">
        <Art p={p} h={56} size={26} radius={13} />
        <div style={{ flex: 1 }}><div className="h3">{p.name}{o.variant ? " · taille " + o.variant : ""}</div><div className="sub">Qté 1 · zone {o.buyer.zone}</div></div>
      </div>
      <div className="card mt12">
        <div className="cap">Votre gain (verrouillé)</div>
        <MoneyLines lines={[{ l: "Prix de base", v: F(p.B) }, { l: "Commission revendeuse", v: "−" + F(p.C), dim: true }, { l: "Frais Boutik+ (5 %)", v: "−" + F(c.fee), dim: true }]} total={{ l: "Vous recevez", v: F(c.sellerNet) }} />
        <div className="sub mt8">{o.mode === "B" ? "Produit payé à la porte : vous êtes payé une fois le paiement confirmé et le colis remis." : "Déjà payé, gardé en sécurité chez le partenaire de paiement."}</div>
      </div>
      {o.status === "FUNDED" && (<>
        <div className="note mt12">🎯 Préparez avant <b>11 h 30</b>. Emballage <b>ouvrable</b> (le livreur vérifie avant de sceller) · emballage neutre, sans coordonnées.</div>
        <button className="btn pri mt12" onClick={() => { setShot(false); setReady(true); }}>✅ Produit prêt</button>
      </>)}
      {o.status === "READY_FAILED" && (<>
        <div className="note badNote mt12">Photo de préparation refusée : <b>trop sombre</b>. Rapprochez-vous d’une fenêtre et reprenez — le code doit rester lisible.</div>
        <button className="btn pri mt12" onClick={() => { setShot(false); setReady(true); }}>📸 Reprendre la photo</button>
      </>)}
      {["READY", "TRANSIT", "ARRIVED", "INSPECT", "AWAIT_PAY", "PAY_PENDING", "PAY_OK", "HANDOFF"].includes(o.status) && (
        <button className="btn sec mt12" onClick={() => { A.setApp("sera"); }}>La suite se passe côté Séra — ouvrir 🛵</button>
      )}
      {["DELIVERED", "PAID"].includes(o.status) && <div className="note mt12">✅ Livraison validée. {o.status === "PAID" ? "Argent versé sur votre Mobile Money." : "Versement en cours (sous 24 h)."}</div>}
      <div className="card mt12"><div className="cap mb6">Suivi</div><Timeline o={o} /></div>
      <div className="card mt12"><div className="cap mb6">Historique</div>{o.history.map((h, i) => <div key={i} className="sub" style={{ padding: "3px 0" }}>• {h.ts} — {h.l}</div>)}</div>
    </div>
    <Sheet open={ready} onClose={() => setReady(false)} title="Confirmer « Produit prêt »">
      <div className="cap">1 · Code de préparation (valable 15 min)</div>
      <div className="card mt8" style={{ textAlign: "center" }}><div className="h1" style={{ letterSpacing: ".12em" }}>{o.challenge}</div><div className="sub mt8">Écrivez ce code sur un papier posé à côté du produit.</div></div>
      <div className="cap mt16">2 · Photo de préparation</div>
      {shot ? <div className="note mt8">✅ Photo nette — produit + code visibles.</div> : <button className="btn sec mt8" onClick={() => setShot(true)}>📸 Prendre la photo (caméra intégrée)</button>}
      <div className="cap mt16">3 · Disponibilité</div>
      <div className="sub mt8">Je confirme être présent à la boutique pour l’enlèvement (créneau 11 h – 13 h).</div>
      <button className="btn pri mt16" disabled={!shot} onClick={confirmReady}>Confirmer — envoyer à Séra</button>
      <div className="sub mt8">Le code client de livraison ne vous est jamais montré.</div>
    </Sheet>
  </>);
}

function BMoney() {
  const A = useApp();
  const rows = wkOrders(A).map((o) => { const p = A.S.products[o.pid]; const c = calc(p.B, p.C, o.markup); return { o, p, n: c.sellerNet }; });
  const sum = (f) => rows.filter(f).reduce((s, r) => s + r.n, 0);
  return (<>
    <Top title="Argent" sub="Pas de compte interne — tout arrive sur votre Mobile Money" />
    <div className="scroll">
      <div className="grid2">
        <div className="card"><div className="cap">En attente</div><div className="h2 num mt8">{F(sum((r) => !["PAID", "BUYER_REFUSED", "PICKUP_REFUSED", "RETURNED", "READY_FAILED"].includes(r.o.status)))}</div></div>
        <div className="card"><div className="cap">Versé (7 j)</div><div className="h2 num mt8">{F(sum((r) => r.o.status === "PAID"))}</div></div>
      </div>
      <div className="cap mt16 mb6">Détail par commande</div>
      <div className="list">
        {rows.map(({ o, p, n }) => (
          <div key={o.id} className="card row">
            <div><div className="h3">{o.code}</div><div className="sub">{p.name}</div></div>
            <div style={{ textAlign: "right" }}><div className="h3 num">{F(n)}</div><StatusPill s={o.status} /></div>
          </div>
        ))}
      </div>
      <div className="note mt12">En cas de faute de votre part (mauvais article…), la cliente est remboursée immédiatement par le <b>fonds de protection</b> — rien n’est prélevé sur vous ; vos privilèges peuvent être réduits.</div>
    </div>
  </>);
}

function BTrust() {
  const A = useApp();
  const T = ({ tier, on, lines }) => (
    <div className="card" style={on ? { borderColor: "var(--pri)", borderWidth: 2 } : null}>
      <div className="row"><div className="h3">{TIER_FR[tier]}</div>{on && <Pill k="pOk">Votre niveau</Pill>}</div>
      <div className="sub mt8">{lines}</div>
    </div>
  );
  return (<>
    <Top title="Niveau de confiance" back={() => A.pop("boutik")} />
    <div className="scroll">
      <div className="sub">Votre niveau progresse par des livraisons propres — jamais par un dépôt d’argent.</div>
      <div className="list mt12">
        <T tier="provisional" lines={<>1 commande à la fois · paiement complet uniquement · vérification à chaque enlèvement · catégories approuvées.</>} />
        <T tier="verified" on lines={<>✔ 12 livraisons · 0 faute — <b>Paiement à la livraison débloqué</b> · plusieurs commandes en parallèle · meilleure visibilité.</>} />
        <T tier="trusted" lines={<>Après un solide historique : plus de commandes simultanées, contrôles allégés quand c’est sûr, campagnes prioritaires.</>} />
      </div>
      <div className="note mt12">Une faute répétée réduit l’accès (retour au prépaiement, suspension) — c’est l’accès au marché qui compte, pas une caution.</div>
    </div>
  </>);
}

/* ---------------------------------- MA BOUTIQUE ---------------------------------- */
const aOrders = (A) => Object.values(A.S.orders);
const ZONES = ["Ouaga 2000", "Gounghin", "Cissin", "Dassasgho", "Tampouy"];

function MB() {
  const A = useApp();
  const cur = A.stacks.mb[A.stacks.mb.length - 1];
  const S = { home: MHome, opps: MOpps, opp: MOpp, share: MShare, store: MStore, sales: MSales, sale: MSale, gains: MGains, onboard: MOnboard, cercle: MCercle, campnew: MCampNew, campaign: MCampaign, members: MMembers, funding: MFunding, reviews: MReviews }[cur.s] || MHome;
  const showTabs = ["home", "opps", "store", "cercle", "gains"].includes(cur.s);
  return (
    <div className="phone appLight appM">
      <Band />
      <S cur={cur} />
      {showTabs && <Tabs items={[{ s: "home", i: "🏠", l: "Accueil" }, { s: "opps", i: "✨", l: "Opportunités" }, { s: "store", i: "🛍️", l: "Vitrine" }, { s: "cercle", i: "👥", l: "Cercle" }, { s: "gains", i: "💰", l: "Gains" }]} cur={cur.s} onGo={(s) => A.reset("mb", { s })} />}
    </div>
  );
}

function MHome() {
  const A = useApp();
  const active = aOrders(A).filter((o) => !["PAID", "BUYER_REFUSED", "PICKUP_REFUSED", "RETURNED", "READY_FAILED", "SELLER_RETURN", "RETURNING"].includes(o.status));
  const pending = active.reduce((s, o) => { const p = A.S.products[o.pid]; return s + calc(p.B, p.C, o.markup).rNet - (o.camp || 0); }, 0);
  return (<>
    <Top title="Ma Boutique" sub="Chez Aïcha Mode ✓ · Gounghin" right={<button className="chip" onClick={() => A.push("mb", { s: "onboard", step: 0 })}>Comment ça marche</button>} />
    <div className="scroll">
      <div className="h1">Bonjour Aïcha 🌸</div>
      <div className="sub mt8">Votre boutique, sans stock ni avance. Vos gains viennent uniquement de vos ventes livrées — jamais de recrutement.</div>
      <div className="grid2 mt16">
        <div className="card"><div className="cap">Gains nets — juin</div><div className="h2 num mt8">{F(RESELLER.month)}</div><div className="sub">Versés sur Mobile Money</div></div>
        <div className="card"><div className="cap">En attente (net)</div><div className="h2 num mt8">{F(pending)}</div><div className="sub">Verrouillé à la commande</div></div>
      </div>
      <button className="btn pri mt16" onClick={() => A.reset("mb", { s: "opps" })}>✨ Trouver des produits à vendre</button>
      <div className="row mt16"><div className="cap">Ventes en cours</div><button className="chip" onClick={() => A.push("mb", { s: "sales" })}>Tout voir</button></div>
      <div className="list mt8">
        {active.slice(0, 3).map((o) => { const p = A.S.products[o.pid]; return (
          <button key={o.id} className="tile" onClick={() => A.push("mb", { s: "sale", id: o.id })}>
            <div style={{ padding: 12 }} className="row">
              <Art p={p} h={48} size={22} radius={12} />
              <div style={{ flex: 1, marginLeft: 4 }}><div className="h3">{o.code}</div><div className="sub">{o.buyer.name.split(" ")[0]} · {o.buyer.zone}</div></div>
              <StatusPill s={o.status} />
            </div>
          </button>); })}
        {active.length === 0 && <div className="card sub">Aucune vente en cours — partagez une carte produit sur WhatsApp pour démarrer.</div>}
      </div>
      <div className="note mt12">💡 Astuce : le prix client = prix de base + votre marge. Vous voyez toujours votre <b>gain net</b> avant de partager.</div>
      <button className="tile mt12" onClick={() => A.reset("mb", { s: "cercle" })}>
        <div style={{ padding: 13 }} className="row">
          <div><div className="h3">👥 Mon Cercle</div><div className="sub">{A.S.cercle.members} membres · campagne {A.S.cercle.campaign.recipe} {A.S.cercle.campaign.orders}/{A.S.cercle.campaign.maxOrders}</div></div>
          <span style={{ fontSize: 20, color: "var(--sub)" }}>›</span>
        </div>
      </button>
    </div>
  </>);
}

function MOnboard({ cur }) {
  const A = useApp(); const st = cur.step || 0;
  const steps = [
    { t: "Vendez sans stock", c: <div className="p">Choisissez un produit d’un vendeur vérifié, ajoutez votre marge, partagez sur WhatsApp. Séra livre — et votre gain net vous revient.<div className="note mt12">✔ 0 F d’avance · ✔ pas de livraison à gérer · ✔ <b>aucun recrutement</b> : seuls vos ventes livrées paient.</div></div> },
    { t: "Votre boutique", c: <><div className="field"><label className="cap">Nom de votre boutique</label><input defaultValue="Chez Aïcha Mode" /></div><div className="field"><label className="cap">Quartier</label><input defaultValue="Gounghin" /></div></> },
    { t: "Vos gains", c: <div className="p">Frais Ma Boutique : <b>20 % de votre gain brut</b> (commission + marge), affichés avant chaque partage. Versement Mobile Money sous 24 h après livraison validée.<div className="field"><label className="cap">Numéro Mobile Money</label><input inputMode="tel" defaultValue="76 40 18 22" /></div></div> },
  ];
  if (st >= steps.length) return (<>
    <Top title="Ma Boutique" back={() => A.reset("mb", { s: "home" })} />
    <div className="scroll" style={{ display: "flex", flexDirection: "column", justifyContent: "center", textAlign: "center" }}>
      <div style={{ fontSize: 58 }}>🎀</div><div className="h1 mt12">Vitrine créée</div>
      <div className="sub mt8">Bonus de lancement : +1 000 F après vos 5 premières ventes livrées (campagne — jamais déduit de vos frais).</div>
      <button className="btn pri mt20" onClick={() => A.reset("mb", { s: "opps" })}>Voir les opportunités</button>
    </div>
  </>);
  return (<>
    <Top title={"Inscription " + (st + 1) + "/3"} back={() => st === 0 ? A.pop("mb") : A.reset("mb", { s: "onboard", step: st - 1 })} />
    <div className="scroll"><div className="h1">{steps[st].t}</div><div className="mt12">{steps[st].c}</div></div>
    <div className="stick"><button className="btn pri" onClick={() => A.reset("mb", { s: "onboard", step: st + 1 })}>Continuer</button></div>
  </>);
}

function MOpps() {
  const A = useApp(); const [cat, setCat] = useState("Tout");
  const cats = ["Tout", "Mode femme", "Mode homme", "Chaussures", "Tissus", "Beauté scellée", "Sacs"];
  const list = Object.values(A.S.products).filter((p) => cat === "Tout" || p.cat === cat);
  return (<>
    <Top title="Opportunités" sub="Produits de vendeurs vérifiés — votre gain net est affiché" />
    <div className="scroll">
      <div className="chipsX">{cats.map((c) => <button key={c} className={"chip " + (cat === c ? "chipOn" : "")} onClick={() => setCat(c)}>{c}</button>)}</div>
      <div className="list mt12">
        {list.map((p) => { const m = MARKUPS[p.id] || Math.round(p.B * 0.12 / 100) * 100; const c = calc(p.B, p.C, m); const s = SELLERS[p.seller]; return (
          <button key={p.id} className="tile" onClick={() => A.push("mb", { s: "opp", pid: p.id })}>
            <div style={{ padding: 12 }} className="row">
              <Art p={p} h={64} size={30} radius={14} />
              <div style={{ flex: 1, marginLeft: 4 }}>
                <div className="h3">{p.name}</div>
                <div className="sub">{s.tier === "diaspora" ? "Maison Awa — Montréal 🇨🇦 · vérifié au hub · stock " + p.stock : s.tier === "platform" ? "Shop+ PackLab · " + p.stock + " kits (min composants)" : "Vendeur " + TIER_FR[s.tier].toLowerCase() + " · stock " + p.stock}</div>
                <div className="sub" style={{ color: "var(--deep)", fontWeight: 700 }}>Gagnez ≈ {F(c.rNet)} net</div>
              </div>
              <Pill k={s.tier === "provisional" ? "pWarn" : "pOk"}>{TIER_FR[s.tier]}</Pill>
            </div>
          </button>); })}
      </div>
    </div>
  </>);
}

function MOpp({ cur }) {
  const A = useApp(); const p = A.S.products[cur.pid]; const s = SELLERS[p.seller];
  const cap = Math.round(p.B * 0.2 / 100) * 100;
  const [m, setM] = useState(Math.min(MARKUPS[p.id] || 1500, cap));
  const c = calc(p.B, p.C, m);
  return (<>
    <Top title="Opportunité" back={() => A.pop("mb")} />
    <div className="scroll">
      <Art p={p} h={160} size={60} />
      <div className="h1 mt12">{p.name}</div>
      <div className="row mt8">
        <Pill k={s.tier === "provisional" ? "pWarn" : "pOk"}>Vendeur {TIER_FR[s.tier].toLowerCase()} · {s.stats}</Pill>
      </div>
      {s.tier === "diaspora" ? (
        <div className="card mt8">
          <div className="row"><div className="h3">🌍 Maison Awa — Montréal 🇨🇦</div><Pill k="pOk">Enseigne vérifiée</Pill></div>
          <div className="sub mt8">« Accessoires choisis au Canada, stock vérifié au hub Ouaga. » · ⭐ 4,9 · 27 livraisons validées · exécution 100 % hub.</div>
          <div className="sub mt8">Projection de marque uniquement : jamais de contact, d’adresse ni de réseaux — la garde au hub rend l’exception sûre (SP-I03). La cliente ne verra que « Sélection diaspora · vérifié au hub » : <b>vous restez le visage de confiance</b>.</div>
        </div>
      ) : s.tier === "platform" ? (
        <div className="card mt8">
          <div className="row"><div className="h3">📦 Shop+ PackLab — panier conçu</div><Pill k="pOk">Financement livraison ✓ en solo</Pill></div>
          <div className="sub mt8">Contenu fixe : Marmite ×1 · Bols ×4 · Cuillères ×6 · Torchons ×2. Disponibilité = min(composants) = {p.stock} kits (calcul déterministe). Scellé à l’atelier de kitting après QC.</div>
        </div>
      ) : (
        <div className="sub mt8">Identité du vendeur non exposée — vous vendez sous votre vitrine. Stock confirmé il y a 2 h · zone {s.zone}.</div>
      )}
      <div className="card mt12">
        <div className="row"><div className="cap">Votre marge</div><b className="num">{F(m)}</b></div>
        <input type="range" min={0} max={cap} step={100} value={m} onChange={(e) => setM(+e.target.value)} />
        <div className="sub">Plafond : 20 % du prix de base ({F(cap)}) — protège la confiance des clientes.</div>
        <Line />
        <MoneyLines lines={[
          { l: "Commission du vendeur", v: "+" + F(p.C) },
          { l: "Votre marge", v: "+" + F(m) },
          { l: "Gain brut", v: F(c.gross) },
          { l: "Frais Ma Boutique (20 %)", v: "−" + F(c.rFee), dim: true },
        ]} total={{ l: "Votre gain net", v: F(c.rNet) }} />
        <Line />
        <div className="ml"><span>Prix affiché à la cliente</span><b className="num">{F(c.subtotal)}</b></div>
        <div className="sub">+ livraison dès 1 000 F, payée par la cliente.</div>
      </div>
      <div className="chips mt12">
        <span className="chip">🔍 Inspection à la porte</span><span className="chip">↩ Refus justifié = cliente protégée</span>
        {p.sealed && <span className="chip">🔒 Sceau fabricant — ne s’ouvre pas</span>}
      </div>
    </div>
    <div className="stick"><button className="btn pri" onClick={() => A.push("mb", { s: "share", pid: p.id, markup: m })}>Ajouter à ma vitrine & partager</button></div>
  </>);
}

function MShare({ cur }) {
  const A = useApp(); const p = A.S.products[cur.pid]; const m = cur.markup ?? (MARKUPS[p.id] || 1500);
  const c = calc(p.B, p.C, m); const [fmt, setFmt] = useState("Carte WhatsApp");
  return (<>
    <Top title="Partager" back={() => A.pop("mb")} />
    <div className="scroll">
      <div className="seg">{["Carte WhatsApp", "Story", "Affiche"].map((x) => <button key={x} className={"segB " + (fmt === x ? "segOn" : "")} onClick={() => setFmt(x)}>{x}</button>)}</div>
      <div className="card mt12" style={{ padding: 0, overflow: "hidden" }}>
        <Art p={p} h={fmt === "Story" ? 250 : 150} size={58} radius={0} />
        <div style={{ padding: 14 }}>
          <div className="cap">Chez Aïcha Mode ✓</div>
          <div className="h2 mt8">{p.name}</div>
          <div className="h1 num" style={{ color: "var(--deep)" }}>{F(c.subtotal)}</div>
          <div className="sub">Prix valable jusqu’au 5 juillet · livraison à Ouagadougou</div>
          {cur.campBadge && A.S.cercle.campaign && <div className="sub" style={{ color: "var(--deep)", fontWeight: 700 }}>🛵 Livraison {F(A.S.cercle.campaign.customerShare)} — {A.S.cercle.campaign.window.toLowerCase()} à {A.S.cercle.campaign.zone} (campagne)</div>}
          <div className="btn pri mt12" style={{ minHeight: 44 }}>Commander en 2 minutes</div>
        </div>
      </div>
      <div className="sub mt8" style={{ textAlign: "center" }}>Votre gain net sur cette carte : <b className="num">{F(c.rNet)}</b> — jamais visible par la cliente.</div>
      <div className="list mt12">
        <button className="btn sec" onClick={() => A.toast("Lien signé copié — attribution verrouillée : Chez Aïcha Mode")}>🔗 Copier le lien signé</button>
        <button className="btn ghost" onClick={() => A.toast("Ouverture de WhatsApp (démo) — carte + lien prêts")}>🟢 Partager sur WhatsApp</button>
        <button className="btn ghost" onClick={() => { Object.assign(YD, { pid: p.id, markup: m, variant: null, deliveryType: "standard", fee: 1000, mode: "A" }); A.reset("buyer", { s: "product" }); A.setApp("buyer"); }}>👀 Voir comme cliente →</button>
      </div>
      <div className="note mt12">Toute commande via ce lien vous est attribuée, même des jours plus tard. Un lien falsifié est rejeté.</div>
    </div>
  </>);
}

function MStore() {
  const A = useApp(); const [disc, setDisc] = useState(false);
  const items = Object.keys(MARKUPS).map((id) => A.S.products[id]).filter(Boolean);
  return (<>
    <Top title="Ma vitrine" sub="Chez Aïcha Mode ✓" right={<button className="chip" onClick={() => { setDisc(!disc); A.toast(disc ? "Vitrine privée — accessible par lien seulement" : "Votre boutique apparaît dans Découvrir"); }}>{disc ? "Publique" : "Privée"}</button>} />
    <div className="scroll">
      <div className="sub">Les clientes voient votre boutique, vos prix, votre nom — jamais les vendeurs.</div>
      <div className="grid2 mt12">
        {items.map((p) => { const c = calc(p.B, p.C, MARKUPS[p.id]); return (
          <button key={p.id} className="tile" onClick={() => A.push("mb", { s: "share", pid: p.id, markup: MARKUPS[p.id] })}>
            <Art p={p} h={100} radius={0} />
            <div style={{ padding: 11 }}><div className="h3" style={{ fontSize: 13.5 }}>{p.name}</div>
              <div className="row"><span className="sub num" style={{ fontWeight: 700, color: "var(--deep)" }}>{F(c.subtotal)}</span><span className="sub num">net {F(c.rNet)}</span></div>
            </div>
          </button>); })}
      </div>
    </div>
  </>);
}

function MSales() {
  const A = useApp();
  return (<>
    <Top title="Ventes" back={() => A.pop("mb")} />
    <div className="scroll"><div className="list">
      {aOrders(A).map((o) => { const p = A.S.products[o.pid]; return (
        <button key={o.id} className="tile" onClick={() => A.push("mb", { s: "sale", id: o.id })}>
          <div style={{ padding: 12 }} className="row">
            <div style={{ flex: 1 }}><div className="h3">{o.code}</div><div className="sub">{p.name} · {o.buyer.name.split(" ")[0]}</div></div>
            <StatusPill s={o.status} />
          </div>
        </button>); })}
    </div></div>
  </>);
}

function MSale({ cur }) {
  const A = useApp(); const o = A.S.orders[cur.id]; if (!o) return null;
  const p = A.S.products[o.pid]; const c = calc(p.B, p.C, o.markup);
  return (<>
    <Top title={o.code} back={() => A.pop("mb")} right={<StatusPill s={o.status} />} />
    <div className="scroll">
      <div className="card row"><Art p={p} h={52} size={24} radius={12} /><div style={{ flex: 1 }}><div className="h3">{p.name}{o.variant ? " · " + o.variant : ""}</div><div className="sub">{o.buyer.name} · {o.buyer.zone}</div></div></div>
      <div className="card mt12">
        <div className="cap">Votre gain net (verrouillé)</div>
        <MoneyLines lines={[{ l: "Gain brut (commission + marge)", v: F(c.gross) }, { l: "Frais Ma Boutique (20 %)", v: "−" + F(c.rFee), dim: true }, ...(o.camp ? [{ l: "Contribution campagne Cercle", v: "−" + F(o.camp), dim: true }] : [])]} total={{ l: o.camp ? "Net effectif pour vous" : "Net pour vous", v: F(c.rNet - (o.camp || 0)) }} />
      </div>
      <div className="card mt12"><div className="cap mb6">Suivi (vue revendeuse)</div><Timeline o={o} /></div>
      <div className="grid2 mt12">
        <button className="btn sec" onClick={() => A.toast("Appel via relais masqué — votre numéro reste privé")}>📞 Contacter la cliente</button>
        <button className="btn ghost" onClick={() => A.toast("Assistance prévenue — réponse sous 2 h")}>Assistance</button>
      </div>
      <div className="sub mt12">La logistique et l’argent sont gérés par la plateforme — vous ne pouvez pas modifier la commande, c’est ce qui protège tout le monde.</div>
    </div>
  </>);
}

function MGains() {
  const A = useApp();
  const rows = aOrders(A).map((o) => { const p = A.S.products[o.pid]; return { o, c: calc(p.B, p.C, o.markup) }; });
  const pend = rows.filter((r) => !["PAID", "BUYER_REFUSED", "PICKUP_REFUSED", "RETURNED", "READY_FAILED", "SELLER_RETURN", "RETURNING"].includes(r.o.status)).reduce((s, r) => s + r.c.rNet - (r.o.camp || 0), 0);
  const paid = rows.filter((r) => r.o.status === "PAID").reduce((s, r) => s + r.c.rNet - (r.o.camp || 0), 0);
  return (<>
    <Top title="Gains" sub="Toujours en net — versé sur votre Mobile Money" />
    <div className="scroll">
      <div className="grid2">
        <div className="card"><div className="cap">En attente (net)</div><div className="h2 num mt8">{F(pend)}</div></div>
        <div className="card"><div className="cap">Payé cette semaine</div><div className="h2 num mt8">{F(paid)}</div></div>
      </div>
      <div className="card mt12">
        <div className="row"><div className="h3">🎁 Bonus 5 premières ventes</div><b className="num">+1 000 F</b></div>
        <div className="sub mt8">Campagne de lancement — financée à part, <b>jamais déduite</b> de vos frais. 3/5 ventes réalisées.</div>
        <div className="gauge mt8"><div className="gaugeF" style={{ width: "60%" }} /></div>
      </div>
      <div className="cap mt16 mb6">Détail par vente</div>
      <div className="list">
        {rows.map(({ o, c }) => (
          <div key={o.id} className="card">
            <div className="row"><div className="h3">{o.code}</div><StatusPill s={o.status} /></div>
            <MoneyLines lines={[{ l: "Gain brut", v: F(c.gross), dim: true }, { l: "Frais (20 %)", v: "−" + F(c.rFee), dim: true }, ...(o.camp ? [{ l: "Contribution Cercle", v: "−" + F(o.camp), dim: true }] : [])]} total={{ l: o.camp ? "Net effectif" : "Net", v: F(c.rNet - (o.camp || 0)) }} />
          </div>
        ))}
      </div>
    </div>
  </>);
}

/* ---------------------------------- ESPACE CLIENT ---------------------------------- */
const YD = { pid: "p1", rid: "aicha", markup: 1500, variant: null, zone: "Ouaga 2000", landmark: "Près de la Pharmacie du Rond-point", phone: "70 55 20 41", deliveryType: "standard", fee: 1000, mode: "A" };

function Buyer() {
  const A = useApp();
  const cur = A.stacks.buyer[A.stacks.buyer.length - 1];
  const S = { product: YProduct, location: YLocation, delivery: YDelivery, pay: YPay, done: YDone, track: YTrack, order: YOrder, cercle: YCercle, join: YJoin }[cur.s] || YProduct;
  return <div className="phone appLight appY"><Band /><S cur={cur} /></div>;
}

function YProduct() {
  const A = useApp(); const p = A.S.products[YD.pid]; const sub = p.B + YD.markup;
  const [insp, setInsp] = useState(false); const [gift, setGift] = useState(false); const [, force] = useState(0);
  const rules = p.cat === "Chaussures" ? ["Modèle et pointure sur l’étiquette", "Paire complète, état visible", "Pas d’essayage à la porte — la pointure étiquetée fait foi"]
    : p.sealed ? ["Emballage extérieur et sceau fabricant intacts", "Nom, variante, date de péremption lisibles", "Le sceau ne s’ouvre qu’après paiement"]
    : ["Article et couleur conformes à la photo", "Étiquette de taille vérifiable", "Quantité et état visible — pas d’essayage à la porte"];
  return (<>
    <Top title="Chez Aïcha Mode ✓" sub="Lien sécurisé · vendeuse de confiance" back={() => A.setApp("launcher")} right={<button className="chip" onClick={() => A.push("buyer", { s: "track" })}>📦 Suivi</button>} />
    <div className="scroll">
      <Art p={p} h={210} size={78} />
      <div className="h1 mt12">{p.name}</div>
      <div className="h1 num" style={{ color: "var(--deep)" }}>{F(sub)}</div>
      <div className="chips mt8">
        <span className="chip">🛵 Livraison dès 1 000 F</span>
        <span className="chip">✔ En stock ({p.stock})</span>
        <button className="chip" onClick={() => setInsp(true)}>🔍 Vérifiez avant d’accepter</button>
      </div>
      <button className="chip mt8" onClick={() => A.push("buyer", { s: "cercle" })}>👥 Voir le Cercle d’Aïcha →</button>
      {(p.hub || p.qcHold) && (
        <div className="chips mt8">
          {p.hub && SELLERS[p.seller].tier === "diaspora" && <span className="chip">🌍 Sélection diaspora · vérifié au hub</span>}
          {p.pack && <span className="chip">🍲 Pack — finance sa livraison en solo ✓</span>}
          {p.pack && <button className="chip" onClick={() => setGift(true)}>🎁 Offrir à ma famille</button>}
          {p.qcHold && <span className="chip" style={{ borderColor: "#B3261E", color: "#B3261E" }}>⚠ Contrôle qualité en cours</span>}
        </div>
      )}
      {A.S.cercle.campaign && A.S.cercle.campaign.pid === YD.pid && A.S.cercle.campaign.state === "ACTIVE" && campLeft(A.S.cercle.campaign) > 0 && (
        <div className="note mt8">📍 <b>Campagne Quartier :</b> livraison {F(A.S.cercle.campaign.customerShare)} {A.S.cercle.campaign.window.toLowerCase()} à {A.S.cercle.campaign.zone} · {campLeft(A.S.cercle.campaign)} place(s) restante(s).</div>
      )}
      <div className="note mt12">🛡️ Votre paiement est <b>protégé auprès de notre partenaire de paiement</b> jusqu’à la confirmation de votre livraison.</div>
      {p.sizes && (<>
        <div className="cap mt16 mb6">Taille</div>
        <div className="chips">{p.sizes.map((s) => <button key={s} className={"chip " + (YD.variant === s ? "chipOn" : "")} onClick={() => { YD.variant = s; force((x) => x + 1); }}>{s}</button>)}</div>
      </>)}
      <div className="mt12"><VoiceBtn /></div>
    </div>
    <div className="stick"><button className="btn pri" disabled={(p.sizes && !YD.variant) || p.qcHold} onClick={() => A.push("buyer", { s: "location" })}>{p.qcHold ? "Suspendu — contrôle qualité (Signal du propriétaire)" : p.sizes && !YD.variant ? "Choisissez une taille" : "Acheter — " + F(sub)}</button></div>
    <Sheet open={insp} onClose={() => setInsp(false)} title="À la livraison, prenez le temps de vérifier :">
      {rules.map((r, i) => <div key={i} className="p" style={{ padding: "5px 0" }}>• {r}</div>)}
      <div className="note mt12">Refus justifié (mauvais article, dommage) → vous êtes protégé·e. Changement d’avis → frais de livraison non remboursés.</div>
    </Sheet>
    <Sheet open={gift} onClose={() => setGift(false)} title="🎁 Offrez ce pack à votre famille">
      <div className="p">Vous vivez à l’étranger ? Payez le pack en entier maintenant — Séra le livre à votre famille à Ouagadougou et <b>vous recevez la photo de livraison</b>.</div>
      <div className="note mt12">Mode cadeau = <b>prépaiement complet uniquement</b> (jamais de paiement à la porte pour un cadeau). Chaque pack offert est une livraison Séra dans les zones denses.</div>
      <button className="btn pri mt16" onClick={() => { YD.mode = "A"; setGift(false); A.toast("Mode cadeau : prépaiement complet · photo envoyée au payeur à l’étranger"); A.push("buyer", { s: "location" }); }}>Continuer — commander en cadeau</button>
    </Sheet>
  </>);
}

function YLocation() {
  const A = useApp(); const [, force] = useState(0);
  return (<>
    <Top title="Livraison" sub="Étape 1/3 — où vous trouver" back={() => A.pop("buyer")} />
    <div className="scroll">
      <div className="cap mb6">Quartier (Ouagadougou)</div>
      <div className="chips">{ZONES.map((z) => <button key={z} className={"chip " + (YD.zone === z ? "chipOn" : "")} onClick={() => { YD.zone = z; force((x) => x + 1); }}>{z}</button>)}</div>
      <div className="field"><label className="cap">Repère (pas d’adresse exigée)</label><input defaultValue={YD.landmark} onChange={(e) => (YD.landmark = e.target.value)} /></div>
      <div className="field"><label className="cap">Votre téléphone</label><input inputMode="tel" defaultValue={YD.phone} onChange={(e) => (YD.phone = e.target.value)} /></div>
      <div className="field"><label className="cap">Instructions (facultatif)</label><input placeholder="Ex. appeler en arrivant au carrefour" /></div>
      <div className="note mt12">Le livreur vous appelle via un <b>relais masqué</b> — votre numéro n’est jamais montré.</div>
    </div>
    <div className="stick"><button className="btn pri" onClick={() => A.push("buyer", { s: "delivery" })}>Continuer</button></div>
  </>);
}

function YDelivery() {
  const A = useApp(); const p = A.S.products[YD.pid]; const sub = p.B + YD.markup;
  const freeOk = sub >= 15000 && ["Ouaga 2000", "Gounghin"].includes(YD.zone);
  const camp = A.S.cercle.campaign;
  const campApplies = camp && camp.pid === YD.pid;
  const campLeftN = campLeft(camp);
  const campOk = campApplies && camp.state === "ACTIVE" && campLeftN > 0 && YD.zone === camp.zone;
  const [, force] = useState(0);
  const Opt = ({ k, t, s, f, dis, reason }) => (
    <button className="card" disabled={dis} style={{ width: "100%", textAlign: "left", font: "inherit", cursor: dis ? "default" : "pointer", opacity: dis ? 0.55 : 1, borderColor: YD.deliveryType === k ? "var(--pri)" : "var(--line)", borderWidth: YD.deliveryType === k ? 2 : 1 }}
      onClick={() => { YD.deliveryType = k; YD.fee = f; force((x) => x + 1); }}>
      <div className="row"><div className="h3">{t}</div><b className="num">{f === 0 ? "Offerte" : F(f)}</b></div>
      <div className="sub mt8">{s}</div>
      {dis && <div className="sub mt8" style={{ color: "var(--deep)" }}>{reason}</div>}
    </button>
  );
  return (<>
    <Top title="Livraison" sub="Étape 2/3 — quand" back={() => A.pop("buyer")} />
    <div className="scroll">
      <div className="list">
        {campApplies && (
          <Opt k="cercle" t={"Cercle d’Aïcha — " + camp.window + " à " + camp.zone} s={"Campagne financée par la revendeuse : la cliente paie " + (camp.customerShare === 0 ? "0 F" : F(camp.customerShare)) + ", Séra reçoit 1 000 F au complet. " + campLeftN + " place(s) restante(s)."} f={camp.customerShare} dis={!campOk}
            reason={camp.state !== "ACTIVE" ? "Campagne en pause" : campLeftN <= 0 ? "Budget de campagne épuisé — la promesse s’arrête avant le découvert" : "Réservée au quartier " + camp.zone + " — votre zone : " + YD.zone} />
        )}
        <Opt k="standard" t="Standard — aujourd’hui 16 h – 18 h" s="Livreur Séra identifié, colis scellé." f={1000} />
        <Opt k="express" t="Express — en moins de 90 min" s="Priorité de tournée." f={1500} />
        <Opt k="free" t="Offerte — demain 10 h – 12 h" s="Tournée groupée des zones denses." f={0} dis={!freeOk}
          reason={sub < 15000 ? "Dès 15 000 F d’achats — votre panier : " + F(sub) : "Zones éligibles : Ouaga 2000, Gounghin"} />
      </div>
      <div className="note warnNote mt12">En cas d’absence au créneau sans prévenir, les frais de livraison ne sont pas remboursés.</div>
    </div>
    <div className="stick"><button className="btn pri" onClick={() => A.push("buyer", { s: "pay" })}>Continuer — {YD.fee === 0 ? "livraison offerte" : F(YD.fee)}</button></div>
  </>);
}

function YPay() {
  const A = useApp(); const p = A.S.products[YD.pid]; const sel = SELLERS[p.seller];
  const sub = p.B + YD.markup; const total = sub + YD.fee;
  const freeCamp = YD.deliveryType === "cercle" && YD.fee === 0;
  const bOk = sel.tier !== "provisional" && sub <= 25000 && !freeCamp;
  const [, force] = useState(0); const [sheet, setSheet] = useState(false); const [pstate, setPstate] = useState("idle");
  const nowDue = YD.mode === "A" ? total : YD.fee;
  const laterDue = YD.mode === "A" ? 0 : sub;
  const OptCard = ({ k, t, body, warn, dis, reason, badge }) => (
    <button className="card" disabled={dis} style={{ width: "100%", textAlign: "left", font: "inherit", cursor: dis ? "default" : "pointer", opacity: dis ? 0.55 : 1, borderColor: YD.mode === k && !dis ? "var(--pri)" : "var(--line)", borderWidth: YD.mode === k && !dis ? 2 : 1 }}
      onClick={() => { YD.mode = k; force((x) => x + 1); }}>
      <div className="row"><div className="h3">{t}</div>{badge}</div>
      <div className="sub mt8">{body}</div>
      {warn && <div className="sub mt8" style={{ color: "#7A5104" }}>{warn}</div>}
      {dis && <div className="sub mt8" style={{ color: "var(--deep)", fontWeight: 700 }}>{reason}</div>}
    </button>
  );
  const payNow = () => {
    setPstate("pending");
    setTimeout(() => {
      setPstate("ok");
      setTimeout(() => {
        const code = "CMD-" + SEQ++; const id = "o" + code;
        const drop = String(1000 + Math.floor(Math.random() * 9000));
        const isCamp = YD.deliveryType === "cercle" && A.S.cercle.campaign && A.S.cercle.campaign.pid === YD.pid;
        const hub = !!A.S.products[YD.pid].hub;
        const o = mkOrder({ id, code, pid: YD.pid, mode: YD.mode, variant: YD.variant, markup: YD.markup, fee: YD.fee, deliveryType: YD.deliveryType,
          ...(isCamp ? { campaignId: A.S.cercle.campaign.id, camp: A.S.cercle.campaign.K } : {}),
          status: hub ? "READY" : "FUNDED", dropCode: drop, challenge: (hub ? "HUB-" : "WK-") + (100 + Math.floor(Math.random() * 900)),
          buyer: { name: "Awa Kaboré", zone: YD.zone, landmark: YD.landmark, phone: YD.phone },
          history: [{ ts: now(), l: YD.mode === "B" ? "Frais de livraison payés (" + F(YD.fee) + ") — protégés chez le partenaire" : "Payé en entier (" + F(total) + ") — protégé chez le partenaire" }] });
        A.d({ t: "NEW", o }); A.d({ t: "STOCK", pid: YD.pid, d: -1 });
        if (isCamp) A.d({ t: "ORD", id, p: {}, h: "Avantage Cercle appliqué : livraison " + F(YD.fee) + " (campagne d’Aïcha finance " + F(A.S.cercle.campaign.K) + " — Séra reçoit 1 000 F au complet)" });
        if (hub) A.d({ t: "ORD", id, p: {}, h: "Stock au hub — déjà contrôlé à l’intake · préparé et prêt pour l’enlèvement Séra (mise en vente ≤ 72 h)" });
        setSheet(false); setPstate("idle");
        A.reset2("buyer", [{ s: "product" }, { s: "done", id }]);
      }, 900);
    }, 1700);
  };
  return (<>
    <Top title="Paiement" sub="Étape 3/3 — comme vous préférez" back={() => A.pop("buyer")} />
    <div className="scroll">
      <div className="list">
        <OptCard k="A" t="Tout payer maintenant" badge={<Pill k="pOk">Recommandé</Pill>}
          body="Votre paiement est protégé auprès de notre partenaire de paiement jusqu’à la confirmation de votre livraison. Le vendeur n’est payé qu’après validation." />
        <OptCard k="B" t="Payer le produit à la livraison" dis={!bOk}
          reason={sel.tier === "provisional" ? "Indisponible — vendeur en période d’essai (prépaiement uniquement)" : freeCamp ? "Livraison offerte par la campagne — prépaiement uniquement (règle Cercle)" : "Indisponible au-delà de 25 000 F"}
          body={"Payez seulement les frais de livraison (" + (YD.fee === 0 ? "0 F" : F(YD.fee)) + ") maintenant. À l’arrivée du livreur, vérifiez votre article, puis payez le produit de manière sécurisée avant de le recevoir."}
          warn="Frais de livraison non remboursables si vous annulez ou êtes absent(e)." />
      </div>
      <div className="card mt16">
        <MoneyLines lines={[{ l: "À payer maintenant", v: F(nowDue) }, { l: "À payer à la livraison", v: F(laterDue) }]} total={{ l: "Total", v: F(total) }} />
      </div>
      <div className="sub mt8" style={{ textAlign: "center" }}>Jamais d’argent liquide au livreur · jamais sur un compte personnel.</div>
    </div>
    <div className="stick"><button className="btn pri" onClick={() => { setPstate("idle"); setSheet(true); }}>Payer {F(nowDue)} — Orange Money</button></div>
    <Sheet open={sheet} onClose={() => pstate === "idle" && setSheet(false)} title="Orange Money">
      {pstate === "idle" && (<>
        <div className="ml"><span>Vous payez maintenant</span><b className="num">{F(nowDue)}</b></div>
        <div className="field"><label className="cap">Numéro Orange Money</label><input inputMode="tel" defaultValue={YD.phone} /></div>
        <div className="sub mt8">Vous confirmez sur votre téléphone avec votre code secret (simulation).</div>
        <button className="btn pri mt16" onClick={payNow}>Confirmer le paiement</button>
      </>)}
      {pstate === "pending" && <div style={{ textAlign: "center", padding: "22px 0" }}><div className="h2 blink">⏳ Demande envoyée…</div><div className="sub mt8">Composez votre code secret Orange Money (simulation)</div></div>}
      {pstate === "ok" && <div style={{ textAlign: "center", padding: "22px 0" }}><div style={{ fontSize: 52 }}>✅</div><div className="h2 mt8">Paiement protégé</div><div className="sub mt8">Reçu chez notre partenaire de paiement.</div></div>}
    </Sheet>
  </>);
}

function YDone({ cur }) {
  const A = useApp(); const o = A.S.orders[cur.id]; if (!o) return null;
  return (<>
    <Top title="Commande confirmée" back={() => A.reset("buyer", { s: "product" })} />
    <div className="scroll" style={{ textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={{ fontSize: 60 }}>🎉</div>
      <div className="h1 mt12">{o.code}</div>
      <div className="sub mt8">Le vendeur prépare votre article. Le livreur Séra le <b>vérifie et le scelle</b> avant la route.{o.mode === "B" ? " Vous paierez le produit à la porte, après inspection." : ""}</div>
      <button className="btn pri mt20" onClick={() => A.reset2("buyer", [{ s: "product" }, { s: "track" }, { s: "order", id: o.id }])}>Suivre ma commande</button>
    </div>
  </>);
}

function YTrack() {
  const A = useApp();
  return (<>
    <Top title="Mes commandes" back={() => A.pop("buyer")} />
    <div className="scroll"><div className="list">
      {A.S.buyerIds.map((id) => { const o = A.S.orders[id]; if (!o) return null; const p = A.S.products[o.pid]; return (
        <button key={id} className="tile" onClick={() => A.push("buyer", { s: "order", id })}>
          <div style={{ padding: 12 }} className="row">
            <Art p={p} h={48} size={22} radius={12} />
            <div style={{ flex: 1, marginLeft: 4 }}><div className="h3">{o.code}</div><div className="sub">{p.name}</div></div>
            <StatusPill s={o.status} />
          </div>
        </button>); })}
    </div></div>
  </>);
}

function YOrder({ cur }) {
  const A = useApp(); const o = A.S.orders[cur.id]; if (!o) return null;
  const p = A.S.products[o.pid]; const sub = p.B + o.markup;
  const [pb, setPb] = useState(false); const [rv, setRv] = useState(false); const [stars, setStars] = useState(5); const [rvTxt, setRvTxt] = useState("Conforme à la photo, livraison impeccable.");
  const rules = p.cat === "Chaussures" ? ["Modèle + pointure étiquetée", "Paire complète", "État visible"] : p.sealed ? ["Sceau fabricant intact", "Variante + péremption lisibles"] : ["Article + couleur conformes", "Étiquette de taille", "État visible, pièces complètes"];
  const accept = () => {
    if (o.mode === "B") A.d({ t: "ORD", id: o.id, p: { status: "AWAIT_PAY" }, h: "Article accepté après inspection — paiement du produit demandé" });
    else A.d({ t: "ORD", id: o.id, p: { status: "HANDOFF" }, h: "Article accepté après inspection — remise autorisée" });
  };
  const payDoor = () => {
    A.d({ t: "ORD", id: o.id, p: { status: "PAY_PENDING" }, h: "Paiement client envoyé — en attente de confirmation opérateur" });
    setTimeout(() => A.d({ t: "ORD", id: o.id, p: { status: "PAY_OK" }, h: "Paiement confirmé par le partenaire ✓" }), 2000);
  };
  return (<>
    <Top title={o.code} back={() => A.pop("buyer")} right={<StatusPill s={o.status} />} />
    <div className="scroll">
      <div className="card row"><Art p={p} h={52} size={24} radius={12} /><div style={{ flex: 1 }}><div className="h3">{p.name}{o.variant ? " · " + o.variant : ""}</div><div className="sub">Chez Aïcha Mode ✓ · {o.buyer.zone}</div></div></div>
      {o.status === "INSPECT" && (
        <div className="card mt12">
          <div className="h3">Le livreur est là — inspectez d’abord</div>
          {rules.map((r, i) => <div key={i} className="p mt8">✔ {r}</div>)}
          <button className="btn pri mt12" onClick={accept}>J’accepte l’article</button>
          <button className="btn ghost mt8" onClick={() => setPb(true)}>Signaler un problème</button>
        </div>
      )}
      {o.status === "AWAIT_PAY" && (
        <div className="card mt12">
          <div className="cap">À payer avant de recevoir</div>
          <div className="h1 num mt8">{F(sub)}</div>
          <div className="sub mt8">Orange Money → marchand <b>Ma Boutique</b>. Jamais d’espèces, jamais sur le numéro du livreur.</div>
          <button className="btn pri mt12" onClick={payDoor}>Payer {F(sub)} maintenant</button>
        </div>
      )}
      {o.status === "PAY_PENDING" && <div className="note warnNote mt12 blink">⏳ Confirmation de l’opérateur en cours — le livreur garde le colis scellé.</div>}
      {o.status === "PAY_OK" && (
        <div className="note mt12">✅ Paiement confirmé. Le livreur autorise la remise.
          <button className="chip mt8" onClick={() => A.setApp("sera")}>Voir côté livreur →</button>
        </div>
      )}
      {o.status === "HANDOFF" && (
        <div className="card mt12" style={{ textAlign: "center", borderColor: "var(--pri)", borderWidth: 2 }}>
          <div className="cap">Donnez ce code au livreur</div>
          <div className="h1 num" style={{ fontSize: 40, letterSpacing: ".2em" }}>{o.dropCode}</div>
          <div className="sub">Uniquement en main propre, colis reçu.</div>
        </div>
      )}
      {["DELIVERED", "PAID"].includes(o.status) && (
        <div className="note mt12">🎊 Livré ! Merci Awa.
          {!o.flags.reviewed && <button className="chip mt8" onClick={() => setRv(true)}>⭐ Laisser un avis vérifié</button>}
          {o.flags.reviewed && <span> Votre avis vérifié est publié dans le Cercle ✓</span>}
          <button className="chip mt8" onClick={() => { A.setApp("mb"); A.reset("mb", { s: "onboard", step: 0 }); }}>Devenir revendeuse ?</button>
        </div>
      )}
      <div className="card mt12"><div className="cap mb6">Suivi</div><Timeline o={o} buyer /></div>
      <button className="chip mt12" onClick={() => A.toast("Assistance : réponse sous 2 h (démo)")}>Un souci ? Assistance</button>
    </div>
    <Sheet open={pb} onClose={() => setPb(false)} title="Signaler un problème">
      {["Mauvais article", "Taille différente de l’étiquette", "Article endommagé", "Autre"].map((r) => (
        <button key={r} className="btn ghost mt8" onClick={() => {
          setPb(false);
          A.d({ t: "ORD", id: o.id, p: { status: "SELLER_RETURN" }, h: "Problème signalé : " + r + " — remboursement lancé, retour au vendeur" });
          A.d({ t: "CLAIM", c: { id: "c" + Date.now(), code: o.code, fault: "seller", label: r + " (inspection porte)", amount: 1200, state: "Ouverte" } });
          A.toast("Remboursement lancé — vous êtes protégé·e");
        }}>{r}</button>
      ))}
      <div className="sub mt12">Le refus justifié est aussi simple que l’acceptation — c’est votre droit.</div>
    </Sheet>
    <Sheet open={rv} onClose={() => setRv(false)} title="Avis vérifié — achat livré ✓">
      <div className="sub">Seules les commandes livrées et validées produisent un avis vérifié. Le vôtre l’est.</div>
      <div className="row mt12" style={{ justifyContent: "center", gap: 6 }}>
        {[1, 2, 3, 4, 5].map((s) => <button key={s} className="chip" style={{ fontSize: 20, padding: "8px 10px", borderColor: s <= stars ? "var(--pri)" : "var(--line)" }} onClick={() => setStars(s)}>{s <= stars ? "★" : "☆"}</button>)}
      </div>
      <div className="chips mt12">
        {["Conforme à la photo, livraison impeccable.", "Vérifiée devant moi avant de payer.", "Belle qualité, je recommande."].map((t) => (
          <button key={t} className={"chip " + (rvTxt === t ? "chipOn" : "")} onClick={() => setRvTxt(t)}>{t}</button>
        ))}
      </div>
      <button className="btn pri mt16" onClick={() => {
        A.d({ t: "REVIEW", r: { n: "Awa K.", pid: o.pid, stars, t: rvTxt, d: "à l’instant" } });
        A.d({ t: "ORD", id: o.id, p: { flags: { ...o.flags, reviewed: true } }, h: "Avis vérifié publié — Achat vérifié · Livré par Séra" });
        setRv(false); A.toast("Avis vérifié publié dans le Cercle d’Aïcha ✓");
      }}>Publier — Achat vérifié · Livré par Séra</button>
    </Sheet>
  </>);
}

/* ---------------------------------- SÉRA ---------------------------------- */
const DELIV_ST = ["TRANSIT", "ARRIVED", "INSPECT", "AWAIT_PAY", "PAY_PENDING", "PAY_OK", "HANDOFF", "RETURNING", "SELLER_RETURN"];
const riderTasks = (A) => ({
  pick: Object.values(A.S.orders).filter((o) => o.status === "READY"),
  del: Object.values(A.S.orders).filter((o) => DELIV_ST.includes(o.status)),
});

function Sera() {
  const A = useApp();
  const cur = A.stacks.sera[A.stacks.sera.length - 1];
  const S = { home: SHome, pickup: SPickup, deliver: SDeliver, safety: SSafety, profile: SProfile }[cur.s] || SHome;
  const showTabs = ["home", "safety", "profile"].includes(cur.s);
  return (
    <div className="phone appS">
      <Band />
      <S cur={cur} />
      {showTabs && <Tabs items={[{ s: "home", i: "🧭", l: "Missions" }, { s: "safety", i: "🆘", l: "Sécurité" }, { s: "profile", i: "👤", l: "Moi" }]} cur={cur.s} onGo={(s) => A.reset("sera", { s })} />}
    </div>
  );
}

function SHome() {
  const A = useApp(); const [on, setOn] = useState(true);
  const { pick, del } = riderTasks(A);
  const Row = ({ o, kind }) => { const p = A.S.products[o.pid]; const who = kind === "pick" ? SELLERS[p.seller] : null; return (
    <button className="tile" onClick={() => A.push("sera", { s: kind === "pick" ? "pickup" : "deliver", id: o.id })}>
      <div style={{ padding: 13 }} className="row">
        <div style={{ flex: 1 }}>
          <div className="h3">{kind === "pick" ? "Enlèvement" : "Livraison"} · {o.code}</div>
          <div className="sub">{kind === "pick" ? who.name + " · " + who.zone : o.buyer.zone + " · " + o.buyer.landmark}</div>
          {o.mode === "B" && kind !== "pick" && <div className="sub" style={{ color: "var(--pri)", fontWeight: 700 }}>À encaisser à la porte : {F(A.S.products[o.pid].B + o.markup)} (Mobile Money)</div>}
        </div>
        <StatusPill s={o.status} />
      </div>
    </button>); };
  return (<>
    <Top title="Séra" sub="Issa Ouédraogo · moto SÉR-M03" right={<button className={"chip " + (on ? "chipOn" : "")} onClick={() => { setOn(!on); A.toast(on ? "Service terminé — position non collectée hors service" : "En service — bonne route Issa"); }}>{on ? "En service" : "Hors service"}</button>} />
    <div className="scroll">
      <div className="card">
        <div className="row"><div className="h3">🔋 Batterie moto</div><b className="num">78 %</b></div>
        <div className="gauge mt8"><div className="gaugeF" style={{ width: "78%" }} /></div>
        <div className="sub mt8">Autonomie ≈ 46 km · point de recharge : dépôt Gounghin</div>
      </div>
      {on ? (<>
        <div className="cap mt16 mb6">Enlèvements ({pick.length})</div>
        <div className="list">{pick.length ? pick.map((o) => <Row key={o.id} o={o} kind="pick" />) : <div className="card sub">Aucun enlèvement — dès qu’un vendeur confirme « Produit prêt », la mission apparaît ici.</div>}</div>
        <div className="cap mt16 mb6">Livraisons ({del.length})</div>
        <div className="list">{del.length ? del.map((o) => <Row key={o.id} o={o} kind="del" />) : <div className="card sub">Aucune livraison en cours.</div>}</div>
      </>) : <div className="card mt16 sub">Vous êtes hors service. Les missions sont assignées par la régulation humaine — jamais d’auto-attribution.</div>}
      <div className="note mt16">🛡️ Vous ne touchez jamais l’argent du produit. Paiement Mobile Money confirmé par l’opérateur avant toute remise.</div>
      <button className="chip mt12" onClick={() => A.toast("Régulation : « Bien reçu Issa, on te suit » (démo)")}>💬 Contacter la régulation</button>
    </div>
  </>);
}

function SPickup({ cur }) {
  const A = useApp(); const o = A.S.orders[cur.id]; if (!o) return null;
  const p = A.S.products[o.pid]; const sel = SELLERS[p.seller];
  const [st, setSt] = useState(0); const [chk, setChk] = useState({}); const [ref, setRef] = useState(false); const [shot, setShot] = useState(false);
  if (o.status !== "READY") return (<>
    <Top title={o.code} back={() => A.reset("sera", { s: "home" })} />
    <div className="scroll"><div className="note">Cette mission a évolué — statut : {STATUS_FR[o.status][0]}.</div></div>
  </>);
  const items = ["Référence " + o.code, "Article : " + p.name, o.variant ? "Variante / taille : " + o.variant : "Variante conforme", "Couleur conforme à la fiche", "Quantité : 1", "État visible sans dommage", p.sealed ? "Sceau fabricant intact" : "Pièces complètes"];
  const allOk = items.every((_, i) => chk[i] === true);
  const anyNo = items.some((_, i) => chk[i] === false);
  const cyc = (i) => setChk((c) => ({ ...c, [i]: c[i] === undefined ? true : c[i] === true ? false : undefined }));
  const refuse = (r) => {
    setRef(false);
    A.d({ t: "ORD", id: o.id, p: { status: "PICKUP_REFUSED" }, h: "Prise en charge refusée : " + r + " — client remboursé, pas d’aller-retour inutile" });
    A.d({ t: "CLAIM", c: { id: "c" + Date.now(), code: o.code, fault: "seller", label: r + " (enlèvement)", amount: 1400, state: "Ouverte" } });
    A.d({ t: "TRUST", l: sel.name + " : faute — " + r });
    A.toast("Client remboursé automatiquement"); A.toast("Coût couvert par le fonds de protection");
    A.reset("sera", { s: "home" });
  };
  const seal = () => {
    const sid = "SÉR-" + (8800 + (+o.code.slice(-2) || 41));
    A.d({ t: "ORD", id: o.id, p: { status: "TRANSIT", sealId: sid }, h: "Vérifié ✓ · scellé " + sid + " — garde transférée à Séra" });
    A.toast("Garde Séra active — une seule main responsable");
    A.reset2("sera", [{ s: "home" }, { s: "deliver", id: o.id }]);
  };
  return (<>
    <Top title={"Enlèvement · " + o.code} back={() => A.reset("sera", { s: "home" })} />
    <div className="scroll">
      {st === 0 && (<>
        <div className="card">
          <div className="h3">{sel.name}</div>
          <div className="sub mt8">{sel.zone} · {sel.landmark}</div>
          <div className="row mt12"><Pill k={sel.tier === "provisional" ? "pWarn" : "pOk"}>{TIER_FR[sel.tier]}</Pill>{o.mode === "B" && <Pill k="pWarn">Produit payé à la porte</Pill>}</div>
          <button className="chip mt12" onClick={() => A.toast("Appel vendeur via relais masqué (démo)")}>📞 Appeler (relais)</button>
        </div>
        <div className="card mt12">
          <div className="cap mb6">Commande verrouillée</div>
          <div className="p">{p.name}{o.variant ? " · " + o.variant : ""} · qté 1</div>
          <div className="sub mt8">Code de préparation attendu près du colis : <b>{o.challenge}</b></div>
        </div>
        <button className="btn pri mt16" onClick={() => setSt(1)}>Je suis arrivé chez le vendeur</button>
      </>)}
      {st === 1 && (<>
        <div className="note">Vous vérifiez la <b>conformité visible</b> — jamais l’authenticité ni la qualité. Objectif : 2 à 4 minutes.</div>
        <div className="list mt12">
          {items.map((it, i) => (
            <button key={i} className="check" onClick={() => cyc(i)}>
              <span className={"ckB " + (chk[i] === true ? "ckOk" : chk[i] === false ? "ckNo" : "")}>{chk[i] === true ? "✓" : chk[i] === false ? "✗" : ""}</span>
              <span className="p" style={{ flex: 1, textAlign: "left" }}>{it}</span>
            </button>
          ))}
        </div>
        <button className="btn pri mt16" disabled={!allOk} onClick={() => setSt(2)}>Conforme — appliquer le scellé</button>
        <button className="btn danger mt8" disabled={!anyNo} onClick={() => setRef(true)}>Refuser la prise en charge</button>
      </>)}
      {st === 2 && (<>
        <div className="card" style={{ textAlign: "center", borderColor: "var(--pri)", borderWidth: 2 }}>
          <div className="cap">Scellé Séra à appliquer</div>
          <div className="h1" style={{ fontSize: 34 }}>{"SÉR-" + (8800 + (+o.code.slice(-2) || 41))}</div>
          <div className="sub">Inviolable · enregistré avant la garde</div>
        </div>
        {shot ? <div className="note mt12">✅ Photo du colis scellé enregistrée.</div> : <button className="btn sec mt12" onClick={() => setShot(true)}>📸 Photo du colis scellé</button>}
        <button className="btn pri mt12" disabled={!shot} onClick={seal}>Enregistrer le scellé & prendre en charge</button>
        <div className="sub mt8" style={{ textAlign: "center" }}>La garde Séra commence seulement après vérification + scellé.</div>
      </>)}
    </div>
    <Sheet open={ref} onClose={() => setRef(false)} title="Motif du refus (structuré)">
      {["Article épuisé pour le moment", "Mauvaise variante / taille", "Dommage visible", "Emballage non prêt", "Vendeur absent"].map((r) => (
        <button key={r} className="btn ghost mt8" onClick={() => refuse(r)}>{r}</button>
      ))}
      <div className="sub mt12">Le refus à l’enlèvement évite un aller-retour inutile : le client est remboursé tout de suite.</div>
    </Sheet>
  </>);
}

function SDeliver({ cur }) {
  const A = useApp(); const o = A.S.orders[cur.id]; if (!o) return null;
  const p = A.S.products[o.pid]; const sub = p.B + o.markup; const c = calc(p.B, p.C, o.markup);
  const [sim, setSim] = useState("norm"); const [delayed, setDelayed] = useState(false);
  const [bg, setBg] = useState(false); const [bgSt, setBgSt] = useState(0); const [left, setLeft] = useState(300);
  const [refS, setRefS] = useState(false);
  const alive = useRef(true); useEffect(() => () => { alive.current = false; }, []);
  useEffect(() => { if (bg && bgSt === 0) { const t = setTimeout(() => alive.current && setBgSt(1), 2000); return () => clearTimeout(t); } }, [bg, bgSt]);
  useEffect(() => { if (bg && bgSt === 2) { const iv = setInterval(() => alive.current && setLeft((l) => Math.max(0, l - 1)), 1000); return () => clearInterval(iv); } }, [bg, bgSt]);
  const mmss = Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0");
  const ord = (patch, h) => A.d({ t: "ORD", id: o.id, p: patch, h });
  const saidPaid = () => {
    const chosen = sim;
    ord({ status: "PAY_PENDING" }, "Paiement client signalé — vérification opérateur en cours");
    setTimeout(() => {
      if (chosen === "norm") { ord({ status: "PAY_OK" }, "Confirmation opérateur reçue ✓"); A.toast("Paiement confirmé par le partenaire"); }
      else if (alive.current) setDelayed(true);
    }, 2200);
  };
  const consume = () => {
    ord({ status: "PAY_OK" }, "Autorisation signée AUT-2291 consommée (break-glass) — incident INC-118");
    A.d({ t: "BG", e: { id: "AUT-2291", code: o.code, ref: "INC-118", label: "Confirmation retardée — vérifiée sur l’interface opérateur", state: "Consommée · revue obligatoire", by: "Mariam (régulation)" } });
    setBg(false); setDelayed(false); A.toast("Remise autorisée par la régulation — revue d’incident ouverte");
  };
  const refuse = (r, fault) => {
    setRefS(false);
    if (fault === "buyer") {
      ord({ status: "RETURNING" }, "Refus client (" + r + ") — frais de livraison conservés · retour scellé RET-1104");
      A.d({ t: "CLAIM", c: { id: "c" + Date.now(), code: o.code, fault: "buyer", label: r + " (refus porte)", amount: 0, state: "Frais conservés" } });
      A.toast("Frais conservés · éligibilité du client ajustée");
    } else {
      ord({ status: "SELLER_RETURN" }, "Défaut constaté (" + r + ") — client remboursé · retour au vendeur");
      A.d({ t: "CLAIM", c: { id: "c" + Date.now(), code: o.code, fault: "seller", label: r + " (porte)", amount: 1200, state: "Ouverte" } });
      A.toast("Client remboursé — fonds de protection");
    }
  };
  const rules = p.cat === "Chaussures" ? ["Modèle + pointure étiquetée", "Paire complète, état visible", "Pas d’essayage"] : p.sealed ? ["Sceau fabricant intact — ne pas ouvrir avant paiement", "Variante + péremption lisibles"] : ["Article + couleur conformes", "Étiquette de taille", "État visible, pièces complètes — pas d’essayage"];
  return (<>
    <Top title={"Livraison · " + o.code} back={() => A.reset("sera", { s: "home" })} right={<StatusPill s={o.status} />} />
    <div className="scroll">
      <div className="card">
        <div className="row"><div className="h3">{o.buyer.name}</div>{o.sealId && <Pill k="pInfo">Scellé {o.sealId}</Pill>}</div>
        <div className="sub mt8">{o.buyer.zone} · {o.buyer.landmark}</div>
        {o.mode === "B" && <div className="sub mt8" style={{ color: "var(--pri)", fontWeight: 700 }}>Dû à la porte : {F(sub)} — Mobile Money uniquement</div>}
      </div>
      {o.status === "TRANSIT" && (<>
        <div className="card mt12 row"><span className="h3">🛵 En route</span><span className="sub num">2,3 km · repère : {o.buyer.landmark.split(",")[0]}</span></div>
        <button className="chip mt12" onClick={() => A.toast("Appel client via relais masqué — numéros privés")}>📞 Prévenir le client (relais)</button>
        <button className="btn pri mt12" onClick={() => ord({ status: "ARRIVED" }, "Livreur arrivé chez la cliente")}>Je suis arrivé</button>
      </>)}
      {o.status === "ARRIVED" && <button className="btn pri mt16" onClick={() => ord({ status: "INSPECT" }, "Inspection avec le client (2–4 min)")}>Commencer l’inspection avec le client</button>}
      {o.status === "INSPECT" && (<>
        <div className="note mt12">Le client vérifie la <b>conformité visible</b>{p.sealed ? " — le sceau fabricant reste fermé avant paiement" : " — pas d’essayage à la porte"}.</div>
        <div className="card mt12">{rules.map((r, i) => <div key={i} className="p" style={{ padding: "4px 0" }}>✔ {r}</div>)}</div>
        <button className="btn pri mt12" onClick={() => o.mode === "B" ? ord({ status: "AWAIT_PAY" }, "Article accepté — paiement du produit demandé avant remise") : ord({ status: "HANDOFF" }, "Article accepté — remise autorisée")}>Le client accepte</button>
        <button className="btn ghost mt8" onClick={() => setRefS(true)}>Le client refuse / problème</button>
        <button className="chip mt8" onClick={() => ord({}, "Allégation de contrefaçon enregistrée — examen humain (le livreur ne tranche pas)") || A.toast("Enregistré pour examen humain")}>⚠ Allégation de contrefaçon</button>
      </>)}
      {["AWAIT_PAY", "PAY_PENDING"].includes(o.status) && (<>
        <div className="card mt12" style={{ textAlign: "center", borderColor: "var(--pri)", borderWidth: 2 }}>
          <div className="cap">Le client paie maintenant</div>
          <div className="h1 num" style={{ fontSize: 34 }}>{F(sub)}</div>
          <div className="sub mt8">Orange Money → marchand <b>Ma Boutique</b>. Jamais d’espèces · jamais sur votre compte · une capture d’écran ne suffit jamais.</div>
        </div>
        {o.status === "AWAIT_PAY" && (<>
          <div className="seg mt12">{[["norm", "Simulation : confirmation normale"], ["slow", "Simulation : retardée"]].map(([k, l]) => <button key={k} className={"segB " + (sim === k ? "segOn" : "")} onClick={() => setSim(k)}>{l}</button>)}</div>
          <button className="btn pri mt12" onClick={saidPaid}>Le client dit avoir payé →</button>
        </>)}
        {o.status === "PAY_PENDING" && !delayed && <div className="note warnNote mt12 blink">⏳ Vérification auprès de l’opérateur… la remise reste bloquée.</div>}
        {o.status === "PAY_PENDING" && delayed && (<>
          <div className="note badNote mt12">Confirmation toujours absente. <b>La remise reste bloquée</b> — ne remettez pas le colis.</div>
          <button className="btn sec mt12" onClick={() => { setBg(true); setBgSt(0); setLeft(300); }}>🛟 Demander l’aide de la régulation</button>
        </>)}
      </>)}
      {o.status === "PAY_OK" && (<>
        <div className="note mt12">✅ Paiement du produit confirmé par l’opérateur.</div>
        <button className="btn pri mt12" onClick={() => ord({ status: "HANDOFF" }, "Remise autorisée — demande du code client")}>Autoriser la remise — code client</button>
      </>)}
      {o.status === "HANDOFF" && (<>
        <div className="h2 mt12" style={{ textAlign: "center" }}>Demandez son code au client</div>
        <Keypad expect={o.dropCode} hint="Le client voit ce code sur son téléphone" onOk={() => {
          ord({ status: "DELIVERED" }, "Code client validé — garde transférée au client · livré ✓");
          A.toast("Livré ✓ — garde transférée");
          setTimeout(() => A.d({ t: "ORD", id: o.id, p: { status: "PAID" }, h: "Versements : vendeur " + F(c.sellerNet) + " · revendeuse " + F(c.rNet) }), 1800);
        }} />
      </>)}
      {["DELIVERED", "PAID"].includes(o.status) && (<>
        <div className="card mt12" style={{ textAlign: "center" }}><div style={{ fontSize: 46 }}>✅</div><div className="h2 mt8">Livré · garde transférée</div><div className="sub mt8">{o.status === "PAID" ? "Versements effectués — vendeur et revendeuse payés." : "Versements en cours…"}</div></div>
        <button className="btn pri mt12" onClick={() => A.reset("sera", { s: "home" })}>Mission suivante</button>
      </>)}
      {["RETURNING", "SELLER_RETURN"].includes(o.status) && (<>
        <div className="note warnNote mt12">Retour au vendeur · nouveau scellé <b>RET-1104</b> — le colis n’est jamais sans responsable.</div>
        <button className="btn pri mt12" onClick={() => ord({ status: "RETURNED" }, "Retour remis au vendeur (double validation) — clôturé")}>Retour remis au vendeur (double clé)</button>
      </>)}
      {o.status === "RETURNED" && <div className="note mt12">Retour clôturé — inspection vendeur validée.</div>}
    </div>
    <Sheet open={refS} onClose={() => setRefS(false)} title="Refus / problème à la porte">
      <div className="cap mb6">Responsabilité client (frais conservés)</div>
      {["Changement d’avis", "Client absent / injoignable", "Solde Mobile Money insuffisant (après délai de 15 min)"].map((r) => <button key={r} className="btn ghost mt8" onClick={() => refuse(r, "buyer")}>{r}</button>)}
      <div className="cap mt16 mb6">Défaut vendeur (client remboursé)</div>
      {["Article non conforme", "Dommage constaté"].map((r) => <button key={r} className="btn ghost mt8" onClick={() => refuse(r, "seller")}>{r}</button>)}
    </Sheet>
    <Sheet open={bg} onClose={() => bgSt !== 2 && setBg(false)} title="Aide régulation — zone sans confirmation">
      {bgSt === 0 && <div style={{ textAlign: "center", padding: "18px 0" }}><div className="h2 blink">🔎 Vérification en cours…</div><div className="sub mt8">Mariam (régulation) consulte l’interface opérateur — pas votre parole, pas une capture.</div></div>}
      {bgSt === 1 && (<>
        <div className="note">✔ Transaction <b>OM-88213</b> vérifiée par Mariam (régulation) sur l’interface opérateur — montant exact {F(sub)} · commande {o.code}.</div>
        <button className="btn pri mt12" onClick={() => setBgSt(2)}>Émettre l’autorisation signée</button>
      </>)}
      {bgSt === 2 && (<>
        <div className="card" style={{ borderColor: "var(--pri)", borderWidth: 2 }}>
          <div className="row"><div className="h3">Autorisation AUT-2291</div><Pill k="pWarn">Expire {mmss}</Pill></div>
          <div className="sub mt8">Liée à : {o.code} · Issa Ouédraogo · {F(sub)} · réf. OM-88213 · <b>usage unique</b>.</div>
          <div className="sub mt8">Incident <b>INC-118</b> ouvert — revue obligatoire après la mission.</div>
        </div>
        <button className="btn pri mt12" disabled={left === 0} onClick={consume}>{left === 0 ? "Expirée — recommencer" : "Utiliser l’autorisation — remise"}</button>
      </>)}
    </Sheet>
  </>);
}

function SSafety() {
  const A = useApp(); const [sos, setSos] = useState(false); const [ack, setAck] = useState(false);
  useEffect(() => { if (sos && !ack) { const t = setTimeout(() => setAck(true), 1500); return () => clearTimeout(t); } }, [sos, ack]);
  return (<>
    <Top title="Sécurité" sub="Toujours accessible, à chaque étape" />
    <div className="scroll">
      <button className="btn danger" style={{ minHeight: 84, fontSize: 19 }} onClick={() => { setAck(false); setSos(true); }}>🆘 SOS — j’ai besoin d’aide</button>
      <div className="sub mt8" style={{ textAlign: "center" }}>Envoie votre position et votre mission à la régulation.</div>
      <div className="card mt16">
        <div className="cap mb6">Check-list départ · aujourd’hui</div>
        <div className="p">✅ Casque · ✅ Freins · ✅ Pneus · ✅ Téléphone chargé · ✅ Scellés en stock</div>
      </div>
      <div className="card mt12">
        <div className="row"><div className="h3">Moto SÉR-M03</div><Pill k="pOk">Entretien à jour</Pill></div>
        <div className="sub mt8">Prochaine révision : 12 juillet · pneu arrière à surveiller.</div>
      </div>
      <div className="note mt12">Votre position n’est collectée qu’en service, sur mission. Jamais en dehors.</div>
    </div>
    <Sheet open={sos} onClose={() => ack && setSos(false)} title="SOS envoyé">
      {!ack ? <div style={{ textAlign: "center", padding: "16px 0" }}><div className="h2 blink">📡 Transmission…</div><div className="sub mt8">Position + mission envoyées à la régulation.</div></div>
        : (<><div className="note">✔ <b>Pris en charge par Mariam (régulation)</b> — restez en sécurité, on vous rappelle immédiatement.</div>
          <button className="btn pri mt12" onClick={() => setSos(false)}>Fermer</button></>)}
    </Sheet>
  </>);
}

function SProfile() {
  const A = useApp();
  const done = Object.values(A.S.orders).filter((o) => ["DELIVERED", "PAID"].includes(o.status)).length;
  return (<>
    <Top title="Issa Ouédraogo" sub="Coursier certifié · depuis mars" />
    <div className="scroll">
      <div className="grid2">
        <div className="card"><div className="cap">Livrées aujourd’hui</div><div className="h2 num mt8">{done}</div></div>
        <div className="card"><div className="cap">Taux 1ʳᵉ présentation</div><div className="h2 num mt8">96 %</div></div>
      </div>
      <div className="card mt12"><div className="h3">Paie</div><div className="sub mt8">Votre salaire est <b>séparé</b> des frais de livraison des clients — jamais un partage de l’argent des colis. Versement le 5 du mois.</div></div>
      <div className="card mt12"><div className="h3">Confidentialité</div><div className="sub mt8">Position : en service uniquement. Coordonnées clients : masquées, expirent après la mission.</div></div>
    </div>
  </>);
}

/* ---------------------------------- OPÉRATIONS ---------------------------------- */
const FAULT_FR = { seller: ["Vendeur", "pBad"], sera: ["Séra", "pWarn"], buyer: ["Client", "pMut"], provider: ["Opérateur", "pInfo"] };
function Ops() {
  const A = useApp();
  const heroB = Object.values(A.S.orders).filter((x) => x.mode === "B").pop();
  const p = heroB ? A.S.products[heroB.pid] : null;
  const sub = heroB ? p.B + heroB.markup : 0;
  const c = heroB ? calc(p.B, p.C, heroB.markup) : null;
  const prodLeg = !heroB ? "—" : ["FUNDED", "READY", "TRANSIT", "ARRIVED", "INSPECT"].includes(heroB.status) ? "Non due — à la porte"
    : heroB.status === "AWAIT_PAY" ? "Demandée au client" : heroB.status === "PAY_PENDING" ? "En attente opérateur ⏳"
    : ["PAY_OK", "HANDOFF", "DELIVERED"].includes(heroB.status) ? "Confirmée ✓" : heroB.status === "PAID" ? "Répartie ✓"
    : ["BUYER_REFUSED", "PICKUP_REFUSED", "RETURNING", "RETURNED", "SELLER_RETURN"].includes(heroB.status) ? "Annulée / non due" : "—";
  const fundState = A.S.fund >= 750000 ? ["SAIN", "pOk"] : A.S.fund >= 650000 ? ["SOUS SURVEILLANCE", "pWarn"] : ["RESTREINT", "pBad"];
  return (
    <div className="phone appLight appO">
      <Band />
      <Top title="Opérations" sub="Supervision humaine · lecture seule (démo)" />
      <div className="scroll">
        <div className="card">
          <div className="row"><div className="h3">🛡️ Fonds de protection</div><Pill k={fundState[1]}>{fundState[0]}</Pill></div>
          <div className="h1 num mt8">{F(A.S.fund)}</div>
          <div className="gauge mt8"><div className="gaugeF" style={{ width: Math.min(100, Math.round(A.S.fund / 9000)) + "%" }} /></div>
          <div className="sub mt8">Capital initial fondateur : 750 000 F · alimenté par les frais (5 % + 20 %). Les remboursements clients ne dépendent <b>jamais</b> du solde ; seul le nouveau volume risqué est freiné.</div>
        </div>
        <div className="cap mt16 mb6">Réclamations (par responsabilité)</div>
        <div className="list">
          {A.S.claims.map((cl) => { const f = FAULT_FR[cl.fault] || ["—", "pMut"]; return (
            <div key={cl.id} className="card">
              <div className="row"><Pill k={f[1]}>{f[0]}</Pill><b className="num">{cl.amount ? F(cl.amount) : "—"}</b></div>
              <div className="p mt8">{cl.code} — {cl.label}</div>
              <div className="sub">{cl.state}{cl.fault === "sera" ? " · responsabilité de garde (dossier séparé du fonds)" : ""}</div>
            </div>); })}
        </div>
        <div className="cap mt16 mb6">Autorisations break-glass</div>
        <div className="list">
          {A.S.bg.map((b) => (
            <div key={b.id + b.ref} className="card">
              <div className="row"><div className="h3">{b.id} · {b.code}</div><Pill k="pWarn">{b.ref}</Pill></div>
              <div className="sub mt8">{b.label} — {b.state} · par {b.by}</div>
            </div>))}
        </div>
        {heroB && (<>
          <div className="cap mt16 mb6">Réconciliation — {heroB.code} (2 jambes)</div>
          <div className="card">
            <div className="ml"><span>Jambe livraison</span><b className="num">{heroB.camp ? F(heroB.fee) + " client + " + F(heroB.camp) + " campagne = " + F(heroB.fee + heroB.camp) + " ✓" : heroB.fee === 0 ? "Offerte (campagne)" : F(heroB.fee) + " ✓"}</b></div>
            <div className="ml"><span>Jambe produit ({F(sub)})</span><b>{prodLeg}</b></div>
            {heroB.status === "PAID" && (<><Line />
              <div className="ml"><span>→ Vendeur</span><b className="num">{F(c.sellerNet)}</b></div>
              <div className="ml"><span>→ Revendeuse (net)</span><b className="num">{F(c.rNet)}</b></div>
              <div className="ml"><span>→ Plateforme (5 % + 20 %)</span><b className="num">{F(c.fee + c.rFee)}</b></div></>)}
          </div>
        </>)}
        <div className="cap mt16 mb6">Éligibilité « paiement à la porte »</div>
        <div className="card">
          <div className="ml"><span>Awa Kaboré</span><Pill k="pOk">Autorisé</Pill></div>
          <div className="ml"><span>Moussa Traoré</span><Pill k="pWarn">Niveau 1 — acompte requis</Pill></div>
          <div className="ml"><span>K. Traoré</span><Pill k="pBad">Prépaiement ×3</Pill></div>
          <div className="sub mt8">Absence honnête ou panne opérateur n’escalade pas — seuls les refus de convenance répétés le font.</div>
        </div>
        <div className="card mt12">
          <div className="row"><div className="h3">Vendeurs en probation</div><Pill k="pWarn">1</Pill></div>
          <div className="sub mt8">Zalissa Créations (provisoire) — 2/3 commandes propres avant le niveau Vérifié. Zéro dépôt exigé.</div>
        </div>
        <div className="card mt12">
          <div className="h3">Campagne livraison offerte</div>
          <div className="gauge mt8"><div className="gaugeF" style={{ width: "31%" }} /></div>
          <div className="sub mt8">46 000 / 150 000 F consommés · règle : offerte seulement si le financement couvre coût + échecs attendus + marge cible.</div>
        </div>
        <div className="card mt12">
          <div className="row"><div className="h3">Campagne Cercle — Chez Aïcha Mode</div><Pill k={A.S.cercle.campaign.state === "ACTIVE" ? (campLeft(A.S.cercle.campaign) > 0 ? "pOk" : "pWarn") : "pMut"}>{A.S.cercle.campaign.state === "ACTIVE" ? (campLeft(A.S.cercle.campaign) > 0 ? "Active" : "Budget épuisé") : "En pause"}</Pill></div>
          <div className="sub mt8">{A.S.cercle.campaign.recipe} · {A.S.cercle.campaign.zone} · avantage {F(A.S.cercle.campaign.K)}/commande · financée par les gains réglés de la revendeuse (jamais en attente).</div>
          <div className="gauge mt8"><div className="gaugeF" style={{ width: Math.min(100, Math.round(((A.S.cercle.campaign.spent + A.S.cercle.campaign.reserved) / A.S.cercle.campaign.budget) * 100)) + "%" }} /></div>
          <div className="ml"><span>Réservée / Dépensée / Budget</span><b className="num">{F(A.S.cercle.campaign.reserved)} / {F(A.S.cercle.campaign.spent)} / {F(A.S.cercle.campaign.budget)}</b></div>
        </div>
        <div className="card mt12">
          <div className="row"><div className="h3">Hub — Diaspora & PackLab</div><Pill k="pInfo">Consignation</Pill></div>
          <div className="sub mt8">Intake semaine : 34 unités (Maison Awa +9) · mise en vente ≤ 72 h ✓ · kitting : Pack Cuisine Départ — {A.S.products.k1 ? A.S.products.k1.stock : 28} kits possibles (min composants).</div>
          {A.S.products.d1 && A.S.products.d1.qcHold && <div className="note badNote mt8">⚠ Signal qualité propriétaire — Sac Perle : réservations suspendues, QC en revue.</div>}
        </div>
        <div className="card mt12">
          <div className="row"><div className="h3">Hub — Diaspora & PackLab</div><Pill k="pInfo">Consignation</Pill></div>
          <div className="sub mt8">Intake semaine : 34 unités (Maison Awa +9) · mise en vente ≤ 72 h ✓ · kitting : Pack Cuisine Départ — 28 kits possibles (min composants).</div>
          {A.S.products.d1 && A.S.products.d1.qcHold && <div className="note badNote mt8">⚠ Signal qualité propriétaire — Sac Perle : réservations suspendues, QC du hub en revue.</div>}
        </div>
        <div className="cap mt16 mb6">Flux de confiance</div>
        <div className="card">{A.S.trust.map((t, i) => <div key={i} className="sub" style={{ padding: "4px 0" }}>• {t.ts} — {t.l}</div>)}</div>
        <div style={{ height: 8 }} />
      </div>
    </div>
  );
}

/* ---------------------------------- RACINE ---------------------------------- */
export default function App() {
  const [S, d] = useReducer(reducer, undefined, init);
  const [app, setApp] = useState("launcher");
  const [stacks, setStacks] = useState({ boutik: [{ s: "home" }], mb: [{ s: "home" }], buyer: [{ s: "product" }], sera: [{ s: "home" }], ops: [{ s: "home" }], dia: [{ s: "cockpit" }] });
  const [toasts, setToasts] = useState([]);
  const idr = useRef(0);
  const toast = (m) => { const id = ++idr.current; setToasts((t) => [...t, { id, m }]); setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600); };
  const push = (a, scr) => setStacks((p) => ({ ...p, [a]: [...p[a], scr] }));
  const pop = (a) => setStacks((p) => ({ ...p, [a]: p[a].length > 1 ? p[a].slice(0, -1) : p[a] }));
  const reset = (a, scr) => setStacks((p) => ({ ...p, [a]: [scr] }));
  const reset2 = (a, stk) => setStacks((p) => ({ ...p, [a]: stk }));
  const V = { S, d, stacks, push, pop, reset, reset2, setApp, toast };
  return (
    <Ctx.Provider value={V}>
      <style>{CSS}</style>
      <div className="shell">
        {app === "launcher" && <Launcher />}
        {app === "boutik" && <Boutik />}
        {app === "mb" && <MB />}
        {app === "buyer" && <Buyer />}
        {app === "sera" && <Sera />}
        {app === "dia" && <Dia />}
        {app === "ops" && <Ops />}
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", display: "flex", justifyContent: "center", zIndex: 80 }}>
          <div style={{ position: "relative", width: "min(100vw,430px)" }}><Toasts list={toasts} /></div>
        </div>
      </div>
    </Ctx.Provider>
  );
}

/* ---------------------------------- CERCLE — CÔTÉ CLIENTE (vitrine publique + adhésion) ---------------------------------- */
function YCercle() {
  const A = useApp(); const C = A.S.cercle; const camp = C.campaign; const cp = camp ? A.S.products[camp.pid] : null;
  const [q, setQ] = useState(""); const [cat, setCat] = useState("Tout");
  const items = Object.keys(MARKUPS).map((id) => A.S.products[id]).filter(Boolean)
    .filter((p) => cat === "Tout" || p.cat === cat)
    .filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()));
  const cats = ["Tout", ...Array.from(new Set(Object.keys(MARKUPS).map((id) => A.S.products[id] && A.S.products[id].cat).filter(Boolean)))];
  const left = campLeft(camp);
  const openP = (p) => { Object.assign(YD, { pid: p.id, markup: MARKUPS[p.id] || 1000, variant: null, deliveryType: "standard", fee: 1000, mode: "A" }); A.reset2("buyer", [{ s: "cercle" }, { s: "product" }]); };
  return (<>
    <Top title="Le Cercle d’Aïcha" sub="Sacs, mode et beauté sélectionnés pour vous" back={() => A.pop("buyer")} right={<button className="chip" onClick={() => A.push("buyer", { s: "track" })}>📦 Mon suivi</button>} />
    <div className="scroll">
      <div className="card" style={{ borderColor: "var(--pri)", borderWidth: 2 }}>
        <div className="row"><div className="h2">Chez Aïcha Mode ✓</div>{C.joined ? <Pill k="pOk">Membre ✓</Pill> : <Pill k="pInfo">{C.members} membres</Pill>}</div>
        <div className="chips mt8">
          <span className="chip">🛵 {C.deliv} livraisons réussies</span>
          <span className="chip">⭐ {C.note} vérifié ({C.reviews.length + 9} avis)</span>
          <span className="chip">🛡️ Paiement protégé</span>
          <span className="chip">📦 Livré par Séra</span>
        </div>
        <div className="grid2 mt12">
          {!C.joined
            ? <button className="btn pri" onClick={() => A.push("buyer", { s: "join", step: 0 })}>Rejoindre le Cercle</button>
            : <button className="btn sec" onClick={() => A.toast("Préférences ouvertes — vous pouvez arrêter à tout moment")}>Mes préférences</button>}
          <button className="btn ghost" onClick={() => A.toast("Lien du Cercle copié — partagez-le")}>Partager</button>
        </div>
      </div>
      {camp && cp && (
        <div className="card mt12" style={{ padding: 0, overflow: "hidden" }}>
          <Art p={cp} h={130} radius={0} />
          <div style={{ padding: 14 }}>
            <div className="cap">Campagne {camp.recipe} · {camp.zone}</div>
            <div className="h2 mt8">{cp.name} — <span className="num">{F(cp.B + (MARKUPS[cp.pid] || 1500))}</span></div>
            <div className="p mt8">Livraison <b>{camp.customerShare === 0 ? "offerte" : F(camp.customerShare)}</b> {camp.window.toLowerCase()} — financée par Aïcha, Séra reçoit son tarif complet.</div>
            <div className="gauge mt8"><div className="gaugeF" style={{ width: Math.min(100, Math.round((camp.orders / camp.maxOrders) * 100)) + "%" }} /></div>
            <div className="row mt8"><span className="sub">Déjà choisie par {camp.orders} clientes dans cette fenêtre</span>
              <Pill k={camp.state !== "ACTIVE" ? "pMut" : left > 0 ? "pOk" : "pWarn"}>{camp.state !== "ACTIVE" ? "En pause" : left > 0 ? left + " place(s)" : "Budget épuisé"}</Pill></div>
            <button className="btn pri mt12" onClick={() => openP(cp)}>Voir l’offre</button>
            <div className="sub mt8">Offre selon disponibilité — le prix et l’avantage à jour sont toujours sur cette page, pas sur les images partagées.</div>
          </div>
        </div>
      )}
      <div className="cap mt16 mb6">La boutique d’Aïcha</div>
      <div className="field" style={{ marginTop: 4 }}><input placeholder="🔎 Rechercher un article…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="chipsX mt8">{cats.map((c) => <button key={c} className={"chip " + (cat === c ? "chipOn" : "")} onClick={() => setCat(c)}>{c}</button>)}</div>
      <div className="grid2 mt12">
        {items.map((p) => { const c = calc(p.B, p.C, MARKUPS[p.id] || 1000); return (
          <button key={p.id} className="tile" onClick={() => openP(p)}>
            <Art p={p} h={100} radius={0} />
            <div style={{ padding: 11 }}>
              <div className="h3" style={{ fontSize: 13.5 }}>{p.name}</div>
              <div className="row"><span className="sub num" style={{ fontWeight: 700, color: "var(--deep)" }}>{F(c.subtotal)}</span>{camp && camp.pid === p.id && <span className="sub">📍 campagne</span>}</div>
            </div>
          </button>); })}
        {items.length === 0 && <div className="card sub" style={{ gridColumn: "1 / -1" }}>Aucun article ne correspond — essayez un autre mot.</div>}
      </div>
      <div className="cap mt16 mb6">Avis vérifiés</div>
      <div className="list">
        {C.reviews.map((r, i) => { const p = A.S.products[r.pid]; return (
          <div key={i} className="card">
            <div className="row"><div className="h3">{r.n} · {"★".repeat(r.stars)}{"☆".repeat(5 - r.stars)}</div><Pill k="pOk">Achat vérifié</Pill></div>
            <div className="p mt8">« {r.t} »</div>
            <div className="sub mt8">{p ? p.name : ""} · Livré par Séra · {r.d}</div>
          </div>); })}
      </div>
      {!C.joined && (
        <div className="card mt12" style={{ textAlign: "center" }}>
          <div className="h3">Recevez les nouveautés et les campagnes de votre quartier</div>
          <div className="sub mt8">Adhésion en 30 secondes · vous choisissez tout · arrêt en un tap.</div>
          <button className="btn pri mt12" onClick={() => A.push("buyer", { s: "join", step: 0 })}>Rejoindre le Cercle d’Aïcha</button>
        </div>
      )}
      <div style={{ height: 8 }} />
    </div>
  </>);
}

const JOIN_D = { ints: [], zone: "Tampouy", prefs: [], ok: false };
function YJoin({ cur }) {
  const A = useApp(); const st = cur.step || 0; const [, force] = useState(0); const rf = () => force((x) => x + 1);
  const go = (n) => A.reset2("buyer", A.stacks.buyer.slice(0, -1).concat({ s: "join", step: n }));
  const tog = (arr, v) => { const i = arr.indexOf(v); i >= 0 ? arr.splice(i, 1) : arr.push(v); rf(); };
  const INTS = ["Mode femme", "Mode homme", "Sacs", "Beauté", "Enfants", "Maison", "Cérémonies", "Nouveautés", "Livraisons programmées"];
  const PREFS = ["Seulement les offres importantes", "Résumé hebdomadaire", "Nouveautés", "Les campagnes de mon quartier", "Rappels de rachat"];
  const steps = [
    { t: "Rejoindre le Cercle d’Aïcha", ok: true, c: <><div className="p">Recevez les nouveautés, les campagnes de votre quartier et les offres réservées aux membres.</div><div className="note mt12">Votre adhésion appartient à <b>vous</b> : Aïcha ne voit que ce qui sert vos commandes, aucun autre vendeur n’y a accès, et vous pouvez arrêter à tout moment.</div><div className="mt12"><VoiceBtn /></div></> },
    { t: "Ce qui vous intéresse", ok: JOIN_D.ints.length > 0, c: <div className="chips">{INTS.map((x) => <button key={x} className={"chip " + (JOIN_D.ints.includes(x) ? "chipOn" : "")} onClick={() => tog(JOIN_D.ints, x)}>{x}</button>)}</div> },
    { t: "Votre quartier", ok: true, c: <><div className="chips">{ZONES.map((z) => <button key={z} className={"chip " + (JOIN_D.zone === z ? "chipOn" : "")} onClick={() => { JOIN_D.zone = z; rf(); }}>{z}</button>)}</div><div className="field"><label className="cap">Repère (facultatif)</label><input placeholder="Ex. près du marché" /></div><div className="sub mt8">Sert uniquement aux campagnes de livraison groupée de votre zone.</div></> },
    { t: "À quelle fréquence ?", ok: JOIN_D.prefs.length > 0, c: <div className="chips">{PREFS.map((x) => <button key={x} className={"chip " + (JOIN_D.prefs.includes(x) ? "chipOn" : "")} onClick={() => tog(JOIN_D.prefs, x)}>{x}</button>)}</div> },
    { t: "Votre accord", ok: JOIN_D.ok, c: <>
        <button className="check" onClick={() => { JOIN_D.ok = !JOIN_D.ok; rf(); }}>
          <span className={"ckB " + (JOIN_D.ok ? "ckOk" : "")}>{JOIN_D.ok ? "✓" : ""}</span>
          <span className="p" style={{ textAlign: "left" }}>J’accepte de recevoir les offres du Cercle d’Aïcha. <b>Je peux arrêter à tout moment.</b></span>
        </button>
        <div className="sub mt12">Aucune case pré-cochée. Dans cette première version, c’est Aïcha elle-même qui partage — jamais d’envois automatiques.</div>
      </> },
  ];
  if (st >= steps.length) return (<>
    <Top title="Le Cercle d’Aïcha" back={() => A.reset2("buyer", [{ s: "cercle" }])} />
    <div className="scroll" style={{ textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={{ fontSize: 58 }}>🎉</div>
      <div className="h1 mt12">Bienvenue dans le Cercle</div>
      <div className="sub mt8">Vous êtes la membre n° {A.S.cercle.members}. Vos préférences : {JOIN_D.ints.slice(0, 3).join(", ") || "—"} · {JOIN_D.zone}.</div>
      <button className="btn pri mt20" onClick={() => A.reset2("buyer", [{ s: "cercle" }])}>Voir les offres du Cercle</button>
    </div>
  </>);
  const s = steps[st];
  return (<>
    <Top title={"Adhésion " + (st + 1) + "/" + steps.length} back={() => st === 0 ? A.pop("buyer") : go(st - 1)} />
    <div className="scroll"><div className="h1">{s.t}</div><div className="mt12">{s.c}</div></div>
    <div className="stick"><button className="btn pri" disabled={!s.ok} onClick={() => {
      if (st < steps.length - 1) return go(st + 1);
      A.d({ t: "CER", p: { joined: true, members: A.S.cercle.members + 1, plus: A.S.cercle.plus + 1 } });
      A.toast("Bienvenue dans le Cercle d’Aïcha 🎉");
      go(st + 1);
    }}>{st === steps.length - 1 ? "Rejoindre le Cercle" : "Continuer"}</button></div>
  </>);
}

/* ---------------------------------- CERCLE — CÔTÉ REVENDEUSE ---------------------------------- */
const RECIPES = [
  { k: "Nouveauté", e: "🌟", tag: "Lancez une nouveauté avec style", best: "Nouveaux arrivages · premières ventes · premiers avis", budget: "Budget facultatif" },
  { k: "Quartier", e: "📍", tag: "Regroupez vos clientes dans une même fenêtre de livraison", best: "Ventes de quartier · livraison groupée le samedi", budget: "Budget requis pour l’avantage" },
  { k: "Dernières Pièces", e: "⏳", tag: "Écoulez le stock restant, sans fausse urgence", best: "Fins de série · stock réel de Boutik+", budget: "Budget facultatif" },
];
const CAMP_D = { recipe: "Quartier", pid: "p1", K: 600, maxOrders: 10, zone: "Tampouy", ok: false };
const resetCamp = () => Object.assign(CAMP_D, { recipe: "Quartier", pid: "p1", K: 600, maxOrders: 10, zone: "Tampouy", ok: false });

function MCercle() {
  const A = useApp(); const C = A.S.cercle; const camp = C.campaign; const cp = A.S.products[camp.pid];
  const net = calc(cp.B, cp.C, MARKUPS[cp.pid] || 1500).rNet;
  const attributed = camp.orders * Math.max(0, net - camp.K);
  const invested = camp.spent + camp.reserved;
  const left = campLeft(camp);
  const delivered = Object.values(A.S.orders).filter((o) => o.status === "PAID").length + 15;
  const ratio = invested > 0 ? attributed / invested : 0;
  return (<>
    <Top title="Mon Cercle" sub="Le Cercle d’Aïcha — votre page est en ligne" right={<button className="chip" onClick={() => { A.setApp("buyer"); A.reset("buyer", { s: "cercle" }); }}>👀 Voir</button>} />
    <div className="scroll">
      <div className="grid2">
        <div className="card"><div className="cap">Membres</div><div className="h2 num mt8">{C.members}</div><div className="sub">+{C.plus} ce mois-ci</div></div>
        <div className="card"><div className="cap">Commandes validées</div><div className="h2 num mt8">{delivered}</div><div className="sub">{C.reviews.length + 9} avis vérifiés</div></div>
      </div>
      <div className="card mt12">
        <div className="cap">💡 Suggestion du jour (une seule, jamais envoyée automatiquement)</div>
        <div className="p mt8">{left > 0 ? left + " place(s) restante(s) sur votre campagne Quartier — partagez la carte à vos membres de Tampouy." : "6 clientes de Tampouy ont regardé vos sacs ces jours-ci — la recette Quartier est prête."}</div>
        <div className="sub mt8">Pourquoi ? Règle : consultations récentes + quartier + budget disponible. C’est vous qui décidez.</div>
        <button className="chip mt8" onClick={() => { resetCamp(); A.push("mb", { s: "campnew", step: 0 }); }}>Utiliser la recette →</button>
      </div>
      <button className="tile mt12" onClick={() => A.push("mb", { s: "campaign" })}>
        <div style={{ padding: 13 }}>
          <div className="row"><div className="h3">📍 {camp.recipe} — {camp.zone}</div>
            <Pill k={camp.state !== "ACTIVE" ? "pMut" : left > 0 ? "pOk" : "pWarn"}>{camp.state !== "ACTIVE" ? "En pause" : left > 0 ? "Active" : "Budget épuisé"}</Pill></div>
          <div className="gauge mt8"><div className="gaugeF" style={{ width: Math.min(100, Math.round((camp.orders / camp.maxOrders) * 100)) + "%" }} /></div>
          <div className="row mt8"><span className="sub">{camp.orders}/{camp.maxOrders} commandes attribuées · {camp.window}</span><span className="sub num">{F(invested)} / {F(camp.budget)}</span></div>
        </div>
      </button>
      <div className="card mt12">
        <div className="cap">Résultat (attribué, pas « généré »)</div>
        <div className="ml"><span>Investi (consommé + réservé)</span><b className="num">{F(invested)}</b></div>
        <div className="ml"><span>Gains nets attribués</span><b className="num">{F(attributed)}</b></div>
        <div className={"note mt8 " + (ratio >= 2 ? "" : "warnNote")}>{ratio >= 2 ? "✅ Cette campagne a bien marché : chaque franc investi a rapporté plus de deux francs de gain net attribué." : "⚠ Cette campagne coûte cher pour si peu de livraisons — baissez l’avantage, ou visez vos anciennes clientes."}</div>
      </div>
      <button className="btn pri mt12" onClick={() => { resetCamp(); A.push("mb", { s: "campnew", step: 0 }); }}>＋ Créer une campagne</button>
      <div className="grid2 mt12">
        <button className="btn sec" onClick={() => A.push("mb", { s: "members" })}>👥 Membres</button>
        <button className="btn sec" onClick={() => A.push("mb", { s: "funding" })}>💼 Financement</button>
      </div>
      <div className="row mt16"><div className="cap">Avis vérifiés</div><button className="chip" onClick={() => A.push("mb", { s: "reviews" })}>Tout voir</button></div>
      <div className="list mt8">
        {C.reviews.slice(0, 2).map((r, i) => (
          <div key={i} className="card"><div className="row"><div className="h3">{r.n} · {"★".repeat(r.stars)}</div><Pill k="pOk">Vérifié · Séra</Pill></div><div className="sub mt8">« {r.t} »</div></div>
        ))}
      </div>
      <div className="grid2 mt12">
        <button className="btn ghost" onClick={() => A.toast("Carte d’invitation copiée — envoyez-la vous-même sur WhatsApp")}>✉️ Inviter</button>
        <button className="btn ghost" onClick={() => A.push("mb", { s: "share", pid: camp.pid, markup: MARKUPS[camp.pid] || 1500, campBadge: true })}>🎨 Pack de partage</button>
      </div>
    </div>
  </>);
}

function MCampNew({ cur }) {
  const A = useApp(); const st = cur.step || 0; const [, force] = useState(0); const rf = () => force((x) => x + 1);
  const go = (n) => A.reset2("mb", A.stacks.mb.slice(0, -1).concat({ s: "campnew", step: n }));
  const D = CAMP_D; const p = A.S.products[D.pid]; const net = calc(p.B, p.C, MARKUPS[D.pid] || 1500).rNet;
  const share = Math.max(0, 1000 - D.K);
  const blockNet = D.K > net; const blockQuote = !blockNet && D.K > 1000; const warn = !blockNet && !blockQuote && D.K > net / 2 && D.K > 0;
  const eligible = Object.keys(MARKUPS).map((id) => A.S.products[id]).filter(Boolean);
  const steps = [
    { t: "1 · Choisissez une recette", ok: true, c: <div className="list">{RECIPES.map((r) => (
        <button key={r.k} className="tile" style={D.recipe === r.k ? { borderColor: "var(--pri)", borderWidth: 2 } : null} onClick={() => { D.recipe = r.k; rf(); }}>
          <div style={{ padding: 13 }}>
            <div className="row"><div className="h3">{r.e} {r.k}</div><Pill k="pInfo">2 min</Pill></div>
            <div className="sub mt8">{r.tag}</div>
            <div className="sub mt8"><b>Idéal pour :</b> {r.best} · {r.budget}</div>
          </div>
        </button>))}</div> },
    { t: "2 · Choisissez le produit", ok: true, c: <div className="list">{eligible.map((pp) => { const n2 = calc(pp.B, pp.C, MARKUPS[pp.id] || 1000).rNet; return (
        <button key={pp.id} className="tile" style={D.pid === pp.id ? { borderColor: "var(--pri)", borderWidth: 2 } : null} onClick={() => { D.pid = pp.id; rf(); }}>
          <div style={{ padding: 12 }} className="row">
            <Art p={pp} h={48} size={22} radius={12} />
            <div style={{ flex: 1, marginLeft: 4 }}><div className="h3">{pp.name}</div><div className="sub">Stock {pp.stock} · gain net normal <b className="num">{F(n2)}</b></div></div>
          </div>
        </button>); })}</div> },
    { t: "3 · Votre budget", ok: true, c: <>
        <div className="cap">Avantage par commande (réduction livraison)</div>
        <div className="mt8"><Stepper v={D.K} set={(v) => { D.K = v; rf(); }} step={100} min={0} max={2500} /></div>
        <div className="sub mt8">{D.K === 0 ? "0 F = promotion seule, aucun engagement financier." : "La cliente paiera la livraison " + F(share) + " au lieu de 1 000 F."}</div>
        <div className="cap mt16">Nombre maximum de commandes récompensées</div>
        <div className="mt8"><Stepper v={D.maxOrders} set={(v) => { D.maxOrders = v; rf(); }} step={1} min={1} max={20} /></div>
        {D.recipe === "Quartier" && (<><div className="cap mt16">Quartier de la fenêtre (samedi 10 h – 12 h)</div>
          <div className="chips mt8">{ZONES.map((z) => <button key={z} className={"chip " + (D.zone === z ? "chipOn" : "")} onClick={() => { D.zone = z; rf(); }}>{z}</button>)}</div></>)}
      </> },
    { t: "Aperçu économique", ok: !blockNet && !blockQuote && (D.K === 0 || D.ok), c: <>
        <div className="card" style={{ borderColor: "var(--pri)", borderWidth: 2 }}>
          <MoneyLines lines={[
            { l: "Gain normal par vente livrée", v: F(net) },
            { l: "Votre contribution campagne", v: "−" + F(D.K), dim: true },
          ]} total={{ l: "Il vous restera", v: F(Math.max(0, net - D.K)) + " / vente" }} />
          <Line />
          <div className="ml"><span>Investissement maximum</span><b className="num">{F(D.K * D.maxOrders)}</b></div>
          <div className="ml"><span>Ventes soutenues au maximum</span><b className="num">{D.maxOrders}</b></div>
          {D.K > 0 && <div className="ml"><span>La cliente paie la livraison</span><b className="num">{share === 0 ? "Offerte" : F(share)}</b></div>}
        </div>
        {blockNet && <div className="note badNote mt12">⛔ Bloqué : votre contribution ({F(D.K)}) dépasse votre gain normal ({F(net)}). Une campagne ne peut pas vous faire perdre de l’argent.</div>}
        {blockQuote && <div className="note badNote mt12">⛔ Bloqué : la contribution dépasse le tarif Séra (1 000 F). Séra est financée au franc près, jamais plus, jamais moins.</div>}
        {warn && <div className="note warnNote mt12">⚠ Il vous restera moins de la moitié de votre gain normal sur les ventes récompensées.</div>}
        {share === 0 && D.K === 1000 && <div className="note mt12">ℹ Livraison offerte ⇒ les clientes devront <b>tout payer maintenant</b> (règle Cercle, appliquée au paiement).</div>}
        {D.K > 0 && !blockNet && !blockQuote && (
          <button className="check mt12" onClick={() => { D.ok = !D.ok; rf(); }}>
            <span className={"ckB " + (D.ok ? "ckOk" : "")}>{D.ok ? "✓" : ""}</span>
            <span className="p" style={{ textAlign: "left" }}>J’alloue jusqu’à <b className="num">{F(D.K * D.maxOrders)}</b> de mes <b>gains réglés</b> (bloqués chez le partenaire de paiement — jamais mes gains en attente).</span>
          </button>
        )}
        <div className="sub mt12">Remplacera la campagne active (une campagne à la fois dans cette démo). La campagne s’arrête <b>avant</b> tout dépassement.</div>
      </> },
  ];
  const s = steps[st];
  return (<>
    <Top title={"Campagne — " + D.recipe} back={() => st === 0 ? A.pop("mb") : go(st - 1)} />
    <div className="scroll"><div className="h1">{s.t}</div><div className="mt12">{s.c}</div></div>
    <div className="stick"><button className="btn pri" disabled={!s.ok} onClick={() => {
      if (st < 3) return go(st + 1);
      const c = { id: "CAMP-0" + (15 + Math.floor(Math.random() * 80)), recipe: D.recipe, pid: D.pid, zone: D.zone, window: "Samedi 10 h – 12 h",
        K: D.K, customerShare: Math.max(0, 1000 - D.K), maxOrders: D.maxOrders, budget: D.K * D.maxOrders, spent: 0, reserved: 0, orders: 0, state: "ACTIVE", expiry: "7 jours" };
      A.d({ t: "CAMPNEW", c });
      A.toast("Campagne lancée ✓ — pack de partage prêt");
      A.reset2("mb", [{ s: "cercle" }, { s: "share", pid: D.pid, markup: MARKUPS[D.pid] || 1500, campBadge: D.K > 0 }]);
    }}>{st === 3 ? "Lancer la campagne" : "Continuer"}</button></div>
  </>);
}

function MCampaign() {
  const A = useApp(); const camp = A.S.cercle.campaign; const p = A.S.products[camp.pid];
  const net = calc(p.B, p.C, MARKUPS[camp.pid] || 1500).rNet;
  const left = campLeft(camp); const remaining = camp.budget - camp.spent - camp.reserved;
  const liveOrders = Object.values(A.S.orders).filter((o) => o.campaignId === camp.id);
  return (<>
    <Top title={camp.recipe + " — " + camp.zone} back={() => A.pop("mb")} right={<Pill k={camp.state !== "ACTIVE" ? "pMut" : left > 0 ? "pOk" : "pWarn"}>{camp.state !== "ACTIVE" ? "En pause" : left > 0 ? "Active" : "Budget épuisé"}</Pill>} />
    <div className="scroll">
      <div className="card row"><Art p={p} h={52} size={24} radius={12} /><div style={{ flex: 1 }}><div className="h3">{p.name}</div><div className="sub">{camp.window} · avantage {F(camp.K)} / commande · cliente paie {camp.customerShare === 0 ? "0 F (prépaiement requis)" : F(camp.customerShare)}</div></div></div>
      <div className="card mt12">
        <div className="cap">Progrès</div>
        <div className="gauge mt8"><div className="gaugeF" style={{ width: Math.min(100, Math.round((camp.orders / camp.maxOrders) * 100)) + "%" }} /></div>
        <div className="sub mt8">{camp.orders}/{camp.maxOrders} commandes attribuées · {left} place(s) restante(s)</div>
      </div>
      <div className="card mt12">
        <div className="cap">Budget (alloué chez le partenaire)</div>
        <MoneyLines lines={[
          { l: "Alloué", v: F(camp.budget) },
          { l: "Réservé (commandes en cours)", v: F(camp.reserved), dim: true },
          { l: "Dépensé (livraisons validées / refus client)", v: F(camp.spent), dim: true },
        ]} total={{ l: "Restant — récupérable si vous arrêtez", v: F(Math.max(0, remaining)) }} />
        <div className="sub mt8">Faute vendeur ou Séra → l’avantage vous est <b>rendu</b>, jamais perdu à cause d’un autre.</div>
      </div>
      {liveOrders.length > 0 && (<>
        <div className="cap mt16 mb6">Commandes attribuées (en direct)</div>
        <div className="list">{liveOrders.map((o) => (
          <div key={o.id} className="card row"><div><div className="h3">{o.code}</div><div className="sub">{o.buyer.zone} · avantage {F(o.camp)}</div></div><StatusPill s={o.status} /></div>
        ))}</div>
      </>)}
      <div className="sub mt8">{camp.orders > liveOrders.length ? "+ " + (camp.orders - liveOrders.length) + " commandes antérieures (démo)" : ""}</div>
      <div className="grid2 mt12">
        <button className="btn sec" onClick={() => { A.d({ t: "CAMP", p: { state: camp.state === "ACTIVE" ? "PAUSED" : "ACTIVE" } }); A.toast(camp.state === "ACTIVE" ? "Campagne en pause — l’avantage disparaît immédiatement des pages" : "Campagne réactivée"); }}>{camp.state === "ACTIVE" ? "⏸ Mettre en pause" : "▶ Réactiver"}</button>
        <button className="btn ghost" onClick={() => A.push("mb", { s: "share", pid: camp.pid, markup: MARKUPS[camp.pid] || 1500, campBadge: camp.K > 0 })}>🎨 Pack de partage</button>
      </div>
      <div className="note mt12">Les images partagées portent la date de validité ; la <b>page signée</b> reste la seule vérité du prix et de l’avantage.</div>
    </div>
  </>);
}

function MMembers() {
  const A = useApp(); const [seg, setSeg] = useState("Toutes");
  const segs = ["Toutes", "Fidèle", "Nouvelle", "Intéressée", "À relancer", "Tampouy"];
  const list = A.S.cercle.list.filter((m) => seg === "Toutes" || m.seg === seg || m.z === seg);
  return (<>
    <Top title="Membres" sub={A.S.cercle.members + " au total · consentement explicite"} back={() => A.pop("mb")} />
    <div className="scroll">
      <div className="chipsX">{segs.map((s) => <button key={s} className={"chip " + (seg === s ? "chipOn" : "")} onClick={() => setSeg(s)}>{s}</button>)}</div>
      <div className="list mt12">
        {list.map((m, i) => (
          <div key={i} className="card row">
            <div><div className="h3">{m.n}</div><div className="sub">{m.z} · intérêt : {m.i}</div></div>
            <Pill k={m.seg === "Fidèle" ? "pOk" : m.seg === "À relancer" ? "pWarn" : "pInfo"}>{m.seg}</Pill>
          </div>
        ))}
      </div>
      <div className="note mt12">Les groupes servent à <b>réduire</b> les messages inutiles, pas à en envoyer plus. Chaque membre peut arrêter en un tap ; aucun autre vendeur n’y a accès.</div>
    </div>
  </>);
}

function MFunding() {
  const A = useApp(); const camp = A.S.cercle.campaign;
  const allocated = camp.budget - camp.spent - camp.reserved;
  return (<>
    <Top title="Financement campagne" sub="Bloqué chez le partenaire — jamais un portefeuille" back={() => A.pop("mb")} />
    <div className="scroll">
      <div className="card">
        <MoneyLines lines={[
          { l: "Gains disponibles (réglés)", v: F(A.S.cercle.funding.available) },
          { l: "Alloués à la campagne active", v: F(Math.max(0, allocated)), dim: true },
          { l: "Réservés (commandes en cours)", v: F(camp.reserved), dim: true },
          { l: "Dépensés ce mois", v: F(camp.spent), dim: true },
        ]} total={{ l: "Récupérable si vous arrêtez la campagne", v: F(Math.max(0, allocated)) }} />
      </div>
      <div className="note mt12">✔ Seuls vos <b>gains réglés</b> financent vos campagnes — jamais les gains en attente, jamais l’argent d’un autre.</div>
      <div className="note warnNote mt8">Recharge Mobile Money : <b>différée</b> tant que la structure n’est pas approuvée par le partenaire de paiement (décision légale ouverte).</div>
      <button className="btn ghost mt12" onClick={() => A.toast("Fonds non utilisés → retour à vos gains disponibles (simulation)")}>Retirer les fonds non utilisés</button>
    </div>
  </>);
}

function MReviews() {
  const A = useApp();
  return (<>
    <Top title="Avis vérifiés" sub="Uniquement des livraisons validées par Séra" back={() => A.pop("mb")} />
    <div className="scroll"><div className="list">
      {A.S.cercle.reviews.map((r, i) => { const p = A.S.products[r.pid]; return (
        <div key={i} className="card">
          <div className="row"><div className="h3">{r.n} · {"★".repeat(r.stars)}{"☆".repeat(5 - r.stars)}</div><Pill k="pOk">Achat vérifié</Pill></div>
          <div className="p mt8">« {r.t} »</div>
          <div className="sub mt8">{p ? p.name : ""} · Livré par Séra · {r.d}</div>
          <button className="chip mt8" onClick={() => A.toast("Carte de preuve générée — partagez-la vous-même")}>🎴 Carte de preuve</button>
        </div>); })}
    </div>
    <div className="note mt12">Une commande annulée, remboursée ou frauduleuse ne produit <b>jamais</b> d’avis vérifié — c’est ce qui rend les vôtres précieux.</div>
    </div>
  </>);
}

/* ---------------------------------- BOUTIK+ DIASPORA — LE COCKPIT DU PROPRIÉTAIRE ---------------------------------- */
const SIM_P = [
  { pid: "d1", n: "Sac Perle", B: 12500, C: 1250, catalog: true },
  { pid: null, n: "Collier créateur", B: 7500, C: 750 },
  { pid: null, n: "Lot accessoires cheveux", B: 4000, C: 400 },
];
const DIA_LIVE = ["PAID", "BUYER_REFUSED", "PICKUP_REFUSED", "RETURNED", "READY_FAILED", "SELLER_RETURN", "RETURNING"];

function Dia() {
  const A = useApp(); const stack = A.stacks.dia; const cur = stack[stack.length - 1];
  const S = { cockpit: DHome, sim: DSim, stock: DStock, unit: DUnit, argent: DMoney, enseigne: DEns }[cur.s] || DHome;
  const showTabs = ["cockpit", "stock", "argent", "enseigne"].includes(cur.s);
  return (
    <div className="phone appLight appB">
      <Band />
      <S cur={cur} />
      {showTabs && <Tabs items={[{ s: "cockpit", i: "🎛", l: "Cockpit" }, { s: "stock", i: "📦", l: "Stock" }, { s: "argent", i: "💰", l: "Argent" }, { s: "enseigne", i: "🏬", l: "Enseigne" }]} cur={cur.s} onGo={(s) => A.reset("dia", { s })} />}
    </div>
  );
}

function DHome() {
  const A = useApp(); const D = A.S.dia; const d1 = A.S.products.d1;
  const [sheet, setSheet] = useState(null); const [wd, setWd] = useState(1); const [bandPct, setBandPct] = useState(15); const [bandDays, setBandDays] = useState(60); const [benef, setBenef] = useState("Salif Diallo (frère — Ouaga)");
  const pr = D.proposals[0];
  const livePending = Object.values(A.S.orders).filter((o) => { const p = A.S.products[o.pid]; return p && p.seller === "awa" && !DIA_LIVE.includes(o.status); }).reduce((s, o) => s + ownerNet(A.S.products[o.pid]), 0);
  const done = (result, msg) => { A.d({ t: "DIA", p: { proposals: [{ ...pr, done: true, result }] } }); A.toast(msg); };
  return (<>
    <Top title="Boutik+ Diaspora" sub="Maison Awa · Awa Diallo — Montréal 🇨🇦" right={<Pill k="pOk">D2 — Confirmé</Pill>} />
    <div className="scroll">
      <div className="card" style={{ borderColor: "var(--pri)", borderWidth: 2, textAlign: "center" }}>
        <div className="h2">« Vous décidez. Nous exécutons. Vous encaissez. »</div>
        <div className="sub mt8">Offre : vous · Demande : les revendeuses Shop+ · Garde : le hub · Argent : les règles.</div>
      </div>
      <div className="card mt12">
        <div className="cap">La position de chaque franc</div>
        <MoneyLines lines={[
          { l: "En attente de validation de livraison", v: F(D.pendingSeed + livePending), dim: true },
          { l: "Fenêtre retour — classe A (0 h)", v: "jeudi 18 h 00", dim: true },
        ]} total={{ l: "Disponible — vous pouvez agir", v: F(D.avail) }} />
        <button className="chip mt8" onClick={() => A.reset("dia", { s: "argent" })}>Demander un payout →</button>
      </div>
      {!pr.done ? (
        <div className="card mt12" style={{ borderColor: "#B3541E" }}>
          <div className="cap">📉 Proposition — la machine conseille, vous décidez</div>
          <div className="p mt8">{pr.label}. Que décidez-vous ?</div>
          <button className="btn sec mt12" onClick={() => {
            A.d({ t: "PROD", pid: "d1", p: { B: 10600 } });
            A.d({ t: "DIA", p: { anchor: "avant : 12 500 F (ledger)", proposals: [{ ...pr, done: true, result: "markdown" }] } });
            A.d({ t: "TRUST", l: "Maison Awa : démarque approuvée par la propriétaire — événement prix enregistré au ledger (12 500 → 10 600 F)" });
            A.toast("Démarque −15 % appliquée — futures commandes uniquement ✓");
          }}>Démarque −15 % → éligible « Dernières Pièces »</button>
          <div className="grid2 mt8">
            <button className="btn ghost" onClick={() => done("liq", "Liquidation autorisée — la plateforme exécute")}>Liquidation</button>
            <button className="btn ghost" onClick={() => done("keep", "Prix conservé — rappel dans 30 j (défaut : aucune action)")}>Garder le prix</button>
          </div>
        </div>
      ) : (
        <div className="note mt12">✓ Proposition traitée ({pr.result === "markdown" ? "démarque approuvée — l’ancien prix devient l’ancre ledger" : pr.result === "liq" ? "liquidation en cours" : "prix conservé"}). Les propositions expirent vers <b>vos</b> défauts, jamais vers la convenance de la plateforme.</div>
      )}
      <div className="card mt12">
        <div className="row"><div className="h3">⚠ Signal qualité</div><Pill k={d1.qcHold ? "pWarn" : "pMut"}>{d1.qcHold ? "Actif — réservations suspendues" : "Aucun signal"}</Pill></div>
        <div className="sub mt8">Vous n’avez pas de bouton pause — vous avez une corde d’alarme. Un défaut suspecté sur votre stock suspend les réservations immédiatement, le QC du hub tranche.</div>
        {!d1.qcHold
          ? <button className="chip mt8" onClick={() => setSheet("qc")}>Signaler un défaut sur mon stock</button>
          : <button className="chip mt8" onClick={() => { A.d({ t: "PROD", pid: "d1", p: { qcHold: false } }); A.toast("Signal levé — QC ok (démo) · réservations réactivées"); }}>Lever le signal (QC ok — démo)</button>}
      </div>
      <div className="cap mt16 mb6">Vos commandes — contrôlez sans opérer</div>
      <div className="list">
        <button className="tile" onClick={() => A.push("dia", { s: "sim" })}><div style={{ padding: 13 }} className="row"><div><div className="h3">💱 Prix, commission & contribution</div><div className="sub">Simulateur — la classe s’ajuste, jamais d’interdit</div></div><span style={{ color: "var(--sub)" }}>›</span></div></button>
        <button className="tile" onClick={() => setSheet("reassort")}><div style={{ padding: 13 }} className="row"><div><div className="h3">📥 Déclaration de réassort</div><div className="sub">Ouvre la checklist d’import (voie A / voie B)</div></div><span style={{ color: "var(--sub)" }}>›</span></div></button>
        <button className="tile" onClick={() => setSheet("retrait")}><div style={{ padding: 13 }} className="row"><div><div className="h3">📤 Retrait de stock</div><div className="sub">Unités non réservées uniquement</div></div><span style={{ color: "var(--sub)" }}>›</span></div></button>
        <button className="tile" onClick={() => setSheet("autopilot")}><div style={{ padding: 13 }} className="row"><div><div className="h3">🤖 Règles Autopilot</div><div className="sub">L’automatisation reste votre règle</div></div><span style={{ color: "var(--sub)" }}>›</span></div></button>
        <button className="tile" onClick={() => { A.d({ t: "DIA", p: { familyLink: true } }); A.toast("Lien lecture seule copié — la famille voit tout, ne touche rien"); }}><div style={{ padding: 13 }} className="row"><div><div className="h3">👨‍👩‍👧 Accès famille (lecture seule)</div><div className="sub">{A.S.dia.familyLink ? "Lien actif ✓" : "Le vieux problème de confiance, inversé"}</div></div><span style={{ color: "var(--sub)" }}>›</span></div></button>
        <button className="tile" onClick={() => setSheet("benef")}><div style={{ padding: 13 }} className="row"><div><div className="h3">🕊 Désignation de bénéficiaire</div><div className="sub">{benef} · D2+ · délai de réflexion 7 j</div></div><span style={{ color: "var(--sub)" }}>›</span></div></button>
      </div>
      <div className="card mt12">
        <div className="cap">🎉 Souvenir — 12/05</div>
        <div className="p mt8">« Félicitations — votre première vente au pays vient d’être livrée. » (preuve photo jointe)</div>
        <div className="sub mt8">Cette capture d’écran est partie dans trois groupes WhatsApp le soir même.</div>
      </div>
      <div className="note mt12"><b>Publier est une promesse.</b> Un produit publié reste en ligne — pas de pause. La sortie = retrait du stock non réservé ; la suspension n’appartient qu’aux règles plateforme (QC, légal, litige).</div>
    </div>
    <Sheet open={sheet === "qc"} onClose={() => setSheet(null)} title="⚠ Signal qualité — Sac Perle">
      <div className="p">Vous suspectez un défaut (fermoir fragile signalé par une cliente au Canada). Confirmer suspend <b>immédiatement</b> les réservations, partout — vitrine, Cercle, campagnes.</div>
      <button className="btn pri mt16" onClick={() => { A.d({ t: "PROD", pid: "d1", p: { qcHold: true } }); A.d({ t: "TRUST", l: "Signal qualité (Maison Awa) — Sac Perle : réservations suspendues, QC du hub notifié" }); setSheet(null); A.toast("Réservations suspendues immédiatement"); A.toast("QC du hub notifié — quarantaine ou levée sous 24 h"); }}>Confirmer le signal</button>
    </Sheet>
    <Sheet open={sheet === "reassort"} onClose={() => setSheet(null)} title="📥 Déclaration de réassort">
      <div className="p"><b>La plateforme n’est jamais l’importateur (v1).</b> La garde commence au scan d’intake du hub.</div>
      <div className="note mt12"><b>Voie A — DDP jusqu’au hub :</b> vous gérez achat, fret, douanes, taxes. Obligatoire pour Europe / Amérique du Nord.</div>
      <div className="note mt8"><b>Voie B — Partenaire corridor agréé (Abidjan) :</b> manifeste + preuve de remise + route douanière documentée. Sans documents → refus à l’intake.</div>
      <button className="btn pri mt16" onClick={() => { setSheet(null); A.toast("Réassort déclaré : 12 unités via corridor Abidjan (voie B) — checklist envoyée"); }}>Déclarer 12 unités — voie B (Abidjan)</button>
    </Sheet>
    <Sheet open={sheet === "retrait"} onClose={() => setSheet(null)} title="📤 Retrait de stock">
      <div className="cap">Unités à retirer (non réservées uniquement)</div>
      <div className="mt8"><Stepper v={wd} set={setWd} step={1} min={1} max={7} /></div>
      <div className="sub mt8">Remise en main propre à Ouaga, pièce d’identité vérifiée. Les unités réservées ou verrouillées par campagne ne bougent jamais.</div>
      <button className="btn pri mt16" onClick={() => { setSheet(null); A.toast("Retrait programmé : " + wd + " unité(s) — remise contre identité au hub"); }}>Programmer le retrait</button>
    </Sheet>
    <Sheet open={sheet === "autopilot"} onClose={() => setSheet(null)} title="🤖 Règles Autopilot">
      <div className="cap">Démarque automatique maximale</div>
      <div className="mt8"><Stepper v={bandPct} set={setBandPct} step={5} min={5} max={30} /></div>
      <div className="cap mt12">À partir de (jours en stock)</div>
      <div className="mt8"><Stepper v={bandDays} set={setBandDays} step={15} min={30} max={120} /></div>
      <div className="sub mt8">Dans ces bandes, la plateforme agit seule — c’est de la délégation, pas de la dépossession : la règle reste la vôtre.</div>
      <button className="btn pri mt16" onClick={() => { setSheet(null); A.toast("Bandes enregistrées : −" + bandPct + " % max dès " + bandDays + " j"); }}>Enregistrer mes bandes</button>
    </Sheet>
    <Sheet open={sheet === "benef"} onClose={() => setSheet(null)} title="🕊 Bénéficiaire désigné">
      <div className="field"><label className="cap">Nom du bénéficiaire</label><input value={benef} onChange={(e) => setBenef(e.target.value)} /></div>
      <div className="sub mt8">D2+ uniquement · KYC renforcé du bénéficiaire · délai de réflexion 7 j sur tout changement · journal des changements. Le paiement à un tiers est offert — et surveillé.</div>
      <button className="btn pri mt16" onClick={() => { setSheet(null); A.toast("Bénéficiaire enregistré — effectif après le délai de réflexion (7 j)"); }}>Enregistrer</button>
    </Sheet>
  </>);
}

function DSim() {
  const A = useApp(); const D = A.S.dia;
  const [ix, setIx] = useState(0); const base = SIM_P[ix];
  const [B, setB] = useState(base.catalog ? A.S.products.d1.B : base.B); const [C, setC] = useState(base.C); const [contrib, setContrib] = useState(0);
  const pick = (i) => { setIx(i); const s = SIM_P[i]; setB(s.catalog ? A.S.products.d1.B : s.B); setC(s.C); setContrib(0); };
  const fee = Math.round(B * 0.05); const net = B - C - fee - 300 - contrib;
  const custEst = B + Math.round(B * 0.15 / 100) * 100;
  const cOver = C > B - fee - 300; const netBad = !cOver && net <= 0;
  const solo = B >= 5000 || contrib >= 300;
  return (<>
    <Top title="Simulateur de prix" sub="Comprendre avant de décider — chaque franc a un siège" back={() => A.pop("dia")} />
    <div className="scroll">
      <div className="chipsX">{SIM_P.map((s, i) => <button key={i} className={"chip " + (ix === i ? "chipOn" : "")} onClick={() => pick(i)}>{s.n} · {F(s.catalog ? A.S.products.d1.B : s.B)}</button>)}</div>
      {D.anchor && base.catalog && <div className="sub mt8">Prix de référence (dérivé du ledger, jamais saisi) : {D.anchor}</div>}
      <div className="cap mt12">Prix de base (B)</div><div className="mt8"><Stepper v={B} set={setB} step={500} min={1000} max={30000} /></div>
      <div className="cap mt12">Commission revendeuse (C) — votre vrai levier de demande</div><div className="mt8"><Stepper v={C} set={setC} step={250} min={0} max={5000} /></div>
      <div className="cap mt12">Contribution livraison (jamais visible cliente)</div><div className="mt8"><Stepper v={contrib} set={setContrib} step={100} min={0} max={500} /></div>
      <div className="card mt12" style={{ borderColor: "var(--pri)", borderWidth: 2 }}>
        <MoneyLines lines={[
          { l: "Prix client estimé (B + marge type)", v: F(custEst), dim: true },
          { l: "Frais Boutik+ (5 % de B)", v: "−" + F(fee), dim: true },
          { l: "Gestion par commande livrée", v: "−" + F(300), dim: true },
          { l: "Contribution livraison", v: "−" + F(contrib), dim: true },
          { l: "Commission revendeuse (C)", v: "−" + F(C), dim: true },
        ]} total={{ l: "Votre net par unité", v: F(net) }} />
        <div className="sub mt8">Fonds disponibles : J+2 après validation (fenêtre retour classe A).</div>
      </div>
      <div className={"note mt12 " + (solo ? "" : "warnNote")}>{solo ? "✓ SOLO_ELIGIBLE — ce prix finance sa livraison seule." : "Classe : « éligible en panier uniquement » — ce prix ne finance pas une livraison seule. Ajoutez une contribution ≥ 300 F ou vendez-le en panier."}</div>
      <div className="sub mt8">Tout prix économiquement valide est permis — la classe s’ajuste, <b>jamais d’interdit</b>.</div>
      {cOver && <div className="note badNote mt12">⛔ Bloqué : C dépasse la marge disponible (B − frais − gestion). Complétez depuis votre solde réglé ou réduisez C.</div>}
      {netBad && <div className="note badNote mt12">⛔ Bloqué : net négatif au règlement — incohérent, pas courageux.</div>}
      <button className="btn pri mt12" disabled={cOver || netBad} onClick={() => {
        if (base.catalog) { A.d({ t: "PROD", pid: "d1", p: { B, C } }); A.toast("Enregistré ✓ — futures commandes uniquement · PriceVersion des commandes réservées intact · verrous campagne (≤ 14 j) intouchés"); }
        else A.toast("Produit de simulation — déclarez-le au réassort pour le publier");
      }}>Appliquer — futures commandes uniquement</button>
    </div>
  </>);
}

function DStock() {
  const A = useApp(); const d1 = A.S.products.d1; const pr = A.S.dia.proposals[0];
  const live = Object.values(A.S.orders).find((o) => { const p = A.S.products[o.pid]; return p && p.seller === "awa" && !DIA_LIVE.includes(o.status); });
  return (<>
    <Top title="Stock au hub" sub="Une seule vérité d’inventaire — la vôtre à voir" right={<Pill k="pOk">≤ 72 h ✓ (54 h)</Pill>} />
    <div className="scroll">
      <div className="card">
        <div className="row"><div className="h3">👝 Sac Perle — {d1.stock} unités</div>{d1.qcHold ? <Pill k="pWarn">⚠ QC</Pill> : <Pill k="pOk">En vente</Pill>}</div>
        <div className="sub mt8">B actuel : {F(d1.B)} {A.S.dia.anchor ? "· " + A.S.dia.anchor : ""}</div>
        <div className="list mt12">
          <button className="tile" onClick={() => A.push("dia", { s: "unit" })}><div style={{ padding: 12 }} className="row"><div><div className="h3">Unité #7</div><div className="sub">Cycle complet — livrée · preuve photo</div></div><Pill k="pOk">DELIVERED</Pill></div></button>
          <div className="card row"><div><div className="h3">Unité #12</div><div className="sub">{pr.done && pr.result === "markdown" ? "Démarquée — éligible « Dernières Pièces »" : "48 jours en stock — proposition en attente"}</div></div><Pill k="pWarn">⚠ 48 j</Pill></div>
          {live && <div className="card row"><div><div className="h3">Unité #3</div><div className="sub">Commande {live.code} — revendeuse Aïcha</div></div><Pill k="pInfo">RESERVED</Pill></div>}
          <div className="card row"><div><div className="h3">Unités #4–#11</div><div className="sub">Disponibles · photos studio · zone consignation</div></div><Pill k="pMut">AVAILABLE</Pill></div>
        </div>
      </div>
      <div className="card mt12">
        <div className="cap">Relevé hebdomadaire du propriétaire — sem. 27</div>
        <MoneyLines lines={[
          { l: "Position stock (unités)", v: String(d1.stock + 28) },
          { l: "Ventes validées (sem.)", v: "6", dim: true },
          { l: "Vieillissement > 45 j", v: "1 unité", dim: true },
          { l: "Frais (gestion + stockage)", v: "−1 800 F", dim: true },
        ]} total={{ l: "Net de la semaine", v: F(58950) }} />
        <div className="sub mt8">Présenté comme un relevé de fonds — c’est à ça que ressemble le respect.</div>
        <button className="chip mt8" onClick={() => A.toast("Relevé PDF envoyé sur votre WhatsApp (démo)")}>Télécharger</button>
      </div>
      <div className="note mt12">Stockage : <b>90 j gratuits</b>, puis barème publié par taille. 180 j impayés + injoignable ⇒ conditions d’abandon (produit net conservé pour vous ou votre bénéficiaire). Le hub ne devient jamais un cimetière.</div>
    </div>
  </>);
}

function DUnit() {
  const A = useApp();
  const steps = [
    ["RECEIVED", "12/05 — photo d’intake jointe"],
    ["AVAILABLE", "13/05 — studio fait, en vente (≤ 72 h ✓)"],
    ["RESERVED", "02/07 — commande #1189 · revendeuse Fatou · zone Dassasgho"],
    ["SEALED", "03/07 09:12 — scellé après vérification"],
    ["DELIVERED", "03/07 17:40 — preuve photo"],
    ["FONDS DISPONIBLES", "05/07 18:00 — après fenêtre retour classe A"],
  ];
  return (<>
    <Top title="Unité #7 — Sac Perle" sub="Le grand livre du propriétaire — transparence radicale" back={() => A.pop("dia")} />
    <div className="scroll">
      <div className="list">
        {steps.map(([k, v], i) => (
          <div key={i} className="card row"><div><div className="h3">{k}</div><div className="sub">{v}</div></div><Pill k="pOk">✓</Pill></div>
        ))}
      </div>
      <div className="note mt12">Regarder son commerce respirer depuis l’étranger, <b>c’est</b> le contrôle. Aucun levier physique — toute la vérité.</div>
    </div>
  </>);
}

function DMoney() {
  const A = useApp(); const D = A.S.dia;
  const [sheet, setSheet] = useState(false); const [rail, setRail] = useState("hebdo");
  const wf = ["CUSTOMER_PAID (webhook — seule vérité)", "OBLIGATIONS_RECORDED", "DELIVERY_VALIDATED (preuve Séra)", "RETURN_WINDOW (classe A : 0 h)", "SETTLED (frais déduits)", "AVAILABLE (vous agissez)", "PAYOUT_REQUESTED", "PAID"];
  const curIx = 5;
  return (<>
    <Top title="Argent — les règles paient" sub="Cascade déterministe · commande #1189" />
    <div className="scroll">
      <div className="list">
        {wf.map((s, i) => (
          <div key={i} className="card row" style={i === curIx ? { borderColor: "var(--pri)", borderWidth: 2 } : null}>
            <div className="h3" style={i > curIx ? { color: "var(--sub)", fontWeight: 600 } : null}>{i + 1}. {s}</div>
            {i < curIx ? <Pill k="pOk">✓</Pill> : i === curIx ? <Pill k="pInfo">Ici</Pill> : <Pill k="pMut">…</Pill>}
          </div>
        ))}
      </div>
      <div className="card mt12">
        <MoneyLines lines={[{ l: "En attente de validation", v: F(D.pendingSeed), dim: true }]} total={{ l: "Disponible maintenant", v: F(D.avail) }} />
        <button className="btn pri mt12" onClick={() => setSheet(true)}>Demander un payout</button>
      </div>
      <div className="card mt12">
        <div className="cap">« Tarifs : une page, zéro surprise »</div>
        <MoneyLines lines={[
          { l: "Intake & studio / SKU", v: "2 500 F", dim: true },
          { l: "Pack premium (vidéo, copie)", v: "7 500 F", dim: true },
          { l: "Gestion / commande livrée", v: "300 F", dim: true },
          { l: "Frais vendeur — identique à tous", v: "5 % de B", dim: true },
        ]} total={{ l: "Stockage", v: "90 j gratuits" }} />
      </div>
      <div className="note mt12">Comptes de payout : (1) votre compte vérifié · (2) entreprise enregistrée · (3) <b>bénéficiaire désigné</b> — D2+, KYC renforcé, délai de réflexion, journal des changements.</div>
      <div className="note mt8">Paiements v1 : <b>FCFA domestique</b> — l’international viendra via un partenaire licencié, structuré avec conseil. Jamais improvisé.</div>
      <div className="note badNote mt8">Règle dure : <b>aucun retrait de fonds non réglés</b> — pour personne, pas pour les VIP, pas une fois.</div>
    </div>
    <Sheet open={sheet} onClose={() => setSheet(false)} title="Demander un payout">
      <div className="chips">
        <button className={"chip " + (rail === "hebdo" ? "chipOn" : "")} onClick={() => setRail("hebdo")}>Hebdomadaire — gratuit</button>
        <button className={"chip " + (rail === "inst" ? "chipOn" : "")} onClick={() => setRail("inst")}>Instantané — frais affiché</button>
      </div>
      <div className="sub mt8">Rails finaux confirmés par le partenaire licencié avant toute promesse (frais, échecs, délais de retour).</div>
      <button className="btn pri mt16" onClick={() => { setSheet(false); A.toast("Payout " + (rail === "hebdo" ? "hebdomadaire" : "instantané") + " demandé : " + F(A.S.dia.avail) + " (démo)"); }}>Demander {F(A.S.dia.avail)}</button>
    </Sheet>
  </>);
}

function DEns() {
  const A = useApp(); const d1 = A.S.products.d1;
  return (<>
    <Top title="Mon Enseigne" sub="Projection de marque — l’exception bornée (SP-I03)" />
    <div className="scroll">
      <div className="cap mb6">Ce que voient les revendeuses Shop+</div>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ height: 84, background: d1.g }} />
        <div style={{ padding: 14 }}>
          <div className="row"><div className="h2">🌍 Maison Awa ✓</div><Pill k="pOk">Enseigne vérifiée</Pill></div>
          <div className="p mt8">« Accessoires choisis au Canada, stock vérifié au hub Ouaga. »</div>
          <div className="sub mt8">⭐ 4,9 · 27 livraisons validées · exécution 100 % hub</div>
        </div>
      </div>
      <div className="card mt12">
        <div className="cap">Le périmètre exact</div>
        <div className="p mt8">✓ Nom · ✓ Bannière · ✓ Histoire · ✓ Score · ✓ Compteur de livraisons</div>
        <div className="p mt8">✗ Contact · ✗ Adresse · ✗ Réseaux sociaux · ✗ Itinéraire hors plateforme</div>
        <div className="sub mt8">La garde au hub rend l’exception sûre : votre identité gagne de <b>l’attention</b>, jamais du classement (Supply Confidence identique pour tous).</div>
      </div>
      <div className="card mt12">
        <div className="cap">Ce que voit la cliente</div>
        <div className="p mt8">Uniquement : « 🌍 Sélection diaspora · vérifié au hub » — la revendeuse reste le visage de confiance.</div>
      </div>
      <button className="btn sec mt12" onClick={() => { A.setApp("mb"); A.reset("mb", { s: "opps" }); }}>Voir côté revendeuse →</button>
    </div>
  </>);
}
