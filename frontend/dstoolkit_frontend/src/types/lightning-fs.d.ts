/**
 * @isomorphic-git/lightning-fs 没有自带类型声明，这里声明本仓库用到的最小 API 面。
 */
declare module '@isomorphic-git/lightning-fs' {
  export interface LFsPromises {
    readFile(filepath: string, opts?: { encoding?: string }): Promise<Uint8Array | string>
    writeFile(filepath: string, data: string | Uint8Array, opts?: Record<string, unknown>): Promise<void>
    unlink(filepath: string): Promise<void>
    readdir(filepath: string): Promise<string[]>
    mkdir(filepath: string): Promise<void>
    rmdir(filepath: string): Promise<void>
    rename(oldPath: string, newPath: string): Promise<void>
    stat(filepath: string): Promise<{
      isDirectory(): boolean
      isFile(): boolean
      size: number
    }>
    lstat(filepath: string): Promise<{
      isDirectory(): boolean
      isFile(): boolean
      size: number
    }>
    readlink(filepath: string): Promise<string>
    symlink(target: string, filepath: string): Promise<void>
    backFile(filepath: string, opts?: Record<string, unknown>): Promise<void>
    flush(): Promise<void>
    init(name: string, opts?: Record<string, unknown>): Promise<void>
  }

  export default class LightningFS {
    constructor(name: string, opts?: { wipe?: boolean; url?: string; filestore?: unknown; lock?: unknown })
    promises: LFsPromises
    init(name: string, opts?: Record<string, unknown>): void
    flush(): void
  }
}
