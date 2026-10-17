/**
 * Names shared by the runner (`.bat`, which runs inside the prefix) and the
 * backend (which prepares the prefix from outside): they must be the same.
 */

/** Where Zoom's installer waits inside the prefix: `C:\zoom_installer` */
export const ZOOM_INSTALLER_DIR = 'zoom_installer'
/** What Inno Setup reads from `/LOADINF`, next to the installer */
export const ZOOM_INF_NAME = 'zoom_installer.inf'
/** Where the runner leaves the game's executable, once found: `C:\rakun_exe.txt` */
export const ZOOM_EXE_NAME = 'rakun_exe.txt'
