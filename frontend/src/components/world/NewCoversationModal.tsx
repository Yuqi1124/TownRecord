import {
Button,
FormControl,
FormLabel,
Input,
Modal,
ModalBody,
ModalCloseButton,
ModalContent,
ModalFooter,
ModalHeader,
ModalOverlay,

Select,

useToast
} from '@chakra-ui/react';
import React,{ ChangeEvent, useCallback,useState } from 'react';
import ConversationArea, { ConversationAreaStatus } from '../../classes/ConversationArea';
import useCoveyAppState from '../../hooks/useCoveyAppState';
import useMaybeVideo from '../../hooks/useMaybeVideo';


type NewConversationModalProps = {
    isOpen: boolean;
    closeModal: ()=>void;
    newConversation: ConversationArea;
}
export default function NewConversationModal( {isOpen, closeModal, newConversation} : NewConversationModalProps): JSX.Element {
    const [topic, setTopic] = useState<string>('');
    const [status, setStatus] = useState<number>(ConversationAreaStatus.Public);
    const {apiClient, sessionToken, currentTownID} = useCoveyAppState();

    const toast = useToast()
    const video = useMaybeVideo()

    // let areaStatus = ConversationAreaStatus.Public;

    const createConversation = useCallback(async () => {
      if (topic) {
          const conversationToCreate = newConversation;
          conversationToCreate.topic = topic;
          conversationToCreate.status = status;
        try {
          await apiClient.createConversation({
            sessionToken,
            coveyTownID: currentTownID,
            conversationArea: conversationToCreate.toServerConversationArea(),
          });
          toast({
            title: 'Conversation Created!',
            status: 'success',
          });
          video?.unPauseGame();
          closeModal();
        } catch (err) {
          toast({
            title: 'Unable to create conversation',
            description: err.toString(),
            status: 'error',
          });
        }
      }
    }, [topic, status, apiClient, newConversation, closeModal, currentTownID, sessionToken, toast, video]);

    const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
      if (event.target.value === 'private') {
        setStatus(ConversationAreaStatus.AvailableToRequest);
      }
    }

    return (
      <Modal isOpen={isOpen} onClose={()=>{closeModal(); video?.unPauseGame()}}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            <div>Create a conversation in {newConversation.label} </div>
            <div>Do you want it to be public or private? </div>
            </ModalHeader>
          <ModalCloseButton />
          <form
            onSubmit={ev => {
              ev.preventDefault();
              createConversation();
            }}>
            <ModalBody pb={6}>
              <FormControl>
                <FormLabel htmlFor='topic'>Topic of Conversation</FormLabel>
                <Input
                  id='topic'
                  placeholder='Share the topic of your conversation'
                  name='topic'
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                />
              </FormControl>
              <FormControl>
              <FormLabel htmlFor='choice'>Public or Private</FormLabel>
              <Select onChange={(e) => handleChange(e)}>
                <option value='public'>Public</option>
                <option value='private'>Private</option>
              </Select>
              </FormControl>
            </ModalBody>
            <ModalFooter>
              <Button colorScheme='blue' mr={3} onClick={createConversation}>
                Create
              </Button>
              <Button onClick={closeModal}>Cancel</Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>
    );
}

