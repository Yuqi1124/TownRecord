import assert from 'assert';
import { customAlphabet, nanoid } from 'nanoid';
import {
  BoundingBox,
  ConversationAreaStatus,
  JoinRequest,
  ServerConversationArea,
} from '../client/TownsServiceClient';
import { ChatMessage, JoinRequestList, UserLocation } from '../CoveyTypes';
import CoveyTownListener from '../types/CoveyTownListener';
import Player, { PlayerPermissions } from '../types/Player';
import PlayerSession from '../types/PlayerSession';
import IVideoClient from './IVideoClient';
import TwilioVideo from './TwilioVideo';

const friendlyNanoID = customAlphabet('1234567890ABCDEF', 8);

/**
 * The CoveyTownController implements the logic for each town: managing the various events that
 * can occur (e.g. joining a town, moving, leaving a town)
 */
export default class CoveyTownController {
  get capacity(): number {
    return this._capacity;
  }

  set isPubliclyListed(value: boolean) {
    this._isPubliclyListed = value;
  }

  get isPubliclyListed(): boolean {
    return this._isPubliclyListed;
  }

  get townUpdatePassword(): string {
    return this._townUpdatePassword;
  }

  get players(): Player[] {
    return this._players;
  }

  get occupancy(): number {
    return this._listeners.length;
  }

  get friendlyName(): string {
    return this._friendlyName;
  }

  set friendlyName(value: string) {
    this._friendlyName = value;
  }

  get coveyTownID(): string {
    return this._coveyTownID;
  }

  get conversationAreas(): ServerConversationArea[] {
    return this._conversationAreas;
  }

  /** The list of players currently in the town * */
  private _players: Player[] = [];

  /** The list of valid sessions for this town * */
  private _sessions: PlayerSession[] = [];

  /** The videoClient that this CoveyTown will use to provision video resources * */
  private _videoClient: IVideoClient = TwilioVideo.getInstance();

  /** The list of CoveyTownListeners that are subscribed to events in this town * */
  private _listeners: CoveyTownListener[] = [];

  /** The list of currently active ConversationAreas in this town */
  private _conversationAreas: ServerConversationArea[] = [];

  private readonly _coveyTownID: string;

  private _friendlyName: string;

  private readonly _townUpdatePassword: string;

  private _isPubliclyListed: boolean;

  private _capacity: number;

  constructor(friendlyName: string, isPubliclyListed: boolean) {
    this._coveyTownID = process.env.DEMO_TOWN_ID === friendlyName ? friendlyName : friendlyNanoID();
    this._capacity = 50;
    this._townUpdatePassword = nanoid(24);
    this._isPubliclyListed = isPubliclyListed;
    this._friendlyName = friendlyName;
  }

  /**
   * Adds a player to this Covey Town, provisioning the necessary credentials for the
   * player, and returning them
   *
   * @param newPlayer The new player to add to the town
   */
  async addPlayer(newPlayer: Player): Promise<PlayerSession> {
    const theSession = new PlayerSession(newPlayer);

    this._sessions.push(theSession);
    this._players.push(newPlayer);

    // Create a video token for this user to join this town
    theSession.videoToken = await this._videoClient.getTokenForTown(
      this._coveyTownID,
      newPlayer.id,
    );

    // Notify other players that this player has joined
    this._listeners.forEach(listener => listener.onPlayerJoined(newPlayer));

    return theSession;
  }

  /**
   * Destroys all data related to a player in this town.
   *
   * @param session PlayerSession to destroy
   */
  destroySession(session: PlayerSession): void {
    this._players = this._players.filter(p => p.id !== session.player.id);
    this._sessions = this._sessions.filter(s => s.sessionToken !== session.sessionToken);
    this._listeners.forEach(listener => listener.onPlayerDisconnected(session.player));
    const conversation = session.player.activeConversationArea;
    if (conversation) {
      this.removePlayerFromConversationArea(session.player, conversation);
    }
  }

