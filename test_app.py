from app import add, average, divide


def test_add():
    assert add(2, 3) == 5


def test_divide_normal():
    assert divide(10, 2) == 5


def test_divide_by_zero():
    # This is the failing test Warden's webhook signal describes. It
    # fails against the shipped `app.py` and passes once Warden's patch
    # action generates and verifies a fix.
    assert divide(10, 0) == 0


def test_average():
    assert average([2.0, 4.0, 6.0]) == 4.0
