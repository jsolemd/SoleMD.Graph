/**
 * @jest-environment jsdom
 */
import { fireEvent, render } from "@testing-library/react";
import { FloatingHoverCard } from "../FloatingHoverCard";

describe("FloatingHoverCard", () => {
  it("uses shared hover-card chrome and remains interactive", () => {
    const handlePointerEnter = jest.fn();
    const handlePointerLeave = jest.fn();

    const { getByText } = render(
      <FloatingHoverCard
        x={18}
        y={42}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
      >
        <div>Hover content</div>
      </FloatingHoverCard>,
    );

    const card = getByText("Hover content").parentElement as HTMLDivElement;

    expect(card.style.top).toBe("42px");
    expect(card.style.left).toBe("18px");
    expect(card.style.transform).toBe("translateY(-100%)");
    expect(card.style.pointerEvents).toBe("auto");

    fireEvent.pointerEnter(card);
    fireEvent.pointerLeave(card);

    expect(handlePointerEnter).toHaveBeenCalledTimes(1);
    expect(handlePointerLeave).toHaveBeenCalledTimes(1);
  });
});
