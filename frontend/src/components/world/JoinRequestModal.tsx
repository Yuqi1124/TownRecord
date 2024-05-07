import {
    Button,
    FormControl,
    FormLabel,
    Modal,
    ModalBody,
    ModalCloseButton,
    ModalContent,
    ModalFooter,
    ModalHeader,
    ModalOverlay,
    useToast
    } from '@chakra-ui/react';
import React,{ useCallback } from 'react';
import { ConversationAreaStatus, ServerConversationArea } from '../../classes/ConversationArea';
import useCoveyAppState from '../../hooks/useCoveyAppState';
import useMaybeVideo from '../../hooks/useMaybeVideo';


type NewJoinRequestProps = {
    isOpen: boolean;
    closeModal: ()=>void;
    conversationArea: ServerConversationArea;
}

export default function NewJoinRequestModal( {isOpen, closeModal, conversationArea}: NewJoinRequestProps): JSX.Element {
    const {apiClient, sessionToken, currentTownID} = useCoveyAppState();
    const toast = useToast();
    const video = useMaybeVideo();
    
    const createRequest = useCallback(async () => {
        if (conversationArea && conversationArea.status === ConversationAreaStatus.AvailableToRequest) {
            try {
                await apiClient.createJoinRequest({
                    sessionToken,
                    coveyTownID: currentTownID,
                    conversationAreaLabel: conversationArea.label,
                });
                toast({
                    title: 'Join Request Created!',
                    status: 'success',
                });
                video?.unPauseGame();
                closeModal();
            } catch (err) {
                toast({
                    title: 'Unable to request to join',
                    description: err.toString(),
                    status: 'error',
                })
            }
        }
  
    }, [apiClient, conversationArea, closeModal, currentTownID, sessionToken, toast, video]);


    return (
        <Modal isOpen={isOpen} onClose={()=>{closeModal(); video?.unPauseGame()}}>
            <ModalOverlay />
            <ModalContent>
                <ModalHeader>
                    <div>Conversation: {conversationArea.topic}</div>
                </ModalHeader>
                <ModalCloseButton />
                <form 
                onSubmit={ev => {
                    ev.preventDefault();
                    createRequest();
                }}>
            <ModalBody pb={6}>
                <FormControl>
                    <FormLabel htmlFor='request'>Request to Join</FormLabel>
                <Button colorScheme='blue' mr={3} onClick={createRequest}>
                    Join Conversation Area
                </Button>
                </FormControl>
            </ModalBody>
            <ModalFooter>
            <Button onClick={closeModal}>Cancel</Button>
            </ModalFooter>
            </form>
            </ModalContent>

        </Modal>
    )
}
