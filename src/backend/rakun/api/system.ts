import { addHandler } from 'backend/ipc'
import { rakunVersion } from 'backend/constants/others'

addHandler('getRakunVersion', () => rakunVersion)
