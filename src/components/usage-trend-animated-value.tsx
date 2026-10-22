import { useLayoutEffect, useState } from "react"
import { cn } from "@/lib/utils"

type ValueTransition = {
  current: string
  previous: string | null
  revision: number
}

type UsageTrendAnimatedValueProps = {
  value: string
  className?: string
  magnitudeSpacing?: boolean
  animateInitial?: boolean
}

/** Keeps unchanged characters still while changed characters replace one another in place. */
export function UsageTrendAnimatedValue({
  value,
  className,
  magnitudeSpacing = false,
  animateInitial = false,
}: UsageTrendAnimatedValueProps) {
  const [transition, setTransition] = useState<ValueTransition>({
    current: value,
    previous: null,
    revision: 0,
  })

  useLayoutEffect(() => {
    setTransition((current) => current.current === value
      ? current
      : {
          current: value,
          previous: current.current,
          revision: current.revision + 1,
        })
  }, [value])

  const previous = transition.previous
  const currentCharacters = Array.from(transition.current)
  const previousCharacters = previous == null ? [] : Array.from(previous)
  const lengthChanged = previous != null && previousCharacters.length !== currentCharacters.length
  const sharedPrefixLength = lengthChanged
    ? currentCharacters.findIndex((character, index) => previousCharacters[index] !== character)
    : -1
  const stablePrefixLength = lengthChanged
    ? (sharedPrefixLength === -1 ? Math.min(previousCharacters.length, currentCharacters.length) : sharedPrefixLength)
    : 0
  const unchangedCharacters = currentCharacters.map((character, index) => previous == null
    || (lengthChanged ? index < stablePrefixLength : character === previousCharacters[index]))
  const lastEnteringIndex = unchangedCharacters.lastIndexOf(false)

  function finishTransition() {
    const revision = transition.revision
    setTransition((current) => current.revision === revision && current.previous != null
      ? { ...current, previous: null }
      : current)
  }

  return (
    <span className={cn("trend-live-number", className)} data-testid="usage-trend-live-number">
      <span className="sr-only">{transition.current}</span>
      {previous != null ? (
        <span aria-hidden="true" className="trend-live-number-previous">
          {previousCharacters.map((character, index) => {
            const unchanged = unchangedCharacters[index] ?? false
            const isMagnitude = magnitudeSpacing
              && index === previousCharacters.length - 1
              && /^[KMBT]$/.test(character)
            return (
              <span className={cn("trend-live-number-character", isMagnitude && "ml-[0.06em]")} key={`${transition.revision}:${index}`}>
                <span className={unchanged ? "invisible" : "trend-live-number-character-exit"}
                  data-trend-character-state={unchanged ? undefined : "exit"}
                  onAnimationEnd={lastEnteringIndex === -1 && index === previousCharacters.length - 1 ? finishTransition : undefined}>
                  {character}
                </span>
              </span>
            )
          })}
        </span>
      ) : null}
      <span aria-hidden="true" className="contents">
        {currentCharacters.map((currentCharacter, index) => {
          const unchanged = unchangedCharacters[index]
          const isMagnitude = magnitudeSpacing
            && index === currentCharacters.length - 1
            && /^[KMBT]$/.test(currentCharacter)
          const animationDelay = `${index * 24}ms`

          return (
            <span
              className={cn("trend-live-number-character", isMagnitude && "ml-[0.06em]")}
              data-character-index={index}
              data-testid={isMagnitude ? "usage-trend-primary-magnitude" : undefined}
              key={`${transition.revision}:${index}`}
            >
              {unchanged ? (
                <span
                  className={cn(animateInitial && transition.revision === 0 && "trend-live-number-character-enter")}
                  data-trend-character-state="stable"
                  style={animateInitial && transition.revision === 0 ? { animationDelay } : undefined}
                >
                  {currentCharacter}
                </span>
              ) : (
                <span className="trend-live-number-character-enter" data-trend-character-state="enter" style={{ animationDelay }}
                  onAnimationEnd={index === lastEnteringIndex ? finishTransition : undefined}>
                  {currentCharacter}
                </span>
              )}
            </span>
          )
        })}
      </span>
    </span>
  )
}
