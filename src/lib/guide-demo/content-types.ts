export type GuideDemoContent = {
  projectNames: readonly string[]
  sessionTitles: Record<string, string>
  projectPrompts: readonly (readonly string[])[]
  featuredPrompt: string
  featuredPromptLead: string
  agents: {
    main: string
    worker: string
    featuredWorker: string
    reviewer: string
    workerRole: string
    reviewerRole: string
  }
}
