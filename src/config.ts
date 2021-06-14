import * as vscode from 'vscode'

interface Config {
  showUpdatesAtStart: boolean
  skipNpmConfig: boolean
  majorUpgradeColorOverwrite: string
  minorUpgradeColorOverwrite: string
  patchUpgradeColorOverwrite: string
  prereleaseUpgradeColorOverwrite: string
  ignorePatterns: string[]
}

let currentConfig: Config | undefined

export const getConfig = (): Config => {
  if (currentConfig === undefined) {
    reloadConfig()
  }
  return currentConfig as Config
}

export const reloadConfig = () => {
  const config = vscode.workspace.getConfiguration('package-json-upgrade')
  const newConfig: Config = {
    ignorePatterns: config.get<string[]>('ignorePatterns') ?? [],
    showUpdatesAtStart: config.get<boolean>('showUpdatesAtStart') === true,
    skipNpmConfig: config.get<boolean>('skipNpmConfig') === true,
    majorUpgradeColorOverwrite: config.get<string>('majorUpgradeColorOverwrite') ?? '',
    minorUpgradeColorOverwrite: config.get<string>('minorUpgradeColorOverwrite') ?? '',
    patchUpgradeColorOverwrite: config.get<string>('patchUpgradeColorOverwrite') ?? '',
    prereleaseUpgradeColorOverwrite: config.get<string>('prereleaseUpgradeColorOverwrite') ?? '',
  }

  currentConfig = newConfig
}
