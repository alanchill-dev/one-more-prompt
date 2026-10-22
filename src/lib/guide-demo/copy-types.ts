export type GuideStepCopy = {
  title: string
  body: string
  points?: readonly (readonly [string, string])[]
}

export type GuideCopy = {
  stages: readonly [string, string, string]
  steps: readonly GuideStepCopy[]
  chrome: {
    exit: string
    skip: string
    close: string
    retry: string
    failure: string
    completedTask: string
    panKeyboard: string
    zoomKeyboard: string
    backToOpening: string
    previous: string
    finish: string
    continue: string
    next: string
    demoMode: string
    demoDetail: string
    demoAccount: string
  }
  welcome: {
    kicker: string
    range: string
    title: string
    body: string
    stageDetails: readonly [string, string, string]
    stepsUnit: string
    explore: string
    start: string
  }
  finishCard: {
    kicker: string
    title: string
    body: string
    route: readonly [string, string, string]
    returnToWorkspace: string
  }
}
