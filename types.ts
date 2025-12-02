export enum CardType {
  TREASURE = 'TREASURE',
  VICTORY = 'VICTORY',
  ACTION = 'ACTION',
  CURSE = 'CURSE',
  REACTION = 'REACTION', // Subset of Action, but useful for styling
}

export interface CardDef {
  id: string;
  name: string;
  cost: number;
  type: CardType;
  image: string; // URL for the card art
  value?: number; // For Treasure (money)
  points?: number; // For Victory (VP)
  description?: string;
  // Action effects
  actions?: number;
  cards?: number;
  buys?: number;
  gold?: number; // Virtual money added for the turn
}

export interface Player {
  id: number;
  name: string;
  deck: CardDef[];
  hand: CardDef[];
  discard: CardDef[];
  playArea: CardDef[];
  actions: number;
  buys: number;
  gold: number;
}

export interface GameState {
  // Current player's view for the advisor
  deck: CardDef[];
  hand: CardDef[];
  discard: CardDef[];
  playArea: CardDef[];
  supply: Record<string, number>; // Card ID -> Count
  
  // Turn resources
  actions: number;
  buys: number;
  gold: number; // Current spending power in pool
  
  turnCount: number;
  log: string[];
}

export interface BoardSetup {
  id: string;
  name: string;
  description: string;
  cards: string[]; // Array of Card IDs
  difficulty: 'Easy' | 'Medium' | 'Hard';
}

export interface AdvisorResponse {
  advice: string;
}

// --- Multiplayer Types ---

export type GameMode = 'LOCAL' | 'ONLINE_HOST' | 'ONLINE_CLIENT';

export interface NetworkMessage {
  type: 'JOIN' | 'START_GAME' | 'STATE_UPDATE' | 'ACTION' | 'RESOLVE_INTERACTION';
  payload?: any;
}

export interface GameActionPayload {
  actionType: 'PLAY_CARD' | 'BUY_CARD' | 'PLAY_ALL_TREASURES' | 'END_TURN';
  cardIndex?: number;
  cardId?: string;
  playerIndex?: number; // Should match the sender
}