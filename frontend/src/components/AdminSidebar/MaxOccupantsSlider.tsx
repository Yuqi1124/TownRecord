import {
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  Tooltip,
  useToast,
} from '@chakra-ui/react';
import React from 'react';
import useCoveyAppState from '../../hooks/useCoveyAppState';
import ConversationArea from '../../classes/ConversationArea';

type Props = {
  currentConversationArea?: ConversationArea
};

export default function MaxOccupantsSlider({currentConversationArea}: Props): JSX.Element {
  /* Slider state so we can print it */
  const [sliderValue, setSliderValue] = React.useState(5)
  const {apiClient, sessionToken, currentTownID} = useCoveyAppState();

  const toast = useToast()

  const sliderChanged = (val: number) => {
    setSliderValue(val);
    const updateSlider = async () => {
      if (currentConversationArea) {
        currentConversationArea.maxOccupants = sliderValue;
        try {
          await apiClient.updateConversation({
            sessionToken,
            coveyTownID: currentTownID,
            conversationArea: currentConversationArea.toServerConversationArea(),
          });
        } catch (err) {
            toast({
              title: 'Unable to create conversation',
              description: err.toString(),
              status: 'error',
            });
        }
      }
    }
    updateSlider();
  }

  /* TODO: disable the slider if the room is not limited? */
  const enabled = true;

  return (
    <Slider
      aria-label='slider-ex-6'
      onChange={sliderChanged}
      defaultValue={5}
      isDisabled={!enabled}
    >
      <SliderTrack>
        <SliderFilledTrack />
      </SliderTrack>

      <Tooltip
        hasArrow
        bg='teal.500'
        color='white'
        placement='top'
        isOpen
        label={`${sliderValue}%`}
      >
        <SliderThumb />
      </Tooltip>
    </Slider>
  );
}

const defaultProps = {
  currentConversationArea: undefined,
};

MaxOccupantsSlider.defaultProps = defaultProps;
