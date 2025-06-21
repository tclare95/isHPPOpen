import { render, screen } from '@testing-library/react'
import Event from '../components/functional/event'

describe('Event component', () => {
  it('renders event details', () => {
    render(
      <Event name="Test Event" startDate="2024-01-01" endDate="2024-01-02" eventDetails="Details" />
    )
    expect(screen.getByText('Test Event')).toBeInTheDocument()
    expect(screen.getByText(/Start Date:/)).toBeInTheDocument()
    expect(screen.getByText(/End Date:/)).toBeInTheDocument()
    expect(screen.getByText('Details')).toBeInTheDocument()
  })
})
