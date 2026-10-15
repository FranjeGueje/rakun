import { cleanup, fireEvent, render } from '@testing-library/react'
import { Cover, fitsBox } from '../console/Cover'

afterEach(cleanup)

describe('fitsBox', () => {
  test('a picture of the shape of the box fills it', () => {
    expect(fitsBox(1200, 1600)).toBe(true)
    expect(fitsBox(600, 900)).toBe(true)
  })

  test('a wide picture would be cut too much: it is shown whole', () => {
    expect(fitsBox(315, 250)).toBe(false)
    expect(fitsBox(1920, 1080)).toBe(false)
  })

  test('a picture with no size yet is not judged', () => {
    expect(fitsBox(0, 0)).toBe(true)
  })
})

describe('Cover', () => {
  const loaded = (width: number, height: number) => {
    const { container } = render(
      <Cover sources={['https://art/x.png']} title="X" eager />
    )
    const img = container.querySelector('img') as HTMLImageElement
    Object.defineProperty(img, 'naturalWidth', { value: width })
    Object.defineProperty(img, 'naturalHeight', { value: height })
    fireEvent.load(img)
    return container.querySelector('.coverBox') as HTMLElement
  }

  test('fills the box with a picture of its shape', () => {
    expect(loaded(1200, 1600).classList.contains('whole')).toBe(false)
  })

  test('shows a wide picture whole, over a copy of itself', () => {
    const box = loaded(315, 250)
    expect(box.classList.contains('whole')).toBe(true)
    expect(box.style.getPropertyValue('--art')).toBe('url("https://art/x.png")')
  })
})
