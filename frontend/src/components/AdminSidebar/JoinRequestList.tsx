import { Divider, Heading, IconButton, List, ListItem, useToast } from '@chakra-ui/react';
import { Check, Close } from '@material-ui/icons';
import React, { useCallback, useEffect, useState } from 'react';
import ConversationArea, { ConversationAreaListener, JoinRequest } from '../../classes/ConversationArea';
import { JoinRequestInfo } from '../../classes/TownsServiceClient';
import useCoveyAppState from '../../hooks/useCoveyAppState';

type Props = {
  currentConversationArea?: ConversationArea;
};

const JoinRequestList = ({ currentConversationArea }: Props): JSX.Element => {
  const [fullJoinRequests, setFullJoinRequests] = useState<JoinRequestInfo[] | undefined>();
  const { apiClient, sessionToken, currentTownID } = useCoveyAppState();
  const toast = useToast();

  const updateJoinRequestList = useCallback(async () => {
    try {
      const response = await apiClient.listJoinRequests({
        sessionToken,
        coveyTownID: currentTownID,
        conversationAreaLabel: currentConversationArea?.label ?? '',
      });
      setFullJoinRequests(response.joinRequests);
    } catch (err) {
      toast({
        title: 'Unable to fetch join requests',
        description: err.toString(),
        status: 'error',
      });
    }
  }, [apiClient, sessionToken, currentConversationArea?.label, currentTownID, toast]);

  useEffect(() => {
    const joinRequestListener: ConversationAreaListener = {
      onJoinRequestChange: () => updateJoinRequestList()
    }
    currentConversationArea?.addListener(joinRequestListener);
  }, [currentConversationArea, currentConversationArea?.joinRequests, updateJoinRequestList])


  const updateJoinRequest = async (joinRequest: JoinRequest, adminDecision: boolean) => {
    const { id, playerId, conversationLabel: jrConversationLabel } = joinRequest;
    try {
      await apiClient.updateJoinRequest({
        sessionToken,
        coveyTownID: currentTownID,
        adminDecision,
        conversationAreaLabel: jrConversationLabel,
        joinRequest: {
          id,
          playerId,
          conversationLabel: jrConversationLabel,
        },
      });
    } catch (err) {
      toast({
        title: 'Unable to fetch join requests',
        description: err.toString(),
        status: 'error',
      });
    }
  };

  return (
    <>
      <Heading as='h1' fontSize='xl'>
        Active Join Requests
      </Heading>
      {fullJoinRequests && fullJoinRequests.length > 0 ? (
        <List>
          {fullJoinRequests.map(joinRequest => (
            <ListItem key={joinRequest.id} marginY='1.5'>
              <IconButton
                aria-label='Accept join request'
                colorScheme='green'
                size='sm'
                marginRight='1'
                onClick={() => updateJoinRequest(joinRequest, true)}>
                <Check />
              </IconButton>
              <IconButton
                aria-label='Deny join request'
                colorScheme='red'
                size='sm'
                marginX='1'
                onClick={() => updateJoinRequest(joinRequest, false)}>
                <Close />
              </IconButton>
              {joinRequest.userName}
            </ListItem>
          ))}
          <Divider />
        </List>
      ) : (
        <span>There are no join requests right now.</span>
      )}
    </>
  );
};

JoinRequestList.defaultProps = {
  currentConversationArea: undefined,
};

export default JoinRequestList;