  /**
   * Updates the location of a player within the town
   *
   * If the player has changed conversation areas, this method also updates the
   * corresponding ConversationArea objects tracked by the town controller, and dispatches
   * any onConversationUpdated events as appropriate
   *
   * @param player Player to update location for
   * @param location New location for this player
   */
  updatePlayerLocation(player: Player, location: UserLocation): void {
    player.location = location;
    const conversation = this.conversationAreas.find(
      conv => conv.label === location.conversationLabel,
    );

    if (conversation?.status === ConversationAreaStatus.DoNotDisturb) {
      // Only keep the conversation label if they're already part of the conversation
      player.location = {
        ...location,
        conversationLabel: player.location.conversationLabel || undefined,
      };
      return;
    }

    const prevConversation = player.activeConversationArea;

    if (!conversation || conversation?.status === ConversationAreaStatus.Public) {
      player.location = location;
      player.activeConversationArea = conversation;
    }

    if (conversation !== prevConversation) {
      if (prevConversation) {
        this.removePlayerFromConversationArea(player, prevConversation);
      }

      if (conversation) {
        if (conversation.status === ConversationAreaStatus.Public) {
          player.location = location;
          conversation.occupantsByID.push(player.id);
        } else {
          // Only keep the conversation label if they're already part of the conversation
          player.location = {
            ...location,
            conversationLabel: player.location.conversationLabel || undefined,
          };
        }
        this._listeners.forEach(listener => listener.onConversationAreaUpdated(conversation));
      }
    }

    // Case where player leaves conversation area while join request is still active
    if (
      player.activeJoinRequest &&
      player.activeJoinRequest.conversationLabel !== conversation?.label
    ) {
      this.removeJoinRequest(player.activeJoinRequest);
    }

    this._listeners.forEach(listener => listener.onPlayerMoved(player));
  }

  /**
   * Removes a player from a conversation area, updating the conversation area's occupants/join requests list,
   * and emitting the appropriate message (area updated or area destroyed)
   *
   * Does not update the player's activeConversationArea property.
   *
   * @param player Player to remove from conversation area
   * @param conversation Conversation area to remove player from
   */
  removePlayerFromConversationArea(player: Player, conversation: ServerConversationArea): void {
    if (conversation.occupantsByID.find(p => p === player.id)) {
      conversation.occupantsByID.splice(
        conversation.occupantsByID.findIndex(p => p === player.id),
        1,
      );
    }

    const playerJoinRequest = player.activeJoinRequest;

    if (
      playerJoinRequest &&
      conversation.joinRequests &&
      conversation.joinRequests.find(joinRequest => joinRequest.id === playerJoinRequest.id)
    ) {
      this.removeJoinRequest(playerJoinRequest);
    }

    if (player.permissions === PlayerPermissions.Admin) {
      player.permissions = PlayerPermissions.Normal;
      this._listeners.forEach(listener => listener.onPlayerPermissionUpdated(player));
      conversation.status = ConversationAreaStatus.Public;
      if (conversation.joinRequests) {
        conversation.joinRequests.forEach(joinRequest => this.acceptJoinRequest(joinRequest));
      }
    }
    if (conversation.occupantsByID.length === 0) {
      this.conversationAreas.splice(
        this.conversationAreas.findIndex(conv => conv === conversation),
        1,
      );
      this._listeners.forEach(listener => listener.onConversationAreaDestroyed(conversation));
    } else {
      this._listeners.forEach(listener => listener.onConversationAreaUpdated(conversation));
    }
  }

