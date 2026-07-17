# Faso Premium redesign handoff — REFERENCE ONLY (Boutik+ lane)

The founder's redesign handoff bundle, committed here **byte-verbatim** so the
design brief survives container loss (it was originally an ephemeral upload,
`51d7a1bc`, ingested by an earlier session; a container death between
checkpoints lost the working copy and blocked a takeover — this commit closes
that gap).

## Status in the authority stack (HIERARCHY LAW, ruled at WO-FP-0)

> THE README DEFINES THE SYSTEM → THE v2 TOKENS ENCODE IT → THE HANDOFF.md IS
> THE SPEC AND THE Redesign.dc.html IS PIXEL-SOURCE FOR APP-LOCAL DETAIL.

- The **canonical tokens win**: every colour/type/radius/geometry/motion value
  that `@platform/ui-tokens` (Faso Premium, v1.0.0 / pin `f23407c`) encodes is
  the source of truth. Where a prototype usage strays from a token, the token
  wins and the app normalizes to it (straggler journaled).
- These files are **pixel-source for app-local detail only** — values that
  exist ONLY in the prototype (per-usage variance, `fpFade`/`fpToast`-class
  detail, the exact composition of the signature elements). They are never
  copied as implementation, and never override a token.

## Files (Boutik+ lane; the other three apps' variants are not in this repo)

- `README.md` — the shared system ("Faso Premium").
- `Boutik Plus - HANDOFF.md` — the Boutik+ implementation spec.
- `Boutik Plus - Redesign.dc.html` — the pixel-truth prototype (inline styles, greppable).
- `Boutik Plus - Ecrans.dc.html` — the 11-view review board (evidence is named against these frames).
- `support.js`, `ios-frame.jsx` — the prototype runtime + device frame (do not modify; needed only to open the `.dc.html` in a browser).

## Provenance (sha256, re-uploaded 2026-07-15)

```
fb2746856ed9d54032b713c52d89b4626a95922bcd0e537845d055036817ed2d  Boutik Plus - Ecrans.dc.html
eee023fd38eb4e7b37c274f795aec3ae4c4cc0f1780a04aab86c589a68b5eff9  Boutik Plus - HANDOFF.md
b64b7a8568e3e261b0f561b99c3bf351cab15467dd3f7e563625260c4f8bc102  Boutik Plus - Redesign.dc.html
f11618f0ddad09ba4a85d860733681f9b462ab1d8f8f19ebdad9e9c7b76dfa86  README.md
41db48d21f5ab75adb0e00ff2830bbe5cb5135f895f9dd4d3dd2b70f8a45d971  ios-frame.jsx
ae4f0ac8449655e17cca1e3b179effcb6817a3b0d8dc47f112a9c39c25c39fd7  support.js
```
