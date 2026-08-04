import json
import re
from collections.abc import Mapping

_VARIABLE = re.compile(r"\{\{\s*([A-Za-z_][\w-]*(?:\.[\w-]+)*)\s*\}\}")


def render_template(template: str, scope: Mapping[str, object]) -> tuple[str, list[str]]:
    """Substitute `{{ dotted.path }}` references from `scope`.

    Unresolvable references render as empty strings and are reported back so the caller can
    surface them in node logs instead of failing the run.
    """
    missing: list[str] = []

    def resolve(match: re.Match[str]) -> str:
        path = match.group(1)
        value: object = scope
        for part in path.split("."):
            if isinstance(value, Mapping) and part in value:
                value = value[part]
            else:
                missing.append(path)
                return ""
        if isinstance(value, str):
            return value
        return json.dumps(value, ensure_ascii=False, default=str)

    return _VARIABLE.sub(resolve, template), missing
