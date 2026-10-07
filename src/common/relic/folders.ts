/** The folders inside a folder, for a client that lets the user pick one */
export type FolderListing = {
  path: string
  /** `null` at the root of the disk */
  parent: string | null
  folders: string[]
}
