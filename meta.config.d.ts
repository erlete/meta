export interface Directories {
  base?: string
  paths: {
    coreSchemas: string
    schemas: string
    versions: string
  }
}

export interface Urls {
  base: string
  paths: {
    core: string
    versions: string
  }
}

export interface Metadata {
  repositoryUrl: string
  license: string
  authors: string[]
  owners: string[]
  defaultStatus: string
}

export interface Config {
  dirs: Directories
  urls: Urls
  metadata: Metadata
}
