/**
 * Tracked CPSC geographies confirmed to have no 2026 MA rate-book row.
 * These dissolved or superseded county-equivalents remain in CMS enrollment
 * files, but do not have an authoritative 2026 CMS benchmark.
 */
export const CONFIRMED_NO_2026_RATE: Record<string, string> = {
  "02031": "Angoon, AK — 1970s census division retired before FIPS successors",
  "02040": "Barrow-North Slope, AK — retired census division",
  "02080": "Cordova-McCarthy, AK — retired census division",
  "02120": "Kenai-Cook Inlet, AK — retired census division",
  "02201": "Prince of Wales-Outer Ketchikan, AK — dissolved 2008",
  "02230":
    "Skagway-Yakutat, AK — retired census division; rate-book 02230 is the current Skagway Municipality, a different geography",
  "02232": "Skagway-Hoonah-Angoon, AK — dissolved 2007",
  "02250": "Upper Yukon, AK — retired census division",
  "02261": "Valdez-Cordova, AK — split into Chugach and Copper River in 2019",
  "02280": "Wrangell-Petersburg, AK — dissolved 2008",
  "46131": "Washabaugh, SD — merged into Jackson County in 1983",
  "51515": "Bedford City, VA — reverted to town in Bedford County in 2013",
  "51560":
    "Clifton Forge City, VA — reverted to town in Alleghany County in 2001",
  "51780":
    "South Boston City, VA — reverted to town in Halifax County in 1995",
  "78030":
    "St. Thomas, USVI — no 2026 rate-book row published (book lists only St. Croix and St. John)",
};