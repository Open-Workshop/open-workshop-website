import unittest

from flask import render_template

import app_config
import main


class InitialStylesTests(unittest.TestCase):
    def test_base_layout_is_styled_before_external_styles_arrive(self):
        with main.app.test_request_context('/'):
            html = render_template(
                'apis.html', ow=app_config.PUBLIC_CONFIG, user_profile=None,
                session_access=None,
            )

        head = html.split('</head>', 1)[0]
        inline = head.split('<style>', 1)[1].split('</style>', 1)[0]
        # These rules prevent a white page, expanded menus and oversized footer
        # icons if an extension forces layout before other CSS has loaded.
        for selector in ('body {', 'header .header__inner', 'cookies {',
                         '.phone-menu', 'footer a svg'):
            self.assertIn(selector, inline)
        self.assertNotIn('@import', inline)


if __name__ == '__main__':
    unittest.main()
