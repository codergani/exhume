// Type-only stub — full implementation in task 16 (optional).

export interface OutdatedDep {
  name: string
  current: string   // version range from package.json, e.g. "^17.0.0"
  latest: string    // latest version from npm registry, e.g. "18.3.1"
  majorsBehind: number
}

export interface DepRotReport {
  packageName: string
  dependenciesChecked: number
  outdatedDeps: OutdatedDep[]
  skipped: boolean
  skipReason: string | undefined
}
