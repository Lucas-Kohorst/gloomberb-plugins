/**
 * External link text component.
 *
 * The first-party `ExternalLinkText` lives under the app's internal
 * `components/ui/external-link` and the public surface only exposes
 * `openUrl`, so this plugin renders its own underlined, clickable link text
 * backed by `openUrl` from `gloomberb/components`.
 */
import { Text, TextAttributes } from "gloomberb/ui";
import { openUrl } from "gloomberb/components";
import { colors } from "gloomberb/theme";

export function ExternalLinkText({
  url,
  label,
  color = colors.textBright,
}: {
  url: string;
  label?: string;
  color?: string;
}) {
  return (
    <Text
      fg={color}
      attributes={TextAttributes.UNDERLINE}
      onMouseDown={(event: { preventDefault?: () => void; stopPropagation?: () => void }) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        openUrl(url);
      }}
    >
      {label ?? url}
    </Text>
  );
}
