export type Direction = 'front' | 'back' | 'left' | 'right';
export type UserLocation = {
  x: number;
  y: number;
  rotation: Direction;
  moving: boolean;
  conversationLabel?: string;
};
export type CoveyTownList = {
  friendlyName: string;
  coveyTownID: string;
  currentOccupancy: number;
  maximumOccupancy: number;
}[];

export type JoinRequestList = {
  id: string;
  playerId: string;
  userName: string;
  conversationLabel: string;
  conversationTopic: string;
}[];

export type ChatMessage = {
  author: string;
  sid: string;
  body: string;
  dateCreated: Date;
};
