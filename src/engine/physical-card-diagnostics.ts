export interface PhysicalCardDiagnosticsSink {
  recordPointLocationSearch(): void;
  recordPhysicalZonePass(cardsViewed: number): void;
  recordFullLocationList(locationRecords: number): void;
  recordPhysicalLocationChanges(changes: number): void;
}
