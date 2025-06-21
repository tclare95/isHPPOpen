import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import EventsForm from '../components/functional/eventsform';
import axios from 'axios';

jest.mock('axios');

describe('EventsForm component', () => {
  it('shows validation errors for invalid fields', async () => {
    render(
      <EventsForm
        id={1}
        name=""
        startDate={new Date('2025-06-21')}
        endDate={new Date('2025-06-20')}
        eventDetails=""
        isNew={true}
        mutate={jest.fn()}
      />
    );

    await act(async () => {
      fireEvent.blur(screen.getByLabelText(/Event Name/));
      fireEvent.blur(screen.getByLabelText(/Event End Date/));
      fireEvent.blur(screen.getByLabelText(/Event Details/));
    });

    expect(await screen.findByText(/Event name is required/)).toBeInTheDocument();
    expect(await screen.findByText(/before start date/)).toBeInTheDocument();
    expect(await screen.findByText(/Event details are required/)).toBeInTheDocument();
  });

  it('submits valid data', async () => {
    axios.post.mockResolvedValue({ status: 200 });
    render(
      <EventsForm
        id={1}
        name="Test Event"
        startDate={new Date('2025-06-21')}
        endDate={new Date('2025-06-22')}
        eventDetails="Details"
        isNew={true}
        mutate={jest.fn()}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save Edit|Add Event/i }));
    });
    await waitFor(() => expect(axios.post).toHaveBeenCalled());
  });
});
