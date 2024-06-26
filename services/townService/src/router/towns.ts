import express, { Express } from 'express';
import { Server } from 'http';
import { StatusCodes } from 'http-status-codes';
import io from 'socket.io';
import {
  joinRequestUpdateHandler,
  conversationAreaCreateHandler,
  conversationAreaUpdateHandler,
  joinRequestCreateHandler,
  joinRequestListHandler,
  townCreateHandler,
  townDeleteHandler,
  townJoinHandler,
  townListHandler,
  townSubscriptionHandler,
  townUpdateHandler,
} from '../requestHandlers/CoveyTownRequestHandlers';
import { logError } from '../Utils';

export default function addTownRoutes(http: Server, app: Express): io.Server {
  /*
   * Create a new session (aka join a town)
   */
  app.post('/sessions', express.json(), async (req, res) => {
    try {
      const result = await townJoinHandler({
        userName: req.body.userName,
        coveyTownID: req.body.coveyTownID,
      });
      res.status(StatusCodes.OK).json(result);
    } catch (err) {
      logError(err);
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        message: 'Internal server error, please see log in server for more details',
      });
    }
  });

  /**
   * Delete a town
   */
  app.delete('/towns/:townID/:townPassword', express.json(), async (req, res) => {
    try {
      const result = townDeleteHandler({
        coveyTownID: req.params.townID,
        coveyTownPassword: req.params.townPassword,
      });
      res.status(200).json(result);
    } catch (err) {
      logError(err);
      res.status(500).json({
        message: 'Internal server error, please see log in server for details',
      });
    }
  });

  /**
   * List all towns
   */
  app.get('/towns', express.json(), async (_req, res) => {
    try {
      const result = townListHandler();
      res.status(StatusCodes.OK).json(result);
    } catch (err) {
      logError(err);
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        message: 'Internal server error, please see log in server for more details',
      });
    }
  });

  /**
   * Create a town
   */
  app.post('/towns', express.json(), async (req, res) => {
    try {
      const result = townCreateHandler(req.body);
      res.status(StatusCodes.OK).json(result);
    } catch (err) {
      logError(err);
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        message: 'Internal server error, please see log in server for more details',
      });
    }
  });
  /**
   * Update a town
   */
  app.patch('/towns/:townID', express.json(), async (req, res) => {
    try {
      const result = townUpdateHandler({
        coveyTownID: req.params.townID,
        isPubliclyListed: req.body.isPubliclyListed,
        friendlyName: req.body.friendlyName,
        coveyTownPassword: req.body.coveyTownPassword,
      });
      res.status(StatusCodes.OK).json(result);
    } catch (err) {
      logError(err);
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        message: 'Internal server error, please see log in server for more details',
      });
    }
  });

  /**
   * Create conversation area
   */
  app.post('/towns/:townID/conversationAreas', express.json(), async (req, res) => {
    try {
      const result = await conversationAreaCreateHandler({
        coveyTownID: req.params.townID,
        sessionToken: req.body.sessionToken,
        conversationArea: req.body.conversationArea,
      });
      res.status(StatusCodes.OK).json(result);
    } catch (err) {
      logError(err);
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        message: 'Internal server error, please see log in server for more details',
      });
    }
  });

  /**
   * Update Conversation Area
   */
  app.patch(
    '/towns/:townID/conversationAreas/:conversationLabel',
    express.json(),
    async (req, res) => {
      try {
        const result = conversationAreaUpdateHandler({
          coveyTownID: req.params.townID,
          sessionToken: req.body.sessionToken,
          conversationLabel: req.params.conversationLabel,
          status: req.body.conversationArea.status,
          maxOccupants: req.body.conversationArea.maxOccupants,
        });
        res.status(StatusCodes.OK).json(result);
      } catch (err) {
        logError(err);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
          message: 'Internal server error, please see log in server for more details',
        });
      }
    },
  );

  /**
   * List all requests for a conversation area
   */
  app.get(
    '/towns/:townID/conversationAreas/:conversationLabel/session/:sessionToken/joinRequests',
    express.json(),
    async (req, res) => {
      try {
        const result = joinRequestListHandler({
          coveyTownID: req.params.townID,
          sessionToken: req.params.sessionToken,
          conversationAreaLabel: req.params.conversationLabel,
        });
        res.status(StatusCodes.OK).json(result);
      } catch (err) {
        logError(err);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
          message: 'Internal server error, please see log in server for more details',
        });
      }
    },
  );

  /**
   * Create a new request for a conversation area
   */
  app.post(
    '/towns/:townID/conversationAreas/:conversationAreaLabel/joinRequests',
    express.json(),
    async (req, res) => {
      try {
        const result = joinRequestCreateHandler({
          coveyTownID: req.params.townID,
          sessionToken: req.body.sessionToken,
          conversationAreaLabel: req.params.conversationAreaLabel,
        });
        res.status(StatusCodes.OK).json(result);
      } catch (err) {
        logError(err);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
          message: 'Internal server error, please see log in server for more details',
        });
      }
    },
  );

  /**
   * Accept or deny a player joining private conversation area
   */
  app.patch('/towns/:townID/conversationAreas/:conversationAreaLabel/joinRequests', express.json(), async (req, res) => {
    try {
      const result = joinRequestUpdateHandler({
        coveyTownID: req.params.townID,
        sessionToken: req.body.sessionToken, // this the token for the admin
        adminDecision: req.body.adminDecision, // admin click accept or deny
        conversationAreaLabel: req.params.conversationAreaLabel,
        joinRequest: req.body.joinRequest,
      });
      res.status(StatusCodes.OK).json(result);
    } catch (err) {
      logError(err);
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        message: 'Internal server error, please see log in server for more details',
      });
    }
  });

  const socketServer = new io.Server(http, { cors: { origin: '*' } });
  socketServer.on('connection', townSubscriptionHandler);
  return socketServer;
}
