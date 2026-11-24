# Lands Department indoor routing sources

Use the matching 3D Indoor Network and 3D Pedestrian Network FGDB archives from CSDI.
The release manifest records SHA-256 hashes for both archives. Original geometry uses
HK1980 grid coordinates and HKPD elevation. Transform XY from EPSG:2326 to WGS84; retain
source elevation in metres. Attribution: Map from Lands Department, HKSAR Government.
Terms: https://portal.csdi.gov.hk/csdi-webpage/info/termsAndConditions

Indoor source service:
https://portal.csdi.gov.hk/server/rest/services/common/landsd_rcd_1742809197336_78665/FeatureServer/0

`PedestrianRoute` supplies segments; `PedRouteRelTerminalPoly` and
`PedRouteRelFloorPoly` associate station terminals and floor polygons. Enabled=1 is
accepted; Location=1 is outdoor, 2 is unpaid indoor, 3 is paid indoor. Direction=0 is
bidirectional, 1 forward, -1 reversed. Unknown access/direction, disabled segments and
unresolved AccessTimeID restrictions are excluded. Feature types retain stairs, ramps,
lifts, escalators, travelators and stairlifts. Unknown accessibility is not step-free.

Only XYZ coordinates identical at millimetre precision share source node identities.
Stable hashed JSON identities are converted to dense sequential OSM IDs during export to
keep reference-checking memory bounded. Floor association requires the source floor
group, containing polygon and elevation within 0.25 metres. Exact shared outdoor nodes
become portals. No 2D proximity edges are inserted.

Station name matching is exact, with an explicit source typo correction for terminal
1511000461 (Tseun Wan West, TWW). West Kowloon has no matching Hype baseline. Station
maps used for POI and display-floor matching are the 2026-11-15 baseline; each station
output records its baseline manifest hash. A new map release needs renewed validation.

Walking times are estimates using connector-specific speeds; lift wait is currently
charged per source segment. This can overestimate subdivided lift journeys. POI
attachments and connector timings need further review before claiming fastest routes.

The government route service at
https://mapapi.hkmapservice.gov.hk/PedRoute/NAServer/route/solve is a possible
comparison oracle. It is not called at runtime. Its recommended travel mode applies a
high paid area avoidance preference, which is not a strict unpaid-only guarantee.
