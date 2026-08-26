declare const playerIdBrand: unique symbol;
declare const cardDefinitionIdBrand: unique symbol;
declare const cardInstanceIdBrand: unique symbol;
declare const attackIdBrand: unique symbol;
declare const tokenDefinitionIdBrand: unique symbol;
declare const tokenInstanceIdBrand: unique symbol;

type Brand<TName extends symbol> = string & { readonly [K in TName]: true };

// Staged migration plan: new id-producing code should use these helpers first,
// then existing engine/data interfaces can be narrowed one boundary at a time.
export type PlayerId = `player-${number}` & Brand<typeof playerIdBrand>;
export type CardDefinitionId = Brand<typeof cardDefinitionIdBrand>;
export type CardInstanceId = Brand<typeof cardInstanceIdBrand>;
export type AttackId = `attack-${number}` & Brand<typeof attackIdBrand>;
export type TokenDefinitionId = Brand<typeof tokenDefinitionIdBrand>;
export type TokenInstanceId = Brand<typeof tokenInstanceIdBrand>;

export function markPlayerId(value: `player-${number}`): PlayerId {
  return value as PlayerId;
}

export function markCardDefinitionId(value: string): CardDefinitionId {
  return value as CardDefinitionId;
}

export function markCardInstanceId(value: string): CardInstanceId {
  return value as CardInstanceId;
}

export function markAttackId(value: `attack-${number}`): AttackId {
  return value as AttackId;
}

export function markTokenDefinitionId(value: string): TokenDefinitionId {
  return value as TokenDefinitionId;
}

export function markTokenInstanceId(value: string): TokenInstanceId {
  return value as TokenInstanceId;
}

export function createPlayerId(playerNumber: number): PlayerId {
  assertPositiveSafeInteger(playerNumber, "player number");
  return markPlayerId(`player-${playerNumber}`);
}

export function createCardDefinitionId(value: string): CardDefinitionId {
  assertStableRuntimeId(value, "card definition id");
  return markCardDefinitionId(value);
}

export function createCardInstanceId(instanceNumber: number): CardInstanceId {
  assertPositiveSafeInteger(instanceNumber, "card instance number");
  return markCardInstanceId(`card-${instanceNumber}`);
}

export function createAttackId(attackNumber: number): AttackId {
  assertPositiveSafeInteger(attackNumber, "attack number");
  return markAttackId(`attack-${attackNumber}`);
}

export function createTokenDefinitionId(value: string): TokenDefinitionId {
  assertStableRuntimeId(value, "token definition id");
  return markTokenDefinitionId(value);
}

export function createTokenInstanceId(instanceNumber: number): TokenInstanceId {
  assertPositiveSafeInteger(instanceNumber, "token instance number");
  return markTokenInstanceId(`token-${instanceNumber}`);
}

function assertPositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${label} must be a positive safe integer`);
  }
}

function assertStableRuntimeId(value: string, label: string): void {
  if (value.length === 0 || value.trim() !== value) {
    throw new Error(`${label} must be a non-empty trimmed string`);
  }
}