  /**
   * Creates a new conversation area in this town if there is not currently an active
   * conversation with the same label.
   *
   * Adds any players who are in the region defined by the conversation area to it.
   *
   * Notifies any CoveyTownListeners that the conversation has been updated
   *
   * @param _conversationArea Information describing the conversation area to create. Ignores any
   *  occupantsById that are set on the conversation area that is passed to this method.
   *
   * @returns true if the conversation is successfully created, or false if not
   */
  addConversationArea(_conversationArea: ServerConversationArea, player: Player): boolean {
    if (
      this._conversationAreas.find(
        eachExistingConversation => eachExistingConversation.label === _conversationArea.label,
      )
    ) {
      return false;
    }

    if (_conversationArea.topic === '') {
      return false;
    }

    if (_conversationArea.maxOccupants && _conversationArea.maxOccupants <= 0) {
      return false;
    }

    if (
      this._conversationAreas.find(eachExistingConversation =>
        CoveyTownController.boxesOverlap(
          eachExistingConversation.boundingBox,
          _conversationArea.boundingBox,
        ),
      ) !== undefined
    ) {
      return false;
    }

    const newArea: ServerConversationArea = Object.assign(_conversationArea);
    this._conversationAreas.push(newArea);
    const playersInThisConversation = this.players.filter(p => p.isWithin(newArea));
    playersInThisConversation.forEach(p => {
      p.activeConversationArea = newArea;
    });
    newArea.occupantsByID = playersInThisConversation.map(p => p.id);

    // sets an Admin upon creation (if the target player wants to be the admin)
    if (_conversationArea.status === ConversationAreaStatus.AvailableToRequest) {
      player.permissions = PlayerPermissions.Admin;
      this._listeners.forEach(listener => listener.onPlayerPermissionUpdated(player));
    }

    this._listeners.forEach(listener => listener.onConversationAreaUpdated(newArea));
    return true;
  }

  /**
   * Updates the status of a conversation area if the player has the correct permission level
   *
   * @param conversationLabel is the label of the conversation area to be updated
   * @param player is the player updating teh conversation area
   * @param status is the new status to be assigned to the conversation area
   * @param maxOccupants is the new maxOccupants to be assigned to the conversation area
   * @returns true if the conversation area is correctly updated, false otherwise
   */
  updateConversationArea(
    conversationLabel: string,
    player: Player,
    { status, maxOccupants }: { status?: ConversationAreaStatus; maxOccupants?: number },
  ): boolean {
    const conversationArea = this.conversationAreas.find(ca => ca.label === conversationLabel);
    if (!conversationArea) {
      return false;
    }

    if (
      player.activeConversationArea?.label !== conversationLabel ||
      !conversationArea.occupantsByID.includes(player.id)
    ) {
      return false;
    }
    if (player.permissions !== PlayerPermissions.Admin) {
      return false;
    }

    if (
      maxOccupants !== undefined &&
      (!Number.isInteger(maxOccupants) || maxOccupants < conversationArea.occupantsByID.length)
    ) {
      return false;
    }

    if (status !== undefined) {
      conversationArea.status = status;
    }
    // No if check here because maxOccupants can be undefined (which represents unlimited occupants)
    conversationArea.maxOccupants = maxOccupants;

    // if the conversation area change to dnd or reach the limitation, deny all pending join requests
    if (
      conversationArea.status === ConversationAreaStatus.DoNotDisturb ||
      (conversationArea.status === ConversationAreaStatus.AvailableToRequest &&
        conversationArea.occupantsByID.length === conversationArea.maxOccupants)
    ) {
      if (conversationArea.joinRequests) {
        conversationArea.joinRequests.forEach(joinRequest => this.removeJoinRequest(joinRequest));
      }
    }

    if (conversationArea.status === ConversationAreaStatus.Public) {
      player.permissions = PlayerPermissions.Normal;
      this._listeners.forEach(listener => listener.onPlayerPermissionUpdated(player));
    }

    this._listeners.forEach(listener => listener.onConversationAreaUpdated(conversationArea));

    return true;
  }

