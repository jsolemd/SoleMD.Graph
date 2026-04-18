"""
D11 · Manim smoke — trivial scene proving the Manim → .mp4 → publish path.

Render (from SoleMD.Make root):
    uv run manim -qm content/graph/components/_smoke/manim/trivial_scene.py SmokeScene

Output lands under `media/videos/trivial_scene/<quality>/SmokeScene.mp4`;
`ManimEngine.render()` moves it to the final output path. After publish,
the .mp4 is served from `/animations/_smoke/manim/SmokeScene.mp4` on the
Graph side (routed into /public/ by the publisher's PUBLIC_EXTS rule).
"""
from manim import (
    UP,
    Circle,
    DrawBorderThenFill,
    FadeIn,
    FadeOut,
    Scene,
    Text,
    Write,
    config,
)

# Brand palette override (matches SoleMD.Graph globals.css)
config.background_color = "#fafafa"
config.frame_rate = 30

SOFT_PINK = "#e0aed8"
SOFT_LAVENDER = "#d8bee9"
MUTED_INDIGO = "#747caa"
DARK = "#1a1b1e"


class SmokeScene(Scene):
    def construct(self) -> None:
        title = Text("manim smoke", font_size=40, color=DARK)
        title.to_edge(UP, buff=1)

        circle = Circle(
            radius=1.3,
            stroke_color=MUTED_INDIGO,
            fill_color=SOFT_PINK,
            fill_opacity=0.75,
            stroke_width=4,
        )

        label = Text("SoleMD", font_size=30, color=DARK, weight="MEDIUM")
        label.move_to(circle.get_center())

        self.play(FadeIn(title), run_time=0.5)
        self.play(DrawBorderThenFill(circle), run_time=1.2)
        self.play(Write(label), run_time=0.8)
        self.wait(0.3)
        self.play(
            circle.animate.scale(1.12).set_fill(SOFT_LAVENDER, opacity=0.75),
            run_time=0.6,
        )
        self.play(
            circle.animate.scale(1 / 1.12).set_fill(SOFT_PINK, opacity=0.75),
            run_time=0.6,
        )
        self.wait(0.4)
        self.play(FadeOut(title), FadeOut(circle), FadeOut(label), run_time=0.5)
