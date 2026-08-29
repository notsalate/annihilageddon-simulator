export type PhysicalCardPointSearchReason =
  | "temporaryControl"
  | "knownCard"
  | "effectiveTypeSelection"
  | "gainedCardRecord"
  | "effectSource"
  | "unclassifiedId"
  | "removeById"
  | "reorderById"
  | "moveById";

export interface PhysicalCardDiagnosticsSink {
  recordPointLocationSearch(reason: PhysicalCardPointSearchReason): void;
  recordPhysicalZonePass(cardsViewed: number): void;
  recordFullLocationList(locationRecords: number): void;
  recordPhysicalLocationChanges(changes: number): void;
}
