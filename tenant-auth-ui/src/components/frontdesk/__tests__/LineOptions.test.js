import React, { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import LineOptions, { OrderInstructions } from '../LineOptions'
import KitchenNoteEditor from '../KitchenNoteEditor'
import KitchenNotePresets from '../KitchenNotePresets'

const LINE = {
  name: 'Veg Triple Fried Rice', price: 479, basePrice: 239, variantAmount: 170, addonAmount: 70,
  variants: [{ id: 'v1', name: 'Half portion', price: 170 }],
  addons: [
    { id: 'a1', name: 'Raita', price: 20, groupName: 'Extra dip' },
    { id: 'a2', name: 'Paneer', price: 50, groupName: 'Extra' },
  ],
  note: 'Less spicy, No onion',
}

describe('LineOptions — one reading of a line everywhere', () => {
  test('an option, each add-on with its group, and the kitchen note', () => {
    render(<LineOptions line={LINE} />)
    expect(screen.getByText('Half portion +₹170.00')).toBeInTheDocument()
    expect(screen.getByText('Raita +₹20.00')).toBeInTheDocument()
    expect(screen.getByText('Extra dip ·')).toBeInTheDocument()
    expect(screen.getByText('Paneer +₹50.00')).toBeInTheDocument()
    expect(screen.getByTitle('Kitchen note')).toHaveTextContent('Kitchen note: Less spicy, No onion')
  })

  test('the breakdown, only when asked for', () => {
    const { rerender } = render(<LineOptions line={LINE} />)
    expect(screen.queryByText(/options ₹170\.00/)).toBeNull()
    rerender(<LineOptions line={LINE} showBreakdown />)
    expect(screen.getByText('₹239.00 + options ₹170.00 + extras ₹70.00')).toBeInTheDocument()
  })

  test('names only, for a screen where the price is not the point', () => {
    render(<LineOptions line={LINE} showPrices={false} showNote={false} />)
    expect(screen.getByText('Half portion')).toBeInTheDocument()
    expect(screen.queryByTitle('Kitchen note')).toBeNull()
  })

  test('nothing at all for a plain dish', () => {
    const { container } = render(<LineOptions line={{ name: 'Mashroom Chilli', price: 149 }} />)
    expect(container).toBeEmptyDOMElement()
  })

  test('the whole-order panel, with the cutlery flag the column stores as 1', () => {
    render(<OrderInstructions instructions="Pack sauces separately" noCutlery={1} />)
    expect(screen.getByText('Pack sauces separately')).toBeInTheDocument()
    expect(screen.getByText('NO CUTLERY')).toBeInTheDocument()
  })

  test('no panel when there is nothing to say', () => {
    const { container } = render(<OrderInstructions instructions="  " noCutlery={0} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('KitchenNoteEditor', () => {
  const Harness = ({ presets = ['Less spicy', 'Extra spicy', 'No onion'], start = '' }) => {
    const [note, setNote] = useState(start)
    return (
      <>
        <KitchenNoteEditor value={start} presets={presets} onChange={setNote} />
        <output data-testid="note">{note}</output>
      </>
    )
  }

  test('quick picks and typed text compose one note, in the branch\'s order', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'No onion' }))
    fireEvent.click(screen.getByRole('button', { name: 'Less spicy' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'gravy on the side' } })
    expect(screen.getByTestId('note')).toHaveTextContent('Less spicy, No onion, gravy on the side')
    expect(screen.getByRole('button', { name: /Less spicy/ })).toHaveAttribute('aria-pressed', 'true')
  })

  test('picking an opposite drops the other', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Less spicy' }))
    fireEvent.click(screen.getByRole('button', { name: 'Extra spicy' }))
    expect(screen.getByTestId('note')).toHaveTextContent(/^Extra spicy$/)
    expect(screen.getByRole('button', { name: 'Less spicy' })).toHaveAttribute('aria-pressed', 'false')
  })

  test('opens an existing note with its picks already on', () => {
    render(<Harness start="No onion, extra lemon" />)
    expect(screen.getByRole('button', { name: /No onion/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('textbox')).toHaveValue('extra lemon')
  })

  test('never grows past what the ticket holds', () => {
    render(<Harness />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'x'.repeat(200) } })
    expect(screen.getByTestId('note').textContent.length).toBe(140)
    expect(screen.getByText('140/140')).toBeInTheDocument()
  })
})

describe('KitchenNotePresets', () => {
  const setup = (value = ['Less spicy', 'Extra spicy', 'No onion']) => {
    const onSave = jest.fn()
    render(<KitchenNotePresets value={value} onSave={onSave} />)
    return onSave
  }

  test('adds a note, tidied', () => {
    const onSave = setup()
    fireEvent.change(screen.getByLabelText('New quick note'), { target: { value: '  Well   done ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(onSave).toHaveBeenCalledWith(['Less spicy', 'Extra spicy', 'No onion', 'Well done'])
  })

  test('refuses a duplicate, ignoring case, and says why', () => {
    const onSave = setup()
    fireEvent.change(screen.getByLabelText('New quick note'), { target: { value: 'no ONION' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('already on the list')
  })

  test('reorders and removes without drag', () => {
    const onSave = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Move No onion up' }))
    expect(onSave).toHaveBeenLastCalledWith(['Less spicy', 'No onion', 'Extra spicy'])
    fireEvent.click(screen.getByRole('button', { name: 'Remove Less spicy' }))
    expect(onSave).toHaveBeenLastCalledWith(['Extra spicy', 'No onion'])
    expect(screen.getByRole('button', { name: 'Move Less spicy up' })).toBeDisabled()
  })

  test('names the pairs that cancel each other', () => {
    setup()
    expect(screen.getByText(/Can.t be picked together with Extra spicy/)).toBeInTheDocument()
  })
})
