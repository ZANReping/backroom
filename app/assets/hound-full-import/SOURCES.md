# Hound full import source record

- Source: user-provided ZIP `C:\Users\ZANRe\Downloads\hound-full.zip`.
- ZIP size: 32,572,586 bytes; SHA-256 `1852e584c81fa5c32ca92e3f5641b2f0ae8e1241be597a5cb7209708ad741612`.
- Extracted source directory: `C:\Users\ZANRe\AppData\Local\Temp\hound-l02-import-20261026\hound`.
- Imported evidence files copied here: `HOUND-REMAKE.md`, `APPLY.md`, `hound-pinhud.jpg`, `hound-stage3.jpg`, and `hound-fp-pin.jpg`.
- Original package records:
  - `hound-full.patch`: 39,785,842 bytes; SHA-256 `bc6be373daff5445573e609f8f145e85404bc264bbc591f935eb36e897498897` (not copied).
  - `HOUND-REMAKE.md`: 32,701 bytes; SHA-256 `b83b7646472988cb10f726a96063ed614329abdb0d5b410c014bc9b19e16f2c1`.
  - `APPLY.md`: 3,842 bytes; SHA-256 `44d18828e76cdb3ff2dfa734aaa725e6de24f741d5cc1cc34bc05f911fc69a83`.
  - `hound-pinhud.jpg`: 53,077 bytes; SHA-256 `330675001bdc271d952dcffeb20be60cd0ac8598a5c8607a0c82076f50cf4df1`.
  - `hound-stage3.jpg`: 64,626 bytes; SHA-256 `650501ac0e8fae955c9e56cabde6595c92708c5682dcd5782d3e1b203abb8128`.
  - `hound-fp-pin.jpg`: 313,052 bytes; SHA-256 `5a3511f6e3789f8f28ccf644e08944f6808f19feb301a9b888e07d214671f869`.
- Package text is retained as source material only. No package commands were executed; the raw patch and historical report tree were not copied; runtime code was merged separately.
- No separate package license statement was identified in the supplied Hound package; no permission is inferred.

## Project integration — 2026-10-26

Source baseline: six supplied Hound stages through e24ddaa (package baseline 032a79a). The procedural model, texture generation, animation, AI, HUD and tests were merged into the existing project, rather than replacing its tree. Model construction and texture preparation were adapted to cooperative jobs and the current GPU warmup/disposal path. Existing form IDs and natural spawn registrations were retained.

The supplied document credits a sketch by chompgwenarts (CC BY-SA 4.0) as a shape reference only; the reference image is not used as a runtime texture. No broader package license is invented by this import. The original source record remains above.

[Current integration](../../HOUND-L02-IMPORT.md) · [Actual game evidence and limitations](../../reports/hound-l02-import-20261026/README.md).
