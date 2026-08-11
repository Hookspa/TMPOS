(function exposeCatalogManifest(root, value) {
  const manifest = Object.freeze(value);
  if (typeof module === 'object' && module.exports) module.exports = manifest;
  else if (root) root.TempoCatalogManifest = manifest;
})(typeof globalThis !== 'undefined' ? globalThis : this, {
  "formatVersion": 1,
  "catalogFile": "refs_02.csv",
  "embeddedIdStrategy": "materialized-sha256-content-v1",
  "externalIdStrategy": "preserved-source-id",
  "rowCount": 6066,
  "uniqueIdCount": 6066,
  "uniqueLinkCount": 6044,
  "emptyLinkCount": 22,
  "sha256": "c7c1bead99610427a139ad8a50a20aa444d9f4a7bef8025ddcc13e8f4dfdf4b5"
});
