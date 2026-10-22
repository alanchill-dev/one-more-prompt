import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { WindowResizeHandles } from "@/components/window-resize-handles"

describe("WindowResizeHandles", () => {
  it("does not render manual resize hit zones", () => {
    const { container } = render(<WindowResizeHandles />)

    expect(container).toBeEmptyDOMElement()
  })
})
