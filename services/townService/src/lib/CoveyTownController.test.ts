import assert from 'assert';
import { mock, mockDeep, mockReset } from 'jest-mock-extended';
import { nanoid } from 'nanoid';
import { Socket } from 'socket.io';
import * as TestUtils from '../client/TestUtils';
import {
  ConversationAreaStatus,
  JoinRequest,
  ServerConversationArea,
} from '../client/TownsServiceClient';
import { UserLocation } from '../CoveyTypes';
import { townSubscriptionHandler } from '../requestHandlers/CoveyTownRequestHandlers';
import CoveyTownListener from '../types/CoveyTownListener';
import Player, { PlayerPermissions } from '../types/Player';
import PlayerSession from '../types/PlayerSession';
import CoveyTownController from './CoveyTownController';
import CoveyTownsStore from './CoveyTownsStore';
import TwilioVideo from './TwilioVideo';

const mockTwilioVideo = mockDeep<TwilioVideo>();
jest.spyOn(TwilioVideo, 'getInstance').mockReturnValue(mockTwilioVideo);

function generateTestLocation(): UserLocation {
  return {
    rotation: 'back',
    moving: Math.random() < 0.5,
    x: Math.floor(Math.random() * 100),
    y: Math.floor(Math.random() * 100),
  };
}