  /**
   * Returns a list of pending requests for a given conversation area, provided that the requesting player
   * is the Admin for that conversation area
   * @param _conversationAreaLabel is the conversation area you want to get the request list from
   * @param player is the player request this list
   */
  getJoinRequests(_conversationAreaLabel: string, player: Player): JoinRequestList | undefined {
    const conversationArea = this.conversationAreas.find(ca => ca.label === _conversationAreaLabel);
    if (!conversationArea) {
      return undefined;
    }

    if (
      player.activeConversationArea !== conversationArea ||
      !conversationArea.occupantsByID.includes(player.id)
    ) {
      return undefined;
    }

    if (player.permissions !== PlayerPermissions.Admin) {
      return undefined;
    }

    const joinRequestList = conversationArea.joinRequests.map(joinRequest => {
      const reqPlayer = this.players.find(p => p.id === joinRequest.playerId);
      assert(reqPlayer);
      return {
        id: joinRequest.id,
        playerId: joinRequest.playerId,
        userName: reqPlayer.userName,
        conversationLabel: conversationArea.label,
        conversationTopic: conversationArea.topic,
      };
    });

    return joinRequestList;
  }

  /**
   * Calls the correct request of a player joining a conversation area depending on the decision. Admins
   * can accept/deny any join request for CAs they are admin of, and players can cancel their own join request
   * @param player the player accepting/denying the request
   * @param decision a boolean of whether the Admin wants to admit a player
   * @param joinRequest the request of the player to join the room
   * @returns whether or not the accept/deny was successful
   */
  updateJoinRequest(player: Player, decision: boolean, joinRequest: JoinRequest): boolean {
    // If player is not an admin, they can only deny their own request
    if (
      player.permissions !== PlayerPermissions.Admin &&
      (decision || player.id !== joinRequest.playerId)
    ) {
      return false;
    }

    const conversationArea = player.activeConversationArea;
    // If player is Admin, they can only accept/deny requests in their own CA
    if (
      player.permissions === PlayerPermissions.Admin &&
      (!conversationArea ||
        !conversationArea.joinRequests.some(caJoinRequest => caJoinRequest.id === joinRequest.id))
    ) {
      return false;
    }

    if (decision) {
      this.acceptJoinRequest(joinRequest);
    } else {
      this.removeJoinRequest(joinRequest);
    }
    return true;
  }

  /**
   * Creates a join request for the given conversation area for the given player,
   * provided that they not already an occupant, and have not made a request yet
   * @param _conversationAreaLabel corresponds to the conversation area to create a join request for
   * @param player is the player to create a join request for
   */
  createJoinRequest(_conversationAreaLabel: string, player: Player): boolean {
    const conversationArea = this.conversationAreas.find(ca => ca.label === _conversationAreaLabel);
    if (!conversationArea) {
      return false;
    }

    if (conversationArea.status !== ConversationAreaStatus.AvailableToRequest) {
      return false;
    }

    if (
      player.activeConversationArea ||
      player.activeJoinRequest ||
      !player.isWithin(conversationArea)
    ) {
      return false;
    }

    const newJoinRequest: JoinRequest = {
      id: nanoid(),
      playerId: player.id,
      conversationLabel: conversationArea.label,
    };
    conversationArea.joinRequests.push(newJoinRequest);
    player.activeJoinRequest = newJoinRequest;

    this._listeners.forEach(listener => listener.onConversationAreaUpdated(conversationArea));
    // reject join request automatically if the conversation area reach the max occups
    // want to have a "create-reject" process rather than do not create request at all
    if (
      conversationArea.maxOccupants &&
      conversationArea.maxOccupants === conversationArea.occupantsByID.length
    ) {
      this.removeJoinRequest(newJoinRequest);
    }

    this._listeners.forEach(listener => listener.onConversationAreaUpdated(conversationArea));

    return true;
  }

