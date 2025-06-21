import { render, screen } from '@testing-library/react'
import { useContext } from 'react'
import GraphContext from '../libs/context/graphcontrol'

function Consumer() {
  const value = useContext(GraphContext)
  return (
    <>
      <span data-testid="upper">{value.upperBound}</span>
      <span data-testid="lower">{value.lowerBound}</span>
      <span data-testid="func">{typeof value.updateBounds}</span>
    </>
  )
}

test('GraphContext provides default values', () => {
  render(<Consumer />)
  expect(screen.getByTestId('upper').textContent).toBe('2.2')
  expect(screen.getByTestId('lower').textContent).toBe('0.96')
  expect(screen.getByTestId('func').textContent).toBe('function')
})
