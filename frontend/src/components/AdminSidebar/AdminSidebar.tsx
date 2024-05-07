import { Heading, StackDivider, VStack } from '@chakra-ui/react';
import React from 'react';
import StatusDropdown from './StatusDropdown';
import MaxOccupantsSlider from './MaxOccupantsSlider';
import ConversationArea from '../../classes/ConversationArea';
import JoinRequestList from './JoinRequestList';

type Props = {
  currentConversationArea?: ConversationArea,
};

export default function AdminSidebar({ currentConversationArea }: Props): JSX.Element {
  return (
    <VStack align="left"
      spacing={2}
      border='2px'
      padding={2}
      marginLeft={2}
      borderColor='gray.500'
      height='100%'
      divider={<StackDivider borderColor='gray.200' />}
      borderRadius='4px'>
      <Heading fontSize='xl' as='h1'>Admin</Heading>
      <StatusDropdown currentConversationArea={currentConversationArea}/>
      <MaxOccupantsSlider currentConversationArea={currentConversationArea} />
      <JoinRequestList currentConversationArea={currentConversationArea} />
    </VStack>
  );
}

const defaultProps = {
  currentConversationArea: undefined,
};

AdminSidebar.defaultProps = defaultProps;