  /**
   * Accepts the given join request
   * @param joinRequest is the request to be accepted
   * @returns a boolean indicating whether or not the accept was successful
   */
  acceptJoinRequest(joinRequest: JoinRequest): boolean {
    const conversationArea = this.conversationAreas.find(
      ca => ca.label === joinRequest.conversationLabel,
    );
    const player = this.players.find(p => p.id === joinRequest.playerId);
    if (!conversationArea || !player) {
      return false;
    }
    // Add the Player to the conversation area
    conversationArea.occupantsByID.push(player.id);
    player.activeConversationArea = conversationArea;

    // Update the Player's location to include the conversation area
    player.location = { ...player.location, conversationLabel: conversationArea.label };

    // Remove the join request from the conversation area/player
    conversationArea.joinRequests = conversationArea.joinRequests.filter(
      request => request.id !== joinRequest.id,
    );
    player.activeJoinRequest = undefined;

    // automatically deny all pending join request if the ca reach the max occups
    if (conversationArea.maxOccupants === conversationArea.occupantsByID.length) {
      conversationArea.joinRequests.forEach(jq => this.removeJoinRequest(jq));
    }
    this._listeners.forEach(listener => {
      listener.onPlayerMoved(player); // Called to update the player's activeConversationArea
      listener.onConversationAreaUpdated(conversationArea);
    });
    return true;
  }

  /**
   * Denies the given join request
   * @param joinRequest is the join request to be denied
   * @returns a boolean indicating whether or not the deny was successful
   */
  removeJoinRequest(joinRequest: JoinRequest): boolean {
    const conversationArea = this.conversationAreas.find(
      ca => ca.label === joinRequest.conversationLabel,
    );
    const player = this.players.find(p => p.id === joinRequest.playerId);
    if (!conversationArea || !player) {
      return false;
    }

    // Remove the join request from the conversation area/player
    conversationArea.joinRequests = conversationArea.joinRequests.filter(
      request => request.id !== joinRequest.id,
    );
    player.activeJoinRequest = undefined;
    this._listeners.forEach(listener => {
      listener.onPlayerMoved(player); // Called to update the player's activeConversationArea
      listener.onConversationAreaUpdated(conversationArea);
    });
    return true;
  }

  /**
   * Detects whether two bounding boxes overlap and share any points
   *
   * @param box1
   * @param box2
   * @returns true if the boxes overlap, otherwise false
   */
  static boxesOverlap(box1: BoundingBox, box2: BoundingBox): boolean {
    // Helper function to extract the top left (x1,y1) and bottom right corner (x2,y2) of each bounding box
    const toRectPoints = (box: BoundingBox) => ({
      x1: box.x - box.width / 2,
      x2: box.x + box.width / 2,
      y1: box.y - box.height / 2,
      y2: box.y + box.height / 2,
    });
    const rect1 = toRectPoints(box1);
    const rect2 = toRectPoints(box2);
    const noOverlap =
      rect1.x1 >= rect2.x2 || rect2.x1 >= rect1.x2 || rect1.y1 >= rect2.y2 || rect2.y1 >= rect1.y2;
    return !noOverlap;
  }

  /**
   * Subscribe to events from this town. Callers should make sure to
   * unsubscribe when they no longer want those events by calling removeTownListener
   *
   * @param listener New listener
   */
  addTownListener(listener: CoveyTownListener): void {
    this._listeners.push(listener);
  }

  /**
   * Unsubscribe from events in this town.
   *
   * @param listener The listener to unsubscribe, must be a listener that was registered
   * with addTownListener, or otherwise will be a no-op
   */
  removeTownListener(listener: CoveyTownListener): void {
    this._listeners = this._listeners.filter(v => v !== listener);
  }

  onChatMessage(message: ChatMessage): void {
    this._listeners.forEach(listener => listener.onChatMessage(message));
  }

  /**
   * Fetch a player's session based on the provided session token. Returns undefined if the
   * session token is not valid.
   *
   * @param token
   */
  getSessionByToken(token: string): PlayerSession | undefined {
    return this._sessions.find(p => p.sessionToken === token);
  }

  disconnectAllPlayers(): void {
    this._listeners.forEach(listener => listener.onTownDestroyed());
  }
}
