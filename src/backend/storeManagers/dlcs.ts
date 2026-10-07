/**
 * Whether an install brings the DLCs: all of them, unless the client sent an
 * empty list. GOG can also install only some; legendary can only do all or none.
 */
export function wantsDlcs(installDlcs?: string[]): boolean {
  return installDlcs === undefined || installDlcs.length > 0
}
