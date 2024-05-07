import BoundingBox from './BoundingBox';

export enum ConversationAreaStatus {
  AvailableToRequest,
  DoNotDisturb,
  Public,
}

export type JoinRequest = {
  id: string;
  playerId: string;
  conversationLabel: string;
};

export type ServerConversationArea = {
  label: string;
  topic?: string;
  occupantsByID: string[];
  boundingBox: BoundingBox;
  status: ConversationAreaStatus;
  maxOccupants?: number;
  joinRequests: JoinRequest[];
};

export type ConversationAreaListener = {
  onTopicChange?: (newTopic: string | undefined) => void;
  onOccupantsChange?: (newOccupants: string[]) => void;
  onStatusChange?: (newStatus: ConversationAreaStatus) => void;
  onLimitChange?: (newLimit: string | undefined) => void;
  onJoinRequestChange?: (newJoinRequests: JoinRequest[]) => void;
};
export default class ConversationArea {
  private _occupants: string[] = [];

  private _label: string;

  private _topic?: string;

  private _boundingBox: BoundingBox;

  private _status: ConversationAreaStatus;

  private _maxOccupants?: number;
  
  private _joinRequests: JoinRequest[] = [];

  private _listeners: ConversationAreaListener[] = [];

  constructor(
    label: string,
    boundingBox: BoundingBox,
    topic?: string,
    status?: ConversationAreaStatus,
    maxOccupants?: number,
  ) {
    this._boundingBox = boundingBox;
    this._label = label;
    this._topic = topic;
    if (status !== undefined) {
      this._status = status;
    } else {
      this._status = ConversationAreaStatus.Public;
    }
    this._maxOccupants = maxOccupants;
  }

  get label() {
    return this._label;
  }

  set occupants(newOccupants: string[]) {
    if (
      newOccupants.length !== this._occupants.length ||
      !this._occupants.every(oldOccupant => newOccupants.includes(oldOccupant))
    ) {
      this._listeners.forEach(listener => listener.onOccupantsChange?.(newOccupants));
      this._occupants = newOccupants;
    }
  }

  get occupants() {
    return this._occupants;
  }

  get status() {
    return this._status;
  }

  set status(newStatus: ConversationAreaStatus) {
    if(this._status !== newStatus) {
      this._status = newStatus;
      this._listeners.forEach(listener => listener.onStatusChange?.(newStatus));
    }
  }

  set topic(newTopic: string | undefined) {
    if (this._topic !== newTopic) {
      this._listeners.forEach(listener => listener.onTopicChange?.(newTopic));
    }
    this._topic = newTopic;
  }

  get topic() {
    return this._topic || '(No topic)';
  }

  set maxOccupants(newMaxOccupants: number | undefined) {
    this._maxOccupants = newMaxOccupants;
  }

  get maxOccupants() {
    return this._maxOccupants;
  }

  get limit() {
    return `${this._occupants.length}/${this._maxOccupants}` || '';
  }

  set limit(newLimit: string | undefined) {
    const current = `${this._occupants.length}/${this._maxOccupants}`;
    if (current !== newLimit) {
      this._listeners.forEach(listener => listener.onLimitChange?.(newLimit));
    }
    this.limit = newLimit;
  }

  set joinRequests(newJoinRequests: JoinRequest[]) {
    if (
      newJoinRequests.length !== this._joinRequests.length ||
      !this._joinRequests.every(oldJoinRequest =>
        newJoinRequests.some(newJoinRequest => newJoinRequest.id === oldJoinRequest.id),
      )
    ) {
      this._listeners.forEach(listener => listener.onJoinRequestChange?.(newJoinRequests));
      this._joinRequests = newJoinRequests;
    }
  }

  get joinRequests() {
    return this._joinRequests;
  }

  isEmpty(): boolean {
    return this._topic === undefined;
  }

  getBoundingBox(): BoundingBox {
    return this._boundingBox;
  }

  toServerConversationArea(): ServerConversationArea {
    return {
      label: this.label,
      occupantsByID: this.occupants,
      topic: this.topic,
      boundingBox: this.getBoundingBox(),
      status: this.status,
      maxOccupants: this.maxOccupants,
      joinRequests: this.joinRequests,
    };
  }

  addListener(listener: ConversationAreaListener) {
    this._listeners.push(listener);
  }

  removeListener(listener: ConversationAreaListener) {
    this._listeners = this._listeners.filter(eachListener => eachListener !== listener);
  }

  static fromServerConversationArea(serverArea: ServerConversationArea): ConversationArea {
    const ret = new ConversationArea(
      serverArea.label,
      serverArea.boundingBox,
      serverArea.topic,
      serverArea.status,
      serverArea.maxOccupants,
    );
    ret.occupants = serverArea.occupantsByID;
    ret.joinRequests = serverArea.joinRequests;
    return ret;
  }
}
