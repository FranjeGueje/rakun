import { parseLspciGpus } from '../linux'

const VGA = [
  'Slot:\t04:00.0',
  'Class:\t0300',
  'Vendor:\t1002',
  'Device:\t163f',
  'SVendor:\t1002',
  'SDevice:\t0123',
  'Rev:\tae',
  'Driver:\tamdgpu',
  'Module:\tamdgpu'
].join('\n')

const AUDIO = ['Slot:\t04:00.1', 'Class:\t0403', 'Vendor:\t1002'].join('\n')

describe('parseLspciGpus', () => {
  test('returns only display controllers, with ids and driver', () => {
    expect(parseLspciGpus(`${AUDIO}\n\n${VGA}\n`)).toEqual([
      {
        deviceId: '163f',
        vendorId: '1002',
        subvendorId: '1002',
        subdeviceId: '0123',
        driverVersion: 'amdgpu'
      }
    ])
  })

  test('returns nothing when there is no display controller', () => {
    expect(parseLspciGpus(AUDIO)).toEqual([])
  })
})