describe('CoveyTownController', () => {
  beforeEach(() => {
    mockTwilioVideo.getTokenForTown.mockClear();
  });
  it('constructor should set the friendlyName property', () => {
    const townName = `FriendlyNameTest-${nanoid()}`;
    const townController = new CoveyTownController(townName, false);
    expect(townController.friendlyName).toBe(townName);
  });
  describe('addPlayer', () => {
    it('should use the coveyTownID and player ID properties when requesting a video token', async () => {
      const townName = `FriendlyNameTest-${nanoid()}`;
      const townController = new CoveyTownController(townName, false);
      const newPlayerSession = await townController.addPlayer(new Player(nanoid()));
      expect(newPlayerSession.player.permissions).toBe(PlayerPermissions.Normal);
      expect(mockTwilioVideo.getTokenForTown).toBeCalledTimes(1);
      expect(mockTwilioVideo.getTokenForTown).toBeCalledWith(
        townController.coveyTownID,
        newPlayerSession.player.id,
      );
    });
  });
  describe('town listeners and events', () => {
    let testingTown: CoveyTownController;
    const mockListeners = [
      mock<CoveyTownListener>(),
      mock<CoveyTownListener>(),
      mock<CoveyTownListener>(),
    ];
    beforeEach(() => {
      const townName = `town listeners and events tests ${nanoid()}`;
      testingTown = new CoveyTownController(townName, false);
      mockListeners.forEach(mockReset);
    });
    it('should notify added listeners of player movement when updatePlayerLocation is called', async () => {
      const player = new Player('test player');
      await testingTown.addPlayer(player);
      const newLocation = generateTestLocation();
      mockListeners.forEach(listener => testingTown.addTownListener(listener));
      testingTown.updatePlayerLocation(player, newLocation);
      mockListeners.forEach(listener => expect(listener.onPlayerMoved).toBeCalledWith(player));
    });
    it('should notify added listeners of player disconnections when destroySession is called', async () => {
      const player = new Player('test player');
      const session = await testingTown.addPlayer(player);

      mockListeners.forEach(listener => testingTown.addTownListener(listener));
      testingTown.destroySession(session);
      mockListeners.forEach(listener =>
        expect(listener.onPlayerDisconnected).toBeCalledWith(player),
      );
    });
    it('should notify added listeners of new players when addPlayer is called', async () => {
      mockListeners.forEach(listener => testingTown.addTownListener(listener));

      const player = new Player('test player');
      await testingTown.addPlayer(player);
      mockListeners.forEach(listener => expect(listener.onPlayerJoined).toBeCalledWith(player));
    });
    it('should notify added listeners that the town is destroyed when disconnectAllPlayers is called', async () => {
      const player = new Player('test player');
      await testingTown.addPlayer(player);

      mockListeners.forEach(listener => testingTown.addTownListener(listener));
      testingTown.disconnectAllPlayers();
      mockListeners.forEach(listener => expect(listener.onTownDestroyed).toBeCalled());
    });
    it('should not notify removed listeners of player movement when updatePlayerLocation is called', async () => {
      const player = new Player('test player');
      await testingTown.addPlayer(player);

      mockListeners.forEach(listener => testingTown.addTownListener(listener));
      const newLocation = generateTestLocation();
      const listenerRemoved = mockListeners[1];
      testingTown.removeTownListener(listenerRemoved);
      testingTown.updatePlayerLocation(player, newLocation);
      expect(listenerRemoved.onPlayerMoved).not.toBeCalled();
    });
    it('should not notify removed listeners of player disconnections when destroySession is called', async () => {
      const player = new Player('test player');
      const session = await testingTown.addPlayer(player);

      mockListeners.forEach(listener => testingTown.addTownListener(listener));
      const listenerRemoved = mockListeners[1];
      testingTown.removeTownListener(listenerRemoved);
      testingTown.destroySession(session);
      expect(listenerRemoved.onPlayerDisconnected).not.toBeCalled();
    });
    it('should not notify removed listeners of new players when addPlayer is called', async () => {
      const player = new Player('test player');

      mockListeners.forEach(listener => testingTown.addTownListener(listener));
      const listenerRemoved = mockListeners[1];
      testingTown.removeTownListener(listenerRemoved);
      const session = await testingTown.addPlayer(player);
      testingTown.destroySession(session);
      expect(listenerRemoved.onPlayerJoined).not.toBeCalled();
    });

    it('should not notify removed listeners that the town is destroyed when disconnectAllPlayers is called', async () => {
      const player = new Player('test player');
      await testingTown.addPlayer(player);

      mockListeners.forEach(listener => testingTown.addTownListener(listener));
      const listenerRemoved = mockListeners[1];
      testingTown.removeTownListener(listenerRemoved);
      testingTown.disconnectAllPlayers();
      expect(listenerRemoved.onTownDestroyed).not.toBeCalled();
    });
  });
  describe('townSubscriptionHandler', () => {
    const mockSocket = mock<Socket>();
    let testingTown: CoveyTownController;
    let player: Player;
    let session: PlayerSession;
    beforeEach(async () => {
      const townName = `connectPlayerSocket tests ${nanoid()}`;
      testingTown = CoveyTownsStore.getInstance().createTown(townName, false);
      mockReset(mockSocket);
      player = new Player('test player');
      session = await testingTown.addPlayer(player);
    });
    it('should reject connections with invalid town IDs by calling disconnect', async () => {
      TestUtils.setSessionTokenAndTownID(nanoid(), session.sessionToken, mockSocket);
      townSubscriptionHandler(mockSocket);
      expect(mockSocket.disconnect).toBeCalledWith(true);
    });
    it('should reject connections with invalid session tokens by calling disconnect', async () => {
      TestUtils.setSessionTokenAndTownID(testingTown.coveyTownID, nanoid(), mockSocket);
      townSubscriptionHandler(mockSocket);
      expect(mockSocket.disconnect).toBeCalledWith(true);
    });
    describe('with a valid session token', () => {
      it('should add a town listener, which should emit "newPlayer" to the socket when a player joins', async () => {
        TestUtils.setSessionTokenAndTownID(
          testingTown.coveyTownID,
          session.sessionToken,
          mockSocket,
        );
        townSubscriptionHandler(mockSocket);
        await testingTown.addPlayer(player);
        expect(mockSocket.emit).toBeCalledWith('newPlayer', player);
      });
      it('should add a town listener, which should emit "playerMoved" to the socket when a player moves', async () => {
        TestUtils.setSessionTokenAndTownID(
          testingTown.coveyTownID,
          session.sessionToken,
          mockSocket,
        );
        townSubscriptionHandler(mockSocket);
        testingTown.updatePlayerLocation(player, generateTestLocation());
        expect(mockSocket.emit).toBeCalledWith('playerMoved', player);
      });
      it('should add a town listener, which should emit "playerDisconnect" to the socket when a player disconnects', async () => {
        TestUtils.setSessionTokenAndTownID(
          testingTown.coveyTownID,
          session.sessionToken,
          mockSocket,
        );
        townSubscriptionHandler(mockSocket);
        testingTown.destroySession(session);
        expect(mockSocket.emit).toBeCalledWith('playerDisconnect', player);
      });
      it('should add a town listener, which should emit "townClosing" to the socket and disconnect it when disconnectAllPlayers is called', async () => {
        TestUtils.setSessionTokenAndTownID(
          testingTown.coveyTownID,
          session.sessionToken,
          mockSocket,
        );
        townSubscriptionHandler(mockSocket);
        testingTown.disconnectAllPlayers();
        expect(mockSocket.emit).toBeCalledWith('townClosing');
        expect(mockSocket.disconnect).toBeCalledWith(true);
      });
      describe('when a socket disconnect event is fired', () => {
        it('should remove the town listener for that socket, and stop sending events to it', async () => {
          TestUtils.setSessionTokenAndTownID(
            testingTown.coveyTownID,
            session.sessionToken,
            mockSocket,
          );
          townSubscriptionHandler(mockSocket);

          // find the 'disconnect' event handler for the socket, which should have been registered after the socket was connected
          const disconnectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'disconnect');
          if (disconnectHandler && disconnectHandler[1]) {
            disconnectHandler[1]();
            const newPlayer = new Player('should not be notified');
            await testingTown.addPlayer(newPlayer);
            expect(mockSocket.emit).not.toHaveBeenCalledWith('newPlayer', newPlayer);
          } else {
            fail('No disconnect handler registered');
          }
        });
        it('should destroy the session corresponding to that socket', async () => {
          TestUtils.setSessionTokenAndTownID(
            testingTown.coveyTownID,
            session.sessionToken,
            mockSocket,
          );
          townSubscriptionHandler(mockSocket);

          // find the 'disconnect' event handler for the socket, which should have been registered after the socket was connected
          const disconnectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'disconnect');
          if (disconnectHandler && disconnectHandler[1]) {
            disconnectHandler[1]();
            mockReset(mockSocket);
            TestUtils.setSessionTokenAndTownID(
              testingTown.coveyTownID,
              session.sessionToken,
              mockSocket,
            );
            townSubscriptionHandler(mockSocket);
            expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
          } else {
            fail('No disconnect handler registered');
          }
        });
      });
      it('should forward playerMovement events from the socket to subscribed listeners', async () => {
        TestUtils.setSessionTokenAndTownID(
          testingTown.coveyTownID,
          session.sessionToken,
          mockSocket,
        );
        townSubscriptionHandler(mockSocket);
        const mockListener = mock<CoveyTownListener>();
        testingTown.addTownListener(mockListener);
        // find the 'playerMovement' event handler for the socket, which should have been registered after the socket was connected
        const playerMovementHandler = mockSocket.on.mock.calls.find(
          call => call[0] === 'playerMovement',
        );
        if (playerMovementHandler && playerMovementHandler[1]) {
          const newLocation = generateTestLocation();
          player.location = newLocation;
          playerMovementHandler[1](newLocation);
          expect(mockListener.onPlayerMoved).toHaveBeenCalledWith(player);
        } else {
          fail('No playerMovement handler registered');
        }
      });
    });
  });
  describe('addConversationArea', () => {
    let testingTown: CoveyTownController;
    let player: Player;
    beforeEach(async () => {
      const townName = `addConversationArea test town ${nanoid()}`;
      testingTown = new CoveyTownController(townName, false);
      player = new Player('test player');
      await testingTown.addPlayer(player);
    });
    it('should add the conversation area to the list of conversation areas', () => {
      const newConversationArea = TestUtils.createConversationForTesting();
      const result = testingTown.addConversationArea(newConversationArea, player);
      expect(result).toBe(true);
      const areas = testingTown.conversationAreas;
      expect(areas.length).toEqual(1);
      expect(areas[0].label).toEqual(newConversationArea.label);
      expect(areas[0].topic).toEqual(newConversationArea.topic);
      expect(areas[0].boundingBox).toEqual(newConversationArea.boundingBox);
      expect(areas[0].maxOccupants).toBe(undefined);
    });

    it('should add the conversation area with max occupants to the list of conversation areas', () => {
      const newConversationArea = TestUtils.createConversationForTesting({ maxOccupants: 10 });
      const result = testingTown.addConversationArea(newConversationArea, player);
      expect(result).toBe(true);
      const areas = testingTown.conversationAreas;
      expect(areas.length).toEqual(1);
      expect(areas[0].label).toEqual(newConversationArea.label);
      expect(areas[0].topic).toEqual(newConversationArea.topic);
      expect(areas[0].boundingBox).toEqual(newConversationArea.boundingBox);
      expect(areas[0].maxOccupants).toBe(10);
    });
  });

  describe('addConversationArea with Admin', () => {
    let testingTown: CoveyTownController;
    let player: Player;
    let session: PlayerSession;
    beforeEach(async () => {
      const townName = `addConversationArea test town ${nanoid()}`;
      testingTown = new CoveyTownController(townName, false);
      const mockSocket = mock<Socket>();
      player = new Player('test player');
      session = await testingTown.addPlayer(player);
      TestUtils.setSessionTokenAndTownID(nanoid(), session.sessionToken, mockSocket);
    });
    it("if player reject to be the admin then it's permission is normal", () => {
      const newCA = TestUtils.createConversationForTesting();
      testingTown.addConversationArea(newCA, player);
      expect(player.permissions).toEqual(PlayerPermissions.Normal);
    });
    it("if player accept to be the admin then iy's permission is admin", () => {
      const newCA = TestUtils.createConversationForTesting();
      newCA.status = ConversationAreaStatus.AvailableToRequest;
      testingTown.addConversationArea(newCA, player);
      expect(player.permissions).toEqual(PlayerPermissions.Admin);
    });
  });

  describe('removePlayerFromConversationArea with Admin', () => {
    let testingTown: CoveyTownController;
    let player: Player;
    let newCA: ServerConversationArea;
    beforeEach(async () => {
      const townName = `removePlayerFromConversationArea test town ${nanoid()}`;
      testingTown = new CoveyTownController(townName, false);
      player = new Player('test player');
      await testingTown.addPlayer(player);
      newCA = TestUtils.createConversationForTesting({
        boundingBox: { x: 0, y: 0, width: 5, height: 5 },
        status: ConversationAreaStatus.AvailableToRequest,
      });
      // Creating the conversation area will set the player to Admin
      testingTown.addConversationArea(newCA, player);
    });
    it('should set a conversation status to public when its admin leaves', () => {
      testingTown.removePlayerFromConversationArea(player, newCA);
      expect(newCA.status).toEqual(ConversationAreaStatus.Public);
    });

    it("should accept all active join requests when a conversation area's admin leaves", async () => {
      const joiningPlayer1 = new Player(nanoid());
      await testingTown.addPlayer(joiningPlayer1);
      const result1 = testingTown.createJoinRequest(newCA.label, joiningPlayer1);
      expect(result1).toBe(true);

      const joiningPlayer2 = new Player(nanoid());
      await testingTown.addPlayer(joiningPlayer2);
      const result2 = testingTown.createJoinRequest(newCA.label, joiningPlayer2);
      expect(result2).toBe(true);

      testingTown.removePlayerFromConversationArea(player, newCA);
      const conversationArea = testingTown.conversationAreas[0];
      expect(conversationArea.occupantsByID.length).toBe(2);

      expect(conversationArea.occupantsByID[0]).toBe(joiningPlayer1.id);
      expect(joiningPlayer1.activeConversationArea).toBe(conversationArea);

      expect(conversationArea.occupantsByID[1]).toBe(joiningPlayer2.id);
      expect(joiningPlayer2.activeConversationArea).toBe(conversationArea);
    });

    it('should not change a conversation status when a non-admin member leaves', async () => {
      // Add non-admin player to conversation area
      const otherPlayer = new Player(nanoid());
      await testingTown.addPlayer(otherPlayer);
      const result1 = testingTown.createJoinRequest(newCA.label, otherPlayer);
      expect(result1).toBe(true);
      assert(otherPlayer.activeJoinRequest);
      const result2 = testingTown.acceptJoinRequest(otherPlayer.activeJoinRequest);
      expect(result2).toBe(true);

      testingTown.removePlayerFromConversationArea(otherPlayer, newCA);
      expect(testingTown.conversationAreas[0].status).toEqual(
        ConversationAreaStatus.AvailableToRequest,
      );
    });

    it("should remove a non-admin player's join request when they leave", async () => {
      // Add non-admin player to conversation area
      const otherPlayer = new Player(nanoid());
      await testingTown.addPlayer(otherPlayer);
      const result = testingTown.createJoinRequest(newCA.label, otherPlayer);
      expect(result).toBe(true);

      testingTown.removePlayerFromConversationArea(otherPlayer, newCA);
      expect(testingTown.conversationAreas[0].joinRequests.length).toBe(0);
    });
  });

  describe('updateConversationArea', () => {
    let testingTown: CoveyTownController;
    let player: Player;
    let conversationArea: ServerConversationArea;
    let conversationLabel: string;
    beforeEach(async () => {
      const townName = `updateConversationArea test town ${nanoid()}`;
      testingTown = new CoveyTownController(townName, false);

      player = new Player(nanoid());
      await testingTown.addPlayer(player);

      conversationArea = TestUtils.createConversationForTesting({
        boundingBox: { x: 0, y: 0, height: 5, width: 5 },
      });
      conversationLabel = conversationArea.label;
      testingTown.addConversationArea(conversationArea, player);
      expect(testingTown.conversationAreas[0].status).toBe(ConversationAreaStatus.Public);
    });

    it('should deny all pending requests if the conversation area has been set to DND', async () => {
      const player2 = new Player(nanoid());
      await testingTown.addPlayer(player2);

      const newConversationArea2 = TestUtils.createConversationForTesting({
        boundingBox: { x: 50, y: 50, height: 10, width: 10 },
      });

      const location: UserLocation = {
        moving: false,
        rotation: 'front',
        x: 53,
        y: 53,
        conversationLabel: nanoid(),
      };

      player2.location = location;

      newConversationArea2.status = ConversationAreaStatus.AvailableToRequest;
      newConversationArea2.maxOccupants = 3;
      const result = testingTown.addConversationArea(newConversationArea2, player2);
      expect(result).toBe(true);
      expect(player2.permissions).toBe(PlayerPermissions.Admin);

      const newPlayer1 = new Player(nanoid());
      newPlayer1.location = location;
      const newPlayer2 = new Player(nanoid());
      newPlayer2.location = location;
      await testingTown.addPlayer(newPlayer1);
      await testingTown.addPlayer(newPlayer2);
      const result1 = testingTown.createJoinRequest(newConversationArea2.label, newPlayer1);
      const result2 = testingTown.createJoinRequest(newConversationArea2.label, newPlayer2);
      expect(result1).toBe(true);
      expect(result2).toBe(true);
      expect(testingTown.conversationAreas[1].joinRequests.length).toBe(2);
      expect(testingTown.conversationAreas[1].occupantsByID.length).toBe(1);

      const updateResult = testingTown.updateConversationArea(newConversationArea2.label, player2, {
        status: ConversationAreaStatus.DoNotDisturb,
      });
      expect(updateResult).toBe(true);
      expect(testingTown.conversationAreas[1].joinRequests.length).toBe(0);
      expect(newPlayer1.activeConversationArea).toBe(undefined);
      expect(newPlayer2.activeConversationArea).toBe(undefined);
    });

    it('deny all pending requests if conversation areas occupants limitation has been set to the current occupants amount', async () => {
      const player2 = new Player(nanoid());
      await testingTown.addPlayer(player2);

      const newConversationArea2 = TestUtils.createConversationForTesting({
        boundingBox: { x: 50, y: 50, height: 10, width: 10 },
      });

      const location: UserLocation = {
        moving: false,
        rotation: 'front',
        x: 53,
        y: 53,
        conversationLabel: nanoid(),
      };

      player2.location = location;

      newConversationArea2.status = ConversationAreaStatus.AvailableToRequest;
      newConversationArea2.maxOccupants = 3;
      const result = testingTown.addConversationArea(newConversationArea2, player2);
      expect(result).toBe(true);
      expect(player2.permissions).toBe(PlayerPermissions.Admin);

      const newPlayer1 = new Player(nanoid());
      newPlayer1.location = location;
      const newPlayer2 = new Player(nanoid());
      newPlayer2.location = location;
      await testingTown.addPlayer(newPlayer1);
      await testingTown.addPlayer(newPlayer2);
      const result1 = testingTown.createJoinRequest(newConversationArea2.label, newPlayer1);
      const result2 = testingTown.createJoinRequest(newConversationArea2.label, newPlayer2);
      expect(result1).toBe(true);
      expect(result2).toBe(true);
      expect(testingTown.conversationAreas[1].joinRequests.length).toBe(2);
      expect(testingTown.conversationAreas[1].occupantsByID.length).toBe(1);

      const updateResult = testingTown.updateConversationArea(newConversationArea2.label, player2, {
        maxOccupants: 1,
      });
      expect(updateResult).toBe(true);
      expect(testingTown.conversationAreas[1].joinRequests.length).toBe(0);
      expect(newPlayer1.activeConversationArea).toBe(undefined);
      expect(newPlayer2.activeConversationArea).toBe(undefined);
      expect(testingTown.conversationAreas[1].status).toBe(
        ConversationAreaStatus.AvailableToRequest,
      );
    });

    it('should not allow non admin player to update conversation area status', () => {
      const status = ConversationAreaStatus.AvailableToRequest;
      const result = testingTown.updateConversationArea(conversationLabel, player, { status });
      expect(result).toBe(false);
    });

    it('should not allow non admin player to update conversation area maxOccupants', () => {
      const maxOccupants = 10;
      const result = testingTown.updateConversationArea(conversationLabel, player, {
        maxOccupants,
      });
      expect(result).toBe(false);
    });

    it('should allow admin player to change status to available to request', () => {
      player.permissions = PlayerPermissions.Admin;
      const status = ConversationAreaStatus.AvailableToRequest;
      const result = testingTown.updateConversationArea(conversationLabel, player, { status });
      expect(result).toBe(true);
      expect(testingTown.conversationAreas[0].status).toBe(
        ConversationAreaStatus.AvailableToRequest,
      );
    });

    it('should allow admin player to change status to do not disturb', () => {
      player.permissions = PlayerPermissions.Admin;
      const status = ConversationAreaStatus.DoNotDisturb;
      const result = testingTown.updateConversationArea(conversationLabel, player, { status });
      expect(result).toBe(true);
      expect(testingTown.conversationAreas[0].status).toBe(ConversationAreaStatus.DoNotDisturb);
    });

    it('should allow admin player to change status to public', () => {
      player.permissions = PlayerPermissions.Admin;
      const status = ConversationAreaStatus.Public;
      const result = testingTown.updateConversationArea(conversationLabel, player, { status });
      expect(result).toBe(true);
      expect(testingTown.conversationAreas[0].status).toBe(ConversationAreaStatus.Public);
    });

    it('should not allow player outside conversation area update conversation area', async () => {
      const newPlayer = new Player(nanoid());
      await testingTown.addPlayer(newPlayer);

      const newLocation: UserLocation = {
        moving: false,
        rotation: 'front',
        x: 100,
        y: 100,
        conversationLabel: nanoid(),
      };
      testingTown.updatePlayerLocation(newPlayer, newLocation);

      newPlayer.permissions = PlayerPermissions.Admin;
      const status = ConversationAreaStatus.AvailableToRequest;
      const result = testingTown.updateConversationArea(conversationLabel, newPlayer, { status });
      expect(result).toBe(false);
    });

    it('should allow admin player to limit the maximum occupants', () => {
      player.permissions = PlayerPermissions.Admin;
      expect(testingTown.conversationAreas[0].maxOccupants).toBe(undefined);

      const maxOccupants = 10;
      const result = testingTown.updateConversationArea(conversationLabel, player, {
        maxOccupants,
      });
      expect(result).toBe(true);
      expect(testingTown.conversationAreas[0].maxOccupants).toBe(10);
    });

    it('should allow admin player to remove the limit on maximum occupants', () => {
      player.permissions = PlayerPermissions.Admin;
      conversationArea.maxOccupants = 10;
      expect(testingTown.conversationAreas[0].maxOccupants).toBe(10);

      const maxOccupants = undefined;
      const result = testingTown.updateConversationArea(conversationLabel, player, {
        maxOccupants,
      });
      expect(result).toBe(true);
      expect(testingTown.conversationAreas[0].maxOccupants).toBe(undefined);
    });

    it('should allow admin player to set maximum occupants to the current number of occupants', async () => {
      player.permissions = PlayerPermissions.Admin;
      const newPlayer1 = new Player(nanoid());
      const newPlayer2 = new Player(nanoid());
      await testingTown.addPlayer(newPlayer1);
      await testingTown.addPlayer(newPlayer2);
      const newLocation: UserLocation = {
        moving: false,
        rotation: 'front',
        x: 0,
        y: 0,
        conversationLabel,
      };
      testingTown.updatePlayerLocation(newPlayer1, newLocation);
      testingTown.updatePlayerLocation(newPlayer2, newLocation);

      const maxOccupants = 3;
      const result = testingTown.updateConversationArea(conversationLabel, player, {
        maxOccupants,
      });
      expect(result).toBe(true);
      expect(testingTown.conversationAreas[0].maxOccupants).toBe(3);
    });

    it('should not allow admin player to set maximum occupants to a negative number', () => {
      player.permissions = PlayerPermissions.Admin;
      const maxOccupants = -1;
      const result = testingTown.updateConversationArea(conversationLabel, player, {
        maxOccupants,
      });
      expect(result).toBe(false);
    });

    it('should not allow admin player to set maximum occupants to less than the current number of occupants', async () => {
      player.permissions = PlayerPermissions.Admin;
      const newPlayer1 = new Player(nanoid());
      const newPlayer2 = new Player(nanoid());
      await testingTown.addPlayer(newPlayer1);
      await testingTown.addPlayer(newPlayer2);
      const newLocation: UserLocation = {
        moving: false,
        rotation: 'front',
        x: 0,
        y: 0,
        conversationLabel,
      };
      testingTown.updatePlayerLocation(newPlayer1, newLocation);
      testingTown.updatePlayerLocation(newPlayer2, newLocation);

      const maxOccupants = 2;
      const result = testingTown.updateConversationArea(conversationLabel, player, {
        maxOccupants,
      });
      expect(result).toBe(false);
    });

    it.each([-1, 0, 10.5, NaN, Infinity])(
      'should not allow admin player to set maximum occupants to %s',
      async maxOccupants => {
        player.permissions = PlayerPermissions.Admin;
        const result = testingTown.updateConversationArea(conversationLabel, player, {
          maxOccupants,
        });
        expect(result).toBe(false);
      },
    );
  });

  describe('updatePlayerLocation', () => {
    let testingTown: CoveyTownController;
    let mockPlayer: Player;
    beforeEach(() => {
      const townName = `updatePlayerLocation test town ${nanoid()}`;
      testingTown = new CoveyTownController(townName, false);
      mockPlayer = new Player(nanoid());
    });
    it("should respect the conversation area reported by the player userLocation.conversationLabel, and not override it based on the player's x,y location", async () => {
      const newConversationArea = TestUtils.createConversationForTesting({
        boundingBox: { x: 10, y: 10, height: 5, width: 5 },
      });
      const result = testingTown.addConversationArea(newConversationArea, mockPlayer);
      expect(result).toBe(true);
      const player = new Player(nanoid());
      await testingTown.addPlayer(player);

      const newLocation: UserLocation = {
        moving: false,
        rotation: 'front',
        x: 25,
        y: 25,
        conversationLabel: newConversationArea.label,
      };
      testingTown.updatePlayerLocation(player, newLocation);
      expect(player.activeConversationArea?.label).toEqual(newConversationArea.label);
      expect(player.activeConversationArea?.topic).toEqual(newConversationArea.topic);
      expect(player.activeConversationArea?.boundingBox).toEqual(newConversationArea.boundingBox);

      const areas = testingTown.conversationAreas;
      expect(areas[0].occupantsByID.length).toBe(1);
      expect(areas[0].occupantsByID[0]).toBe(player.id);
    });
    it('should emit an onConversationUpdated event when a conversation area gets a new occupant', async () => {
      const newConversationArea = TestUtils.createConversationForTesting({
        boundingBox: { x: 10, y: 10, height: 5, width: 5 },
      });
      const result = testingTown.addConversationArea(newConversationArea, mockPlayer);
      expect(result).toBe(true);

      const mockListener = mock<CoveyTownListener>();
      testingTown.addTownListener(mockListener);

      const player = new Player(nanoid());
      await testingTown.addPlayer(player);
      const newLocation: UserLocation = {
        moving: false,
        rotation: 'front',
        x: 25,
        y: 25,
        conversationLabel: newConversationArea.label,
      };
      testingTown.updatePlayerLocation(player, newLocation);
      expect(mockListener.onConversationAreaUpdated).toHaveBeenCalledTimes(1);
    });

    it("should change the player's permissions to normal when they leave if they were the admin", async () => {
      const newConversationArea = TestUtils.createConversationForTesting({
        boundingBox: { x: 10, y: 10, height: 5, width: 5 },
        status: ConversationAreaStatus.AvailableToRequest,
      });
      const result = testingTown.addConversationArea(newConversationArea, mockPlayer);
      expect(result).toBe(true);
      expect(mockPlayer.permissions).toBe(PlayerPermissions.Admin);

      const leaveLocation: UserLocation = {
        moving: false,
        rotation: 'front',
        x: 30,
        y: 25,
        conversationLabel: undefined,
      };

      testingTown.updatePlayerLocation(mockPlayer, leaveLocation);
      expect(mockPlayer.permissions).toBe(PlayerPermissions.Admin);
    });
  });

  describe('JoinRequest tests', () => {
    let testingTown: CoveyTownController;
    let player: Player;
    let conversationArea: ServerConversationArea;
    beforeEach(async () => {
      const townName = `join request test town ${nanoid()}`;
      testingTown = new CoveyTownController(townName, false);

      player = new Player(nanoid());
      await testingTown.addPlayer(player);

      conversationArea = TestUtils.createConversationForTesting({
        boundingBox: { x: 0, y: 0, height: 5, width: 5 },
        status: ConversationAreaStatus.AvailableToRequest,
      });
      const result = testingTown.addConversationArea(conversationArea, player);
      expect(result).toBe(true);
    });
    describe('getJoinRequests', () => {
      let joiningPlayer1: Player;
      let joiningPlayer2: Player;
      beforeEach(async () => {
        // Create join requests
        joiningPlayer1 = new Player(nanoid());
        joiningPlayer2 = new Player(nanoid());
        await testingTown.addPlayer(joiningPlayer1);
        await testingTown.addPlayer(joiningPlayer2);
        const result1 = testingTown.createJoinRequest(conversationArea.label, joiningPlayer1);
        const result2 = testingTown.createJoinRequest(conversationArea.label, joiningPlayer2);
        expect(result1).toBe(true);
        expect(result2).toBe(true);
      });

      it('should allow admin to get list of join requests for conversation area it is admin of', () => {
        const joinRequests = testingTown.getJoinRequests(conversationArea.label, player);
        assert(joinRequests);
        expect(joinRequests.length).toBe(2);
        const [
          {
            playerId: playerId1,
            userName: userName1,
            conversationLabel: conversationLabel1,
            conversationTopic: conversationTopic1,
          },
          {
            playerId: playerId2,
            userName: userName2,
            conversationLabel: conversationLabel2,
            conversationTopic: conversationTopic2,
          },
        ] = joinRequests;

        expect(playerId1).toBe(joiningPlayer1.id);
        expect(userName1).toBe(joiningPlayer1.userName);
        expect(conversationLabel1).toBe(conversationArea.label);
        expect(conversationTopic1).toBe(conversationArea.topic);

        expect(playerId2).toBe(joiningPlayer2.id);
        expect(userName2).toBe(joiningPlayer2.userName);
        expect(conversationLabel2).toBe(conversationArea.label);
        expect(conversationTopic2).toBe(conversationArea.topic);
      });

      it('should not allow player to get list of join requests for invalid conversation area', () => {
        const joinRequests = testingTown.getJoinRequests('bad label', player);
        expect(joinRequests).toBe(undefined);
      });

      it('should not allow admin to get list of join requests for conversation area it is not admin of', () => {
        const otherAdmin = new Player(nanoid());
        const otherConversationArea = TestUtils.createConversationForTesting({
          boundingBox: { x: 10, y: 10, width: 10, height: 10 },
        });
        const result = testingTown.addConversationArea(otherConversationArea, otherAdmin);
        expect(result).toBe(true);

        const joinRequests = testingTown.getJoinRequests(conversationArea.label, otherAdmin);
        expect(joinRequests).toBe(undefined);
      });

      it('should not allow non-admin to get list of join requests for conversation area', () => {
        player.permissions = PlayerPermissions.Normal;
        const joinRequests = testingTown.getJoinRequests(conversationArea.label, player);
        expect(joinRequests).toBe(undefined);
      });
    });

    describe('createJoinRequest', () => {
      let joiningPlayer: Player;
      beforeEach(async () => {
        joiningPlayer = new Player(nanoid());
        await testingTown.addPlayer(joiningPlayer);
      });

      it('should allow player within AvailableToRequest conversation area to create a join request', () => {
        const result = testingTown.createJoinRequest(conversationArea.label, joiningPlayer);
        const { id: playerId, activeJoinRequest } = joiningPlayer;
        const { label, joinRequests } = conversationArea;

        expect(result).toBe(true);
        expect(activeJoinRequest?.playerId).toBe(playerId);
        expect(activeJoinRequest?.conversationLabel).toBe(label);
        expect(joinRequests.length).toBe(1);
        expect(joinRequests[0].playerId).toBe(playerId);
        expect(joinRequests[0].conversationLabel).toBe(label);
      });

      it('should not allow player to create a join request for an invalid conversation area', () => {
        const result = testingTown.createJoinRequest('bad label', joiningPlayer);

        expect(result).toBe(false);
        expect(joiningPlayer.activeJoinRequest).toBe(undefined);
        expect(conversationArea.joinRequests.length).toBe(0);
      });

      it('should not allow player to create a join request for a public conversation area', () => {
        conversationArea.status = ConversationAreaStatus.Public;

        const result = testingTown.createJoinRequest(conversationArea.label, joiningPlayer);

        expect(result).toBe(false);
        expect(joiningPlayer.activeJoinRequest).toBe(undefined);
        expect(conversationArea.joinRequests.length).toBe(0);
      });

      it('should not allow player to create a join request for a do not disturb conversation area', () => {
        conversationArea.status = ConversationAreaStatus.DoNotDisturb;

        const result = testingTown.createJoinRequest(conversationArea.label, joiningPlayer);

        expect(result).toBe(false);
        expect(joiningPlayer.activeJoinRequest).toBe(undefined);
        expect(conversationArea.joinRequests.length).toBe(0);
      });

      it('should not allow player to create a join request if player is already part of the conversation area', () => {
        joiningPlayer.activeConversationArea = conversationArea;
        const result = testingTown.createJoinRequest(conversationArea.label, joiningPlayer);

        expect(result).toBe(false);
        expect(joiningPlayer.activeJoinRequest).toBe(undefined);
        expect(conversationArea.joinRequests.length).toBe(0);
      });

      it('should not allow player to create a join request if player has another active join request', () => {
        const result = testingTown.createJoinRequest(conversationArea.label, joiningPlayer);
        expect(result).toBe(true);

        const rejoinResult = testingTown.createJoinRequest(conversationArea.label, joiningPlayer);
        expect(rejoinResult).toBe(false);
      });

      it('should not allow player to create a join request if player is not in conversation area', () => {
        testingTown.updatePlayerLocation(joiningPlayer, {
          x: 10,
          y: 10,
          rotation: 'front',
          moving: false,
        });

        const result = testingTown.createJoinRequest(conversationArea.label, joiningPlayer);

        expect(result).toBe(false);
        expect(joiningPlayer.activeJoinRequest).toBe(undefined);
        expect(conversationArea.joinRequests.length).toBe(0);
      });

      it('players join request will be automatically deny if the conversation area occups number reach the limit', () => {
        conversationArea.maxOccupants = 1;
        const result = testingTown.createJoinRequest(conversationArea.label, joiningPlayer);

        expect(result).toBe(true);
        expect(conversationArea.joinRequests.length).toBe(0);
        expect(joiningPlayer.activeJoinRequest).toBe(undefined);
        expect(conversationArea.occupantsByID.length).toBe(1);
      });
    });

    describe('acceptJoinRequest', () => {
      it("should successfully accept a valid join request and update the player's active conversation area", async () => {
        const joiningPlayer = new Player(nanoid());
        await testingTown.addPlayer(joiningPlayer);
        const result = testingTown.createJoinRequest(conversationArea.label, joiningPlayer);
        expect(result).toBe(true);
        assert(joiningPlayer.activeJoinRequest);
        const joinRequest = joiningPlayer.activeJoinRequest;

        const acceptResult = testingTown.acceptJoinRequest(joinRequest);
        expect(acceptResult).toBe(true);
        expect(joiningPlayer.activeConversationArea).toBe(conversationArea);
        expect(joiningPlayer.activeJoinRequest).toBe(undefined);
        expect(conversationArea.occupantsByID.length).toBe(2); // Admin and JoiningPlayer
        expect(conversationArea.occupantsByID[1]).toBe(joiningPlayer.id);
        expect(conversationArea.joinRequests.length).toBe(0);
      });

      it('should should successfully accept a valid join request and deny all pending request since the conversation area is full', async () => {
        conversationArea.maxOccupants = 2;

        const joiningPlayer1 = new Player(nanoid());
        await testingTown.addPlayer(joiningPlayer1);
        const result1 = testingTown.createJoinRequest(conversationArea.label, joiningPlayer1);
        expect(result1).toBe(true);
        assert(joiningPlayer1.activeJoinRequest);
        const joinRequest1 = joiningPlayer1.activeJoinRequest;

        const joiningPlayer2 = new Player(nanoid());
        await testingTown.addPlayer(joiningPlayer2);
        const result2 = testingTown.createJoinRequest(conversationArea.label, joiningPlayer2);
        expect(result2).toBe(true);

        const joiningPlayer3 = new Player(nanoid());
        await testingTown.addPlayer(joiningPlayer3);
        const result3 = testingTown.createJoinRequest(conversationArea.label, joiningPlayer3);
        expect(result3).toBe(true);

        expect(conversationArea.joinRequests.length).toBe(3);

        const acceptResult1 = testingTown.acceptJoinRequest(joinRequest1);

        expect(acceptResult1).toBe(true);
        expect(conversationArea.occupantsByID.length).toBe(2);
        expect(joiningPlayer2.activeJoinRequest).toBe(undefined);
        expect(joiningPlayer3.activeJoinRequest).toBe(undefined);
        expect(conversationArea.joinRequests.length).toBe(0);
      });

      it('should fail to accept a join request with an invalid conversation label', () => {
        const joinRequest = {
          id: 'id',
          playerId: player.id,
          conversationLabel: 'bad label',
        };
        const result = testingTown.acceptJoinRequest(joinRequest);
        expect(result).toBe(false);
      });

      it('should fail to accept a join request with an invalid player id', () => {
        const joinRequest = {
          id: 'id',
          playerId: 'bad player id',
          conversationLabel: conversationArea.label,
        };
        const result = testingTown.acceptJoinRequest(joinRequest);
        expect(result).toBe(false);
      });
    });

    describe('removeJoinRequest', () => {
      it('should successfully deny a valid join request', async () => {
        const joiningPlayer = new Player(nanoid());
        await testingTown.addPlayer(joiningPlayer);
        const result = testingTown.createJoinRequest(conversationArea.label, joiningPlayer);
        expect(result).toBe(true);
        assert(joiningPlayer.activeJoinRequest);
        const joinRequest = joiningPlayer.activeJoinRequest;

        const denyResult = testingTown.removeJoinRequest(joinRequest);
        expect(denyResult).toBe(true);
        expect(joiningPlayer.activeConversationArea).toBe(undefined);
        expect(joiningPlayer.activeJoinRequest).toBe(undefined);
        expect(conversationArea.occupantsByID.length).toBe(1);
        expect(conversationArea.joinRequests.length).toBe(0);
      });

      it('should fail to deny a join request with an invalid conversation label', () => {
        const joinRequest = {
          id: 'id',
          playerId: player.id,
          conversationLabel: 'bad label',
        };
        const result = testingTown.removeJoinRequest(joinRequest);
        expect(result).toBe(false);
      });

      it('should fail to deny a join request with an invalid player id', () => {
        const joinRequest = {
          id: 'id',
          playerId: 'bad player id',
          conversationLabel: conversationArea.label,
        };
        const result = testingTown.removeJoinRequest(joinRequest);
        expect(result).toBe(false);
      });
    });
  });

  describe('updateJoinRequest', () => {
    let testingTown: CoveyTownController;
    let admin: Player;
    let player: Player;
    let conversationArea: ServerConversationArea;
    let joinRequest: JoinRequest;

    beforeEach(async () => {
      const townName = `admin response test town ${nanoid()}`;
      testingTown = new CoveyTownController(townName, false);

      admin = new Player(nanoid());
      await testingTown.addPlayer(admin);

      conversationArea = TestUtils.createConversationForTesting({
        boundingBox: { x: 0, y: 0, height: 5, width: 5 },
        status: ConversationAreaStatus.AvailableToRequest,
      });
      const result = testingTown.addConversationArea(conversationArea, admin);
      expect(result).toBe(true);
      expect(testingTown.players[0].permissions).toBe(PlayerPermissions.Admin);
      expect(testingTown.players[0].activeConversationArea).toEqual(conversationArea);

      player = new Player(nanoid());
      await testingTown.addPlayer(player);
      expect(testingTown.conversationAreas[0].occupantsByID.length).toBe(1);

      testingTown.createJoinRequest(conversationArea.label, player);
      assert(player.activeJoinRequest);
      joinRequest = player.activeJoinRequest;
      expect(joinRequest.playerId).toBe(player.id);
    });

    it('should add the player to the conversation area if admin accepts', () => {
      const decision = true;
      const result = testingTown.updateJoinRequest(admin, decision, joinRequest);

      expect(result).toBe(true);
      expect(conversationArea.joinRequests.length).toBe(0);
      expect(testingTown.conversationAreas[0].occupantsByID.length).toBe(2);
      expect(conversationArea.occupantsByID).toContain(player.id);
      expect(player.activeConversationArea).toEqual(conversationArea);
    });

    it('should deny the player to join if admin rejects', () => {
      const decision = false;
      const result = testingTown.updateJoinRequest(admin, decision, joinRequest);

      expect(result).toBe(true);
      expect(conversationArea.joinRequests.length).toBe(0);
      expect(testingTown.conversationAreas[0].occupantsByID.length).toBe(1);
      expect(conversationArea.occupantsByID).not.toContain(player.id);
      expect(player.activeConversationArea).toBeUndefined();
    });

    it('should not allow admin of another conversation area to accept or reject', async () => {
      const otherAdmin = new Player(nanoid());
      otherAdmin.permissions = PlayerPermissions.Admin;
      await testingTown.addPlayer(otherAdmin);

      expect(testingTown.conversationAreas[0].occupantsByID.length).toBe(1);
      const decision = true;
      const result = testingTown.updateJoinRequest(otherAdmin, decision, joinRequest);

      expect(result).toBe(false);
      expect(conversationArea.joinRequests.length).toBe(1);
      expect(testingTown.conversationAreas[0].occupantsByID.length).toBe(1);
      expect(conversationArea.occupantsByID).not.toContain(player.id);
      expect(player.activeConversationArea).toBeUndefined();
    });

    it('should allow player to remove their own request', () => {
      const decision = false;
      const result = testingTown.updateJoinRequest(player, decision, joinRequest);
      expect(result).toBe(true);
      expect(conversationArea.joinRequests.length).toBe(0);
      expect(conversationArea.occupantsByID.length).toBe(1);
      expect(conversationArea.occupantsByID).not.toContain(player.id);
      expect(player.activeConversationArea).toBeUndefined();
    });

    it('should not allow player to accept their own request', () => {
      const decision = true;
      const result = testingTown.updateJoinRequest(player, decision, joinRequest);
      expect(result).toBe(false);
      expect(conversationArea.joinRequests.length).toBe(1);
      expect(conversationArea.occupantsByID.length).toBe(1);
      expect(conversationArea.occupantsByID).not.toContain(player.id);
      expect(player.activeConversationArea).toBeUndefined();
    });

    it('should not allow other non-admins to accept a request that is not theirs', () => {
      const decision = false;
      const otherPlayer = new Player(nanoid());
      const result = testingTown.updateJoinRequest(otherPlayer, decision, joinRequest);

      expect(result).toBe(false);
      expect(conversationArea.joinRequests.length).toBe(1);
      expect(testingTown.conversationAreas[0].occupantsByID.length).toBe(1);
      expect(conversationArea.occupantsByID).not.toContain(player.id);
      expect(player.activeConversationArea).toBeUndefined();
    });
  });
});
