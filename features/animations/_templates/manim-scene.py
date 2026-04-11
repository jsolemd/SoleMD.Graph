"""
Manim scene template — matched to the SoleMD.Make brand config.

Render:
    uv run --extra manim manim -qm content/graph/components/.../scene.py SceneName

Output lands as .mp4 next to source; publish with:
    make graph publish <category>/<scene-dir>
"""
from manim import (
    BLACK,
    Create,
    FadeIn,
    Rectangle,
    Scene,
    Text,
    config,
)

# Brand config override — apply once per scene module.
config.background_color = "#fafafa"
config.frame_rate = 30

PRIMARY = "#747caa"   # muted-indigo
ACCENT = "#a8c5e9"    # soft-blue
TEXT_COLOR = "#1a1b1e"


class TemplateScene(Scene):
    def construct(self) -> None:
        title = Text("SoleMD", color=TEXT_COLOR, font="Inter", weight="MEDIUM")
        title.scale(1.2)
        self.play(FadeIn(title), run_time=0.6)

        box = Rectangle(
            width=4.0, height=2.4, color=PRIMARY, stroke_width=3, fill_color=ACCENT,
            fill_opacity=0.2,
        )
        box.next_to(title, direction=[0, -1, 0], buff=0.8)
        self.play(Create(box), run_time=0.8)

        self.wait(0.5)
