# Accessibility Screen Reader Checklist

Status: QA checklist for manual NVDA and VoiceOver passes.

Automated coverage runs through `npm run test:a11y` using axe on core public and victim-entry pages. Manual assistive technology testing is still required before production certification.

## Required Tools

- NVDA on Windows with Firefox or Chrome.
- VoiceOver on macOS or iOS with Safari.
- Keyboard-only navigation.

## Pages

- Landing page.
- Registration age gate.
- Minor support page.
- URL submission page.
- Case dashboard.
- Support resources page.
- FAQ page.
- Privacy page.

## Checks

- Page has one clear main heading.
- Landmarks are discoverable: header, navigation, main, footer.
- Focus order follows visual order.
- All controls have accessible names.
- Language toggle announces state and result.
- Support panel opens, traps focus logically, and closes by button and Escape.
- Forms announce validation errors.
- Age gate can be completed without a mouse.
- Minor pathway does not expose URL submission controls.
- Links with phone numbers announce the service name and number.
- Tables in dashboards announce row and column context.

## Result Recording

Record tester, tool, browser, date, page, result, and any blocker. P1/P2 issues must be fixed before public launch.
