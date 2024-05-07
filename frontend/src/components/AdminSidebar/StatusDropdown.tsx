import { Select, useToast } from '@chakra-ui/react';
import React, { ChangeEvent } from 'react';
import ConversationArea, { ConversationAreaStatus } from '../../classes/ConversationArea';
import useCoveyAppState from '../../hooks/useCoveyAppState';

type Props = {
  currentConversationArea?: ConversationArea;
};

export default function StatusDropdown({ currentConversationArea }: Props): JSX.Element {
  const { apiClient, sessionToken, currentTownID } = useCoveyAppState();

  let initialValue = '';
  if (currentConversationArea) {
    if (currentConversationArea?.status === ConversationAreaStatus.AvailableToRequest) {
      initialValue = 'Available to Request';
    } else if (currentConversationArea?.status === ConversationAreaStatus.DoNotDisturb) {
      initialValue = 'Do Not Disturb';
    } else {
      initialValue = 'Public';
    }
  }
  const toast = useToast();

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    initialValue = event.target.value;

    if (currentConversationArea !== undefined && initialValue !== undefined) {
      switch (initialValue) {
        case 'Public': {
          currentConversationArea.status = ConversationAreaStatus.Public;
          break;
        }
        case 'Available to Request': {
          currentConversationArea.status = ConversationAreaStatus.AvailableToRequest;
          break;
        }
        case 'Do Not Disturb': {
          currentConversationArea.status = ConversationAreaStatus.DoNotDisturb;
          break;
        }
        default: {
          break;
        }
      }

      const updateCA = async () => {
        try {
          await apiClient.updateConversation({
            sessionToken,
            coveyTownID: currentTownID,
            conversationArea: currentConversationArea.toServerConversationArea(),
          });
        } catch (err) {
          toast({
            title: 'Unable to updated conversation',
            description: err.toString(),
            status: 'error',
          });
        }
      };

      updateCA();
    }
  };

  return (
    <>
      <p>Change Status</p>
      <Select
        id='area-status-dropdown'
        onChange={e => handleChange(e)}
        defaultValue='Available to Request'>
        <option value='Public'>Back to Public</option>
        <option value='Available to Request'>Available to Request</option>
        <option value='Do Not Disturb'>Do Not Disturb</option>
      </Select>
    </>
  );
}

const defaultProps = {
  currentConversationArea: undefined,
};

StatusDropdown.defaultProps = defaultProps;
