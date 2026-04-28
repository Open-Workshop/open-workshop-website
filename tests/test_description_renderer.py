from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from description_renderer import render_description_html


class DescriptionRendererTests(unittest.TestCase):
    def test_renders_inline_and_block_bbcode(self) -> None:
        self.assertEqual(render_description_html("[b]Bold[/b]"), "<p><strong>Bold</strong></p>")
        self.assertEqual(
            render_description_html("[code]\nif a < b:\n  print(a)\n[/code]"),
            "<pre><code>if a &lt; b:\n  print(a)</code></pre>",
        )
        self.assertEqual(
            render_description_html("[quote=Cat]Hello[/quote]"),
            "<blockquote><p><strong>Cat</strong></p><p>Hello</p></blockquote>",
        )
        self.assertEqual(
            render_description_html("[list]\n[*] first\n[*] [b]second[/b]\n[/list]"),
            "<ul><li>first</li><li><strong>second</strong></li></ul>",
        )
        self.assertEqual(
            render_description_html("https://example.com"),
            '<p><a class="tag-link" href="https://example.com">example.com</a></p>',
        )


if __name__ == "__main__":
    unittest.main()
