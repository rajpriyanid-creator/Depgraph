"""
Tiny demo service used by Warden's own test suite and the live demo
(design doc §11: "Pre-seed Firestore with a small parsed call graph of
one sample repo" / §12: "a real 3am page").

Deliberately small — per design-doc §15's risk mitigation ("Knowledge
graph expensive to build for a large repo -> scope the demo repo
intentionally small") — this is the exact repo Warden's CodeGraphBuilder
parses and the exact repo the patch action's real pytest run executes
against.

`divide` ships with an intentional bug: it does not guard against a zero
denominator, so `test_divide_by_zero` below fails on a clean checkout.
That failing test is the trigger signal for the "code bug -> patch -> PR"
half of the two-incident demo (design doc §12).
"""

from __future__ import annotations


def add(a: float, b: float) -> float:
    return a + b


def divide(a: float, b: float) -> float:
    if b == 0:
        return 0.0
    return a / b


def average(values: list[float]) -> float:
    if not values:
        return 0.0
    total = 0.0
    for v in values:
        total = add(total, v)
    return divide(total, len(values))