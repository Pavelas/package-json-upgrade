import * as vscode from 'vscode'
import { decorateDiscreet, getDecoratorForUpdate } from './decorations'
import { getIgnorePattern, isDependencyIgnored } from './ignorePattern'
import { getCachedNpmData, getPossibleUpgrades, refreshPackageJsonData } from './npm'
import { DependencyGroups, getDependencyInformation, isPackageJson } from './packageJson'
import { AsyncState } from './types'
import { TextEditorDecorationType } from 'vscode'
import { getConfig } from './config'

export const handleFileDecoration = (document: vscode.TextDocument, showDecorations: boolean) => {
  if (showDecorations === false) {
    clearDecorations()
    return
  }

  if (isPackageJson(document)) {
    void loadDecoration(document)
  }
}

// TODO maybe have cooler handling of decorationtypes? Investigate!
let currentDecorationTypes: vscode.TextEditorDecorationType[] = []

export const clearDecorations = () => {
  currentDecorationTypes.forEach((d) => d.dispose())
  currentDecorationTypes = []
}

const loadDecoration = async (document: vscode.TextDocument) => {
  const text = document.getText()
  const dependencyGroups = getDependencyInformation(text)

  const textEditor = getTextEditorFromDocument(document)
  if (textEditor === undefined) {
    return
  }

  const promises = refreshPackageJsonData(document.getText(), document.uri.fsPath)

  try {
    await Promise.race([...promises, Promise.resolve()])
  } catch (e) {
    //
  }

  // initial paint
  paintDecorations(document, dependencyGroups, true)

  return waitForPromises(promises, document, dependencyGroups)
}

const waitForPromises = async (
  promises: Promise<void>[],
  document: vscode.TextDocument,
  dependencyGroups: DependencyGroups[],
) => {
  let settledCount = 0

  if (promises.length === 0) {
    return
  }

  // TODO update more frequently when there are fewer promises
  promises.forEach((promise) => {
    void promise
      .then(() => {
        settledCount++
        if (settledCount % 10 === 0 && settledCount !== promises.length) {
          paintDecorations(document, dependencyGroups, true)
        }
      })
      .catch(() => {
        //
      })
  })

  await Promise.allSettled(promises)
  return paintDecorations(document, dependencyGroups, false)
}

const paintDecorations = (
  document: vscode.TextDocument,
  dependencyGroups: DependencyGroups[],
  stillLoading: boolean,
) => {
  const textEditor = getTextEditorFromDocument(document)
  if (textEditor === undefined) {
    return
  }

  const ignorePatterns = getIgnorePattern()

  clearDecorations()

  if (stillLoading) {
    paintLoadingOnDependencyGroups(dependencyGroups, document, textEditor)
  }

  const dependencies = dependencyGroups.map((d) => d.deps).flat()

  dependencies.forEach((dep) => {
    if (isDependencyIgnored(dep.dependencyName, ignorePatterns)) {
      return
    }

    const lineText = document.lineAt(dep.line).text

    const range = new vscode.Range(
      new vscode.Position(dep.line, lineText.length),
      new vscode.Position(dep.line, lineText.length),
    )

    const npmCache = getCachedNpmData(dep.dependencyName)
    if (npmCache === undefined) {
      return
    }
    if (npmCache.asyncstate === AsyncState.Rejected) {
      const notFoundDecoration = decorateDiscreet('Dependency not found')
      textEditor.setDecorations(notFoundDecoration, [
        {
          range,
        },
      ])
      currentDecorationTypes.push(notFoundDecoration)
      return
    }

    if (npmCache.item === undefined) {
      const msUntilRowLoading = getConfig().msUntilRowLoading
      if (
        msUntilRowLoading !== 0 &&
        (msUntilRowLoading < 100 ||
          npmCache.startTime + getConfig().msUntilRowLoading < new Date().getTime())
      ) {
        const decorator = decorateDiscreet('Loading...')
        setDecorator(decorator, textEditor, range)
      }
      return
    }

    const possibleUpgrades = getPossibleUpgrades(
      npmCache.item.npmData,
      dep.currentVersion,
      dep.dependencyName,
    )

    let decorator: TextEditorDecorationType | undefined
    if (possibleUpgrades.major !== undefined) {
      // TODO add info about patch version?
      decorator = getDecoratorForUpdate(
        'major',
        possibleUpgrades.major.version,
        possibleUpgrades.existingVersion,
      )
    } else if (possibleUpgrades.minor !== undefined) {
      decorator = getDecoratorForUpdate(
        'minor',
        possibleUpgrades.minor.version,
        possibleUpgrades.existingVersion,
      )
    } else if (possibleUpgrades.patch !== undefined) {
      decorator = getDecoratorForUpdate(
        'patch',
        possibleUpgrades.patch.version,
        possibleUpgrades.existingVersion,
      )
    } else if (possibleUpgrades.prerelease !== undefined) {
      decorator = getDecoratorForUpdate(
        'prerelease',
        possibleUpgrades.prerelease.version,
        possibleUpgrades.existingVersion,
      )
    } else if (possibleUpgrades.validVersion === false) {
      decorator = decorateDiscreet('Failed to parse version')
    }

    setDecorator(decorator, textEditor, range)
  })
}

const paintLoadingOnDependencyGroups = (
  dependencyGroups: DependencyGroups[],
  document: vscode.TextDocument,
  textEditor: vscode.TextEditor,
) => {
  dependencyGroups.forEach((lineLimit) => {
    const lineText = document.lineAt(lineLimit.startLine).text
    const range = new vscode.Range(
      new vscode.Position(lineLimit.startLine, lineText.length),
      new vscode.Position(lineLimit.startLine, lineText.length),
    )
    const loadingUpdatesDecoration = decorateDiscreet('Loading updates...')
    setDecorator(loadingUpdatesDecoration, textEditor, range)
  })
}

const setDecorator = (
  decorator: TextEditorDecorationType | undefined,
  textEditor: vscode.TextEditor,
  range: vscode.Range,
) => {
  if (decorator === undefined) {
    return
  }
  currentDecorationTypes.push(decorator)
  textEditor.setDecorations(decorator, [
    {
      range,
    },
  ])
}

const getTextEditorFromDocument = (document: vscode.TextDocument) => {
  return vscode.window.visibleTextEditors.find((textEditor) => {
    return textEditor.document === document
  })
}
