"""plan_analyzer : analyse de plans électriques PDF (vectoriels).

Le module lit la légende du plan, reconstruit la géométrie exacte de chaque
symbole, puis compte toutes ses occurrences sur le plan (par niveau et par
pièce). Il signale les symboles de couleur différente (variantes hors légende)
et les formes non reconnues afin qu'un humain puisse trancher.
"""

from .analyzer import analyze

__all__ = ["analyze", "__version__"]
__version__ = "0.1.0"
